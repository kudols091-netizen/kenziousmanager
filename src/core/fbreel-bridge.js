/**
 * fbreel-bridge.js - Native Engine Bridge cho Kenzious Facebook Reel
 * Cung cấp toàn bộ API cấp thấp thay thế Extension Chrome:
 * - cloneFetch: HTTP Request vượt CORS với Cookie & Proxy
 * - fbLogin: Giả lập Android FB4A Katana lấy token EAAAAU + Cookie phiên
 * - getTokenFromCookie: Trích xuất token từ Cookie qua OAuth / AdsManager
 * - get2faOtp: Tính toán mã xác thực 2FA TOTP RFC 6238
 * - checkUidLive: Kiểm tra nhanh trạng thái sống/chết của UID qua avatar redirect
 * - uploadPhoto: Tải ảnh Avatar / Cover cho Page
 * - uploadReelChunk: Upload video Reel phân mảnh
 */

const crypto = require('crypto');

const proxyNet = require('./proxy-net');

/* ── Proxy theo clone ────────────────────────────────────────────────────────
 * Renderer (tab Clone / Reel) đồng bộ danh sách { uid, proxy, tokens[] } của các clone có proxy.
 * Mọi request mang cookie c_user hoặc access token của clone đó sẽ TỰ ĐỘNG đi qua proxy của clone,
 * kể cả ở những chỗ gọi EB.cloneFetch mà không truyền proxy. Proxy lỗi → request lỗi (không rơi về IP máy).
 */
const cloneProxySources = new Map(); // source -> { byUid: Map<uid, proxy>, byToken: Map<token, proxy> }

function setCloneProxies(source, entries) {
  const byUid = new Map();
  const byToken = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    const proxy = String((e && e.proxy) || '').trim();
    if (!proxy || !proxyNet.parseProxy(proxy)) continue;
    if (e.uid && /^\d{5,}$/.test(String(e.uid))) byUid.set(String(e.uid), proxy);
    for (const t of Array.isArray(e.tokens) ? e.tokens : []) {
      if (t && String(t).length > 20) byToken.set(String(t), proxy);
    }
  }
  cloneProxySources.set(String(source || 'default'), { byUid, byToken });
  return { uids: byUid.size, tokens: byToken.size };
}

function extractTokens({ url, headers, body }) {
  const tokens = [];
  try {
    const t = new URL(url).searchParams.get('access_token');
    if (t) tokens.push(t);
  } catch (_) {}
  for (const [k, v] of Object.entries(headers || {})) {
    const m = k.toLowerCase() === 'authorization' && String(v).match(/^(?:OAuth|Bearer)\s+(\S+)/i);
    if (m) tokens.push(m[1]);
  }
  if (typeof body === 'string') {
    const m = body.match(/(?:^|&)access_token=([^&]+)/);
    if (m) {
      try { tokens.push(decodeURIComponent(m[1])); } catch (_) { tokens.push(m[1]); }
    }
  }
  return tokens;
}

function findCloneProxy({ uid, cookie, url, headers, body } = {}) {
  const cUser = uid || (String(cookie || '').match(/(?:^|;\s*)c_user=(\d+)/) || [])[1];
  const tokens = extractTokens({ url, headers, body });
  for (const { byUid, byToken } of cloneProxySources.values()) {
    if (cUser && byUid.has(cUser)) return byUid.get(cUser);
    for (const t of tokens) if (byToken.has(t)) return byToken.get(t);
  }
  return '';
}

const FB4A_APP_TOKEN = '350685531728|62f8ce9f74b12f84c123cc23437a4a32';
const FB4A_API_KEY = '882a8490361da98702bf97a021ddc14d';
const FB4A_SIG = '214049b9f17c38bd767de53752b53946';
const FB4A_UA = 'Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190705.08211809) [FBAN/FB4A;FBAV/417.0.0.33.65;FBPN/com.facebook.katana;FBLC/vi_VN;FBBV/480086274;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86:armeabi-v7a;FBDM/{density=1.5,width=1280,height=720};FB_FW/1;FBRV/0;]';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const reelBuffers = new Map(); // uploadId -> Array<Buffer>

// BigInt Helper Functions for RSA PKCS#1 v1.5 Encryption
function _fbaB64urlBig(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = Buffer.from(s, 'base64').toString('binary');
  let h = '0x';
  for (let i = 0; i < bin.length; i++) h += bin.charCodeAt(i).toString(16).padStart(2, '0');
  return BigInt(h);
}

function _fbaBytesBig(u8) {
  let h = '0x';
  for (let i = 0; i < u8.length; i++) h += u8[i].toString(16).padStart(2, '0');
  return u8.length ? BigInt(h) : 0n;
}

