/**
 * Proxy & HTTP dùng chung cho main process.
 *
 *  - parseProxy(): MỘT bộ phân tích cho mọi định dạng proxy trong app
 *      host:port | host:port:user:pass | user:pass:host:port | user:pass@host:port
 *      kèm tiền tố tuỳ chọn http:// https:// socks4:// socks5:// (socks5h://)
 *  - request()/proxyFetch(): gửi HTTP(S) qua proxy (HTTP CONNECT hoặc SOCKS, có user/pass).
 *      Cookie / Authorization CHỈ được gửi tới host thuộc Facebook và bị gỡ khi chuyển hướng
 *      sang domain khác. Có proxy mà proxy lỗi → báo lỗi, KHÔNG BAO GIỜ tự đi bằng IP máy.
 *  - toPlaywrightProxy() / prepareChromeProxy(): truyền proxy (kèm mật khẩu) cho trình duyệt.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const SUPPORTED_PROTOCOLS = ['http', 'https', 'socks4', 'socks5'];
// Chỉ các host này được nhận cookie / token của tài khoản
const CREDENTIAL_DOMAINS = ['facebook.com', 'messenger.com', 'instagram.com', 'workplace.com'];
const SOCKS_AUTH_UNSUPPORTED =
  'Chromium không hỗ trợ proxy SOCKS có mật khẩu. Hãy dùng proxy HTTP có mật khẩu, hoặc SOCKS không mật khẩu.';

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (_) { return s; }
}

function parseProxy(input) {
  if (!input) return null;

  if (typeof input === 'object') {
    return parseProxy(formatProxy({
      protocol: input.protocol,
      host: input.host,
      port: input.port,
      username: input.username || input.user || '',
      password: input.password || input.pass || ''
    }));
  }

  let s = String(input).trim();
  if (!s) return null;

  let protocol = 'http';
  const scheme = s.match(/^([a-z0-9]+):\/\//i);
  if (scheme) {
    protocol = scheme[1].toLowerCase();
    s = s.slice(scheme[0].length);
  }
  if (protocol === 'socks' || protocol === 'socks5h') protocol = 'socks5';
  if (protocol === 'socks4a') protocol = 'socks4';
  if (!SUPPORTED_PROTOCOLS.includes(protocol)) return null;

  let username = '';
  let password = '';
  const at = s.lastIndexOf('@');
  // Bắt đầu bằng host:port: → luôn là dạng host:port:user:pass (mật khẩu có thể chứa '@').
  // Ngược lại chỉ là user:pass@host:port khi phần sau '@' đúng là host:port.
  const startsWithHostPort = /^[^:@\s]+:\d{1,5}:/.test(s);
  if (at !== -1 && !startsWithHostPort && /^[^:@\s]+:\d+\/?$/.test(s.slice(at + 1))) {
    const cred = s.slice(0, at);
    s = s.slice(at + 1);
    const i = cred.indexOf(':');
    username = safeDecode(i === -1 ? cred : cred.slice(0, i));
    password = safeDecode(i === -1 ? '' : cred.slice(i + 1));
  }
  s = s.replace(/\/+$/, '');

  const parts = s.split(':');
  let host = '';
  let port = '';
  if (parts.length === 2) {
    [host, port] = parts;
  } else if (parts.length >= 4 && !username) {
    if (/^\d+$/.test(parts[1])) {
      // host:port:user:pass (mật khẩu có thể chứa ':')
      host = parts[0];
      port = parts[1];
      username = parts[2];
      password = parts.slice(3).join(':');
    } else if (parts.length === 4 && /^\d+$/.test(parts[3])) {
      // user:pass:host:port
      [username, password, host, port] = parts;
    } else {
      return null;
    }
  } else {
    return null;
  }

  const portNum = parseInt(port, 10);
  host = host.trim();
  if (!host || !/^[a-z0-9.\-\[\]:]+$/i.test(host) || !(portNum >= 1 && portNum <= 65535)) return null;

  return { protocol, host, port: portNum, username, password };
}

function formatProxy(p, { withAuth = true } = {}) {
  if (!p || !p.host || !p.port) return '';
  const proto = (p.protocol || 'http').toLowerCase();
  const auth = withAuth && p.username
    ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password || '')}@`
    : '';
  return `${proto}://${auth}${p.host}:${p.port}`;
}

// Hiển thị/ghi log: không bao giờ lộ mật khẩu
function maskProxy(raw) {
  const p = typeof raw === 'string' ? parseProxy(raw) : raw;
  if (!p) return '';
  return `${p.protocol}://${p.username ? p.username + ':***@' : ''}${p.host}:${p.port}`;
}

function hasSocksAuth(p) {
  return !!(p && p.username && p.protocol.startsWith('socks'));
}

function isCredentialHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return CREDENTIAL_DOMAINS.some(d => h === d || h.endsWith('.' + d));
}

const agentCache = new Map();
function createAgent(proxy, targetProtocol) {
  const p = typeof proxy === 'string' ? parseProxy(proxy) : proxy;
  if (!p) return null;
  const isHttpsTarget = targetProtocol === 'https:';
  const key = `${formatProxy(p)}|${isHttpsTarget}`;
  if (agentCache.has(key)) return agentCache.get(key);

  let agent;
  if (p.protocol.startsWith('socks')) {
    // socks5h / socks4a: phân giải DNS phía proxy, tránh lộ truy vấn DNS từ máy
    const scheme = p.protocol === 'socks5' ? 'socks5h' : 'socks4a';
    agent = new SocksProxyAgent(formatProxy({ ...p, protocol: scheme }));
  } else if (isHttpsTarget) {
    agent = new HttpsProxyAgent(formatProxy(p));
  } else {
    agent = new HttpProxyAgent(formatProxy(p));
  }
  agentCache.set(key, agent);
  return agent;
}

function decodeBody(buf, encoding) {
  const enc = String(encoding || '').toLowerCase();
  try {
    if (enc.includes('br')) return zlib.brotliDecompressSync(buf);
    if (enc.includes('gzip')) return zlib.gunzipSync(buf);
    if (enc.includes('deflate')) {
      try { return zlib.inflateSync(buf); } catch (_) { return zlib.inflateRawSync(buf); }
    }
  } catch (_) {}
  return buf;
}

const CREDENTIAL_HEADERS = ['cookie', 'authorization'];
const BODY_HEADERS = ['content-type', 'content-length', 'transfer-encoding'];

function stripHeaders(headers, names) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!names.includes(k.toLowerCase())) out[k] = v;
  }
  return out;
}

function hasHeader(headers, name) {
  return Object.keys(headers).some(k => k.toLowerCase() === name);
}

/**
 * HTTP(S) request (tuỳ chọn qua proxy), tự theo redirect.
 * @returns {Promise<{ok,status,url,redirected,headers,body:Buffer}>}
 */