function _fbaBigBytes(b, len) {
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(b & 255n);
    b >>= 8n;
  }
  return out;
}

function _fbaModpow(base, exp, mod) {
  let r = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return r;
}

async function _fbaRsa(pem, dataBytes) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Buffer.from(b64, 'base64');
  let n = null, e = null;
  try {
    const keyObj = crypto.createPublicKey(pem);
    const jwk = keyObj.export({ format: 'jwk' });
    n = _fbaB64urlBig(jwk.n);
    e = _fbaB64urlBig(jwk.e);
  } catch (_) {
    let p = 0;
    while (p < der.length - 4) {
      if (der[p] === 0x02) {
        let len = der[p + 1];
        let off = p + 2;
        if (len & 0x80) {
          const nbytes = len & 0x7f;
          len = 0;
          for (let k = 0; k < nbytes; k++) len = (len << 8) | der[off++];
        }
        const val = der.slice(off, off + len);
        if (n === null && len > 64) n = _fbaBytesBig(val);
        else if (n !== null && e === null && len <= 4) {
          e = _fbaBytesBig(val);
          break;
        }
        p = off + len;
      } else {
        p++;
      }
    }
  }
  if (!n || !e) throw new Error('Không phân tích được RSA Public Key Facebook');
  const k = Math.ceil(n.toString(2).length / 8);
  const psLen = k - dataBytes.length - 3;
  if (psLen < 8) throw new Error('Dữ liệu RSA quá dài');
  const ps = new Uint8Array(psLen);
  crypto.getRandomValues(ps);
  for (let i = 0; i < psLen; i++) {
    while (ps[i] === 0) {
      const t = new Uint8Array(1);
      crypto.getRandomValues(t);
      ps[i] = t[0];
    }
  }
  const em = new Uint8Array(k);
  em[0] = 0; em[1] = 2;
  em.set(ps, 2);
  em[2 + psLen] = 0;
  em.set(dataBytes, 3 + psLen);
  return _fbaBigBytes(_fbaModpow(_fbaBytesBig(em), e, n), k);
}

async function _fbaEncPwd(password, proxy = '') {
  const url = `https://b-graph.facebook.com/pwd_key_fetch?version=2&flow=CONTROLLER_INITIALIZATION&method=GET&fb_api_req_friendly_name=pwdKeyFetch&fb_api_caller_class=com.facebook.auth.login.AuthOperations&access_token=${encodeURIComponent(FB4A_APP_TOKEN)}`;
  const resp = await proxyNet.proxyFetch(url, { method: 'POST', proxy });
  const kr = await resp.json();
  const pem = kr.public_key;
  const keyId = parseInt(kr.key_id || '25', 10);
  const randKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encRand = await _fbaRsa(pem, randKey);
  const t = Math.floor(Date.now() / 1000);
  
  const subtle = crypto.webcrypto.subtle;
  const aesKey = await subtle.importKey('raw', randKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const ctBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: Buffer.from(String(t)), tagLength: 128 },
    aesKey,
    Buffer.from(password)
  );
  const ct = new Uint8Array(ctBuf);
  const encPwd = ct.slice(0, ct.length - 16);
  const tag = ct.slice(ct.length - 16);
  const lenb = new Uint8Array([encRand.length & 255, (encRand.length >> 8) & 255]);
  const parts = [new Uint8Array([1, keyId]), iv, lenb, encRand, tag, encPwd];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  parts.forEach(p => { buf.set(p, o); o += p.length; });
  return `#PWD_FB4A:2:${t}:${Buffer.from(buf).toString('base64')}`;
}