async function request(urlStr, opts = {}) {
  const proxy = opts.proxy ? (typeof opts.proxy === 'string' ? parseProxy(opts.proxy) : opts.proxy) : null;
  if (opts.proxy && !proxy) throw new Error(`Định dạng proxy không hợp lệ: ${maskProxy(opts.proxy) || '(trống)'}`);

  const maxRedirects = opts.maxRedirects !== undefined ? opts.maxRedirects : 10;
  const timeoutMs = opts.timeoutMs || 60000;

  let url = new URL(urlStr);
  let method = (opts.method || 'GET').toUpperCase();
  let body = opts.body == null ? null : (Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(String(opts.body)));
  let headers = { ...(opts.headers || {}) };
  if (!hasHeader(headers, 'accept-encoding')) headers['Accept-Encoding'] = 'gzip, deflate, br';

  for (let hop = 0; ; hop++) {
    // Cookie/token của tài khoản không bao giờ rời khỏi domain Facebook
    let sendHeaders = isCredentialHost(url.hostname) ? { ...headers } : stripHeaders(headers, CREDENTIAL_HEADERS);
    if (body) {
      sendHeaders = stripHeaders(sendHeaders, ['content-length']);
      sendHeaders['Content-Length'] = String(body.length);
    }

    const res = await new Promise((resolve, reject) => {
      const lib = url.protocol === 'http:' ? http : https;
      const req = lib.request(url, {
        method,
        headers: sendHeaders,
        agent: proxy ? createAgent(proxy, url.protocol) : undefined
      }, (r) => {
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, raw: Buffer.concat(chunks) }));
        r.on('error', reject);
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`Hết thời gian chờ (${Math.round(timeoutMs / 1000)}s)`)));
      req.on('error', (err) => {
        reject(proxy ? new Error(`Lỗi proxy ${maskProxy(proxy)}: ${err.message}`) : err);
      });
      if (body) req.write(body);
      req.end();
    });

    if (res.status === 407) {
      throw new Error(`Proxy ${maskProxy(proxy)} từ chối xác thực (407) — kiểm tra user/pass`);
    }

    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location && hop < maxRedirects) {
      const next = new URL(res.headers.location, url);
      if ((res.status === 303 && method !== 'HEAD') || ((res.status === 301 || res.status === 302) && method === 'POST')) {
        method = 'GET';
        body = null;
        headers = stripHeaders(headers, BODY_HEADERS);
      }
      url = next;
      continue;
    }

    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      url: url.toString(),
      redirected: hop > 0,
      headers: res.headers,
      body: decodeBody(res.raw, res.headers['content-encoding'])
    };
  }
}

/**
 * Giao diện giống fetch() để thay thế tại chỗ: init.proxy = chuỗi proxy (tuỳ chọn).
 */
async function proxyFetch(url, init = {}) {
  const res = await request(String(url), {
    method: init.method,
    headers: init.headers,
    body: init.body,
    proxy: init.proxy,
    timeoutMs: init.timeoutMs,
    maxRedirects: init.redirect === 'manual' ? 0 : undefined
  });
  return {
    ok: res.ok,
    status: res.status,
    url: res.url,
    redirected: res.redirected,
    headers: {
      get: (name) => {
        const v = res.headers[String(name).toLowerCase()];
        return v === undefined ? null : (Array.isArray(v) ? v.join(', ') : String(v));
      }
    },
    text: async () => res.body.toString('utf8'),
    json: async () => JSON.parse(res.body.toString('utf8')),
    arrayBuffer: async () => res.body.buffer.slice(res.body.byteOffset, res.body.byteOffset + res.body.length)
  };
}

/**
 * Proxy cho Playwright (launchPersistentContext). Trả undefined nếu không có proxy.
 */
function toPlaywrightProxy(raw) {
  if (!raw || !String(raw).trim()) return undefined;
  const p = parseProxy(raw);
  if (!p) throw new Error(`Định dạng proxy không hợp lệ: ${maskProxy(raw) || raw}`);
  if (hasSocksAuth(p)) throw new Error(SOCKS_AUTH_UNSUPPORTED);
  const out = { server: formatProxy(p, { withAuth: false }) };
  if (p.username) {
    out.username = p.username;
    out.password = p.password;
  }
  return out;
}

/**
 * Proxy cho Chrome chạy trực tiếp (spawn + CDP). Chrome không nhận user/pass qua dòng lệnh,
 * nên với proxy có mật khẩu sẽ sinh một extension MV3 nhỏ trong profile để trả lời 407.
 * @returns {{ args: string[], extensionDir: string|null }}
 */
function prepareChromeProxy(raw, profileDir) {
  const extDir = path.join(profileDir, '.kz-proxy-auth');
  const removeExt = () => { try { fs.rmSync(extDir, { recursive: true, force: true }); } catch (_) {} };

  if (!raw || !String(raw).trim()) {
    removeExt();
    return { args: [], extensionDir: null };
  }
  const p = parseProxy(raw);
  if (!p) throw new Error(`Định dạng proxy không hợp lệ: ${maskProxy(raw) || raw}`);
  if (hasSocksAuth(p)) throw new Error(SOCKS_AUTH_UNSUPPORTED);

  const args = [`--proxy-server=${formatProxy(p, { withAuth: false })}`];
  if (!p.username) {
    removeExt();
    return { args, extensionDir: null };
  }

  fs.mkdirSync(extDir, { recursive: true });
  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'Kenzious Proxy Auth',
    version: '1.0.0',
    permissions: ['webRequest', 'webRequestAuthProvider'],
    host_permissions: ['<all_urls>'],
    background: { service_worker: 'background.js' }
  }, null, 2));
  fs.writeFileSync(path.join(extDir, 'background.js'),
    `const CREDS = ${JSON.stringify({ username: p.username, password: p.password })};\n` +
    `chrome.webRequest.onAuthRequired.addListener(\n` +
    `  (details, callback) => callback(details.isProxy ? { authCredentials: CREDS } : {}),\n` +
    `  { urls: ['<all_urls>'] },\n` +
    `  ['asyncBlocking']\n` +
    `);\n`);
  return { args, extensionDir: extDir };
}

module.exports = {
  CREDENTIAL_DOMAINS,
  SOCKS_AUTH_UNSUPPORTED,
  parseProxy,
  formatProxy,
  maskProxy,
  hasSocksAuth,
  isCredentialHost,
  createAgent,
  request,
  proxyFetch,
  toPlaywrightProxy,
  prepareChromeProxy
};