async function get2faOtp(secret) {
  if (!secret) return '';
  const clean = String(secret).replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const v = alph.indexOf(clean[i]);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let j = 0; j + 8 <= bits.length; j += 8) {
    bytes.push(parseInt(bits.substr(j, 8), 2));
  }
  let counter = Math.floor(Date.now() / 1000 / 30);
  const cb = Buffer.alloc(8);
  for (let x = 7; x >= 0; x--) {
    cb[x] = counter & 255;
    counter = Math.floor(counter / 256);
  }
  const hmac = crypto.createHmac('sha1', Buffer.from(bytes));
  hmac.update(cb);
  const sig = hmac.digest();
  const off = sig[19] & 0xf;
  const code = ((sig[off] & 0x7f) << 24) | ((sig[off + 1] & 0xff) << 16) | ((sig[off + 2] & 0xff) << 8) | (sig[off + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function _fbaRand(n) {
  let s = '';
  const a = 'abcdef0123456789';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

/**
 * Đăng nhập Facebook Katana FB4A lấy Token EAAAAU
 */
async function fb4aLogin({ uid, password, secret }) {
  const cleanUid = String(uid || '').trim();
  const cleanPass = String(password || '').trim();
  const cleanSec = String(secret || '').replace(/\s/g, '');

  if (!cleanUid || !cleanPass) throw new Error('Thiếu UID hoặc Mật khẩu');

  const deviceId = crypto.randomUUID();
  const adid = crypto.randomUUID();
  const sfdi = crypto.randomUUID();
  const machineId = _fbaRand(24);
  const jazoest = String(Math.floor(10000 + Math.random() * 89999));
  const sim = String(Math.floor(1e19 + Math.random() * 8e18));
  const proxy = findCloneProxy({ uid: cleanUid });
  const encPwd = await _fbaEncPwd(cleanPass, proxy);

  async function postAuth(extra = {}) {
    const base = {
      format: 'json',
      email: cleanUid,
      password: encPwd,
      credentials_type: 'password',
      generate_session_cookies: '1',
      locale: 'vi_VN',
      client_country_code: 'VN',
      api_key: FB4A_API_KEY,
      access_token: FB4A_APP_TOKEN,
      adid: adid,
      device_id: deviceId,
      family_device_id: deviceId,
      secure_family_device_id: sfdi,
      sim_serials: `["${sim}"]`,
      machine_id: machineId,
      jazoest: jazoest,
      sig: FB4A_SIG
    };
    const bodyParams = new URLSearchParams(Object.assign(base, extra));
    const res = await proxyNet.proxyFetch('https://b-graph.facebook.com/auth/login', {
      proxy,
      method: 'POST',
      headers: {
        'User-Agent': FB4A_UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-fb-friendly-name': 'authenticate'
      },
      body: bodyParams.toString()
    });
    return await res.json();
  }

  let res = await postAuth();
  const ed = res && res.error && res.error.error_data;
  if (ed && ed.login_first_factor && ed.uid) {
    if (!cleanSec) throw new Error('Tài khoản có bảo mật 2FA nhưng chưa nhập mã bí mật 2FA Secret');
    const otpCode = await get2faOtp(cleanSec);
    res = await postAuth({
      credentials_type: 'two_factor',
      twofactor_code: otpCode,
      first_factor: ed.login_first_factor,
      userid: ed.uid,
      machine_id: ed.login_first_factor,
      generate_machine_id: '1',
      error_detail_type: 'button_with_disabled'
    });
  }

  if (res && res.access_token) {
    let cookie = '';
    if (res.session_cookies && res.session_cookies.length) {
      cookie = res.session_cookies.map(c => `${c.name}=${c.value}`).join('; ');
    }
    return {
      token: res.access_token,
      cookie: cookie,
      uid: String(res.uid || cleanUid)
    };
  }

  const errMsg = (res && res.error && (res.error.error_user_msg || res.error.message)) || 'Đăng nhập FB4A thất bại';
  throw new Error(errMsg);
}

/**
 * Thực hiện cloneFetch: HTTP Request với Cookie và vượt qua rào cản CORS
 */
async function cloneFetch({ url, cookie = '', options = {} }) {
  try {
    const cleanCookie = String(cookie || '')
      .replace(/[\r\n\t]/g, ' ')
      .replace(/[^\x20-\x7E]/g, '')
      .trim();

    const isFbWeb = url.includes('facebook.com') && !url.includes('b-graph.facebook.com') && !url.includes('graph.facebook.com');

    const defaultHeaders = isFbWeb ? {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': DESKTOP_UA
    } : {
      'User-Agent': url.includes('b-graph.facebook.com') ? FB4A_UA : DESKTOP_UA
    };

    const headers = Object.assign({}, defaultHeaders, options.headers || {});
    
    if (cleanCookie) {
      headers['Cookie'] = cleanCookie;
    }

    const proxy = options.proxy || findCloneProxy({ cookie: cleanCookie, url, headers, body: options.body });
    const res = await proxyNet.request(url, {
      method: options.method || 'GET',
      headers,
      body: options.body != null ? options.body : null,
      proxy
    });
    const text = res.body.toString('utf8');
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {
      try {
        const clean = text.replace(/^for\s*\(;;\);\s*/, '');
        json = JSON.parse(clean);
      } catch (__) {}
    }

    return {
      ok: res.ok,
      status: res.status,
      text: text,
      json: json,
      url: res.url,
      redirected: res.redirected,
      viaProxy: !!proxy
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      text: '',
      json: null,
      url: url,
      redirected: false,
      error: err.message || String(err)
    };
  }
}

/**
 * Kiểm tra UID Live công khai qua Facebook Picture Redirect
 */
async function checkUidLive(uid) {
  if (!uid || !/^\d{5,}$/.test(String(uid).trim())) {
    return { live: false, error: 'UID không hợp lệ' };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/${uid}/picture?type=normal`, {
      method: 'GET',
      redirect: 'manual'
    });
    const loc = res.headers.get('location') || '';
    const isSilhouette = /silhouette/i.test(loc);
    const isLive = (res.status === 302 && loc.includes('fbcdn.net') && !isSilhouette);
    return { live: isLive, status: res.status, location: loc };
  } catch (e) {
    return { live: false, error: e.message };
  }
}

/**
 * Lấy Access Token (Katana/EAAAAU/EAAB) từ Cookie Clone
 */
async function getTokenFromCookie({ cookie = '', proxy = '' }) {
  if (!cookie) throw new Error('Thiếu Cookie để trích xuất Token');
  proxy = proxy || findCloneProxy({ cookie });

  // Cách 1: Thử lấy OAuth Token Katana App ID 350685531728
  const oauthUrl = 'https://www.facebook.com/v11.0/dialog/oauth?client_id=350685531728&redirect_uri=https://www.facebook.com/connect/login_success.html&response_type=token&scope=email,public_profile';
  try {
    const res = await proxyNet.proxyFetch(oauthUrl, {
      proxy,
      method: 'GET',
      headers: {
        'Cookie': cookie,
        'User-Agent': FB4A_UA
      },
      redirect: 'manual'
    });

    const location = res.headers.get('location') || '';
    if (location && location.includes('access_token=')) {
      const match = location.match(/access_token=([^&]+)/);
      if (match && match[1]) return { token: match[1] };
    }
  } catch (_) {}

  // Cách 2: Quét EAAB từ Business Manager / Ads Manager
  const adsUrls = [
    'https://adsmanager.facebook.com/adsmanager/manage/campaigns',
    'https://business.facebook.com/content_management'
  ];
  for (const aUrl of adsUrls) {
    try {
      const r = await proxyNet.proxyFetch(aUrl, {
        proxy,
        headers: {
          'Cookie': cookie,
          'User-Agent': DESKTOP_UA
        }
      });
      const t = await r.text();
      const m = t.match(/EAAB[0-9A-Za-z]+/g);
      if (m && m.length) {
        const sorted = m.sort((x, y) => y.length - x.length);
        return { token: sorted[0] };
      }
    } catch (_) {}
  }

  throw new Error('Không thể tự động bóc tách Token từ Cookie. Hãy thử lấy bằng UID|Pass|2FA.');
}

/**
 * Upload Photo Avatar / Cover Page
 */
async function uploadPhoto({ url, cookie = '', b64 = '', fileName = 'photo.jpg', fileType = 'image/jpeg' }) {
  const buf = Buffer.from(b64, 'base64');
  const blob = new Blob([buf], { type: fileType });
  const fd = new FormData();
  fd.append('file', blob, fileName);

  // Dựng multipart (boundary + nội dung) bằng Request chuẩn rồi gửi qua proxyNet
  const multipart = new Request('https://upload.invalid/', { method: 'POST', body: fd });
  const body = Buffer.from(await multipart.arrayBuffer());

  const headers = {
    'User-Agent': DESKTOP_UA,
    'Content-Type': multipart.headers.get('content-type')
  };
  if (cookie) headers['Cookie'] = cookie;

  const proxy = findCloneProxy({ cookie, url, headers });
  const res = await proxyNet.request(url, { method: 'POST', headers, body, proxy, timeoutMs: 5 * 60 * 1000 });
  return { ok: res.ok, status: res.status, text: res.body.toString('utf8') };
}

/**
 * Upload Video Reel Chunk
 */
async function uploadReelChunk({ uploadId = 'r0', b64 = '', last = false, url = '', headers = {} }) {
  if (!reelBuffers.has(uploadId)) {
    reelBuffers.set(uploadId, []);
  }

  if (b64) {
    const chunkBuf = Buffer.from(b64, 'base64');
    reelBuffers.get(uploadId).push(chunkBuf);
  }

  if (!last) {
    return { ok: true, buffered: true };
  }

  const totalBuf = Buffer.concat(reelBuffers.get(uploadId) || []);
  reelBuffers.delete(uploadId);

  const reqHeaders = Object.assign({}, headers);
  const proxy = findCloneProxy({ url, headers: reqHeaders });
  const res = await proxyNet.request(url, {
    method: 'POST',
    headers: reqHeaders,
    body: totalBuf,
    proxy,
    timeoutMs: 20 * 60 * 1000
  });

  const text = res.body.toString('utf8');
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}

  return {
    ok: res.ok,
    status: res.status,
    text: text,
    json: json
  };
}

module.exports = {
  setCloneProxies,
  findCloneProxy,
  checkUidLive,
  cloneFetch,
  fb4aLogin,
  getTokenFromCookie,
  get2faOtp,
  uploadPhoto,
  uploadReelChunk
};
