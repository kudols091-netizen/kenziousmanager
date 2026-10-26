/**
 * pinterest-poster.js — Đăng Pin (ảnh/video) qua API nội bộ Pinterest + cookie nick.
 * Port từ extension PinBot (pin-session.js + video-post.js) sang Node:
 *   - chrome.cookies  -> tách csrftoken từ chuỗi cookie account
 *   - fetch(credentials:'include') -> proxyNet.proxyFetch(url, { headers:{Cookie}, proxy })
 *   - multipart (upload ảnh / S3 video) -> tự dựng body Buffer (buildMultipart)
 *
 * Luồng video pin: register upload -> POST file lên S3 -> poll tới 'succeeded' -> PinResource/create.
 * Luồng image pin: /upload-image/ -> PinResource/create.
 *
 * ponytail: đọc nguyên file video vào RAM để dựng multipart (đủ cho reel ngắn <~150MB);
 *           nếu cần video lớn hãy đổi sang stream upload.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const proxyNet = require('./proxy-net');
const storage = require('./storage');

const PIN = 'https://www.pinterest.com';
const SOURCE_URL = '%2Fpin-creation-tool%2F';
const RES_HEADERS = {
  'X-Pinterest-PWS-Handler': 'www/[username].js',
  'X-Pinterest-AppState': 'active',
  'X-APP-VERSION': 'ab12cd3'
};
const POLL_MS = 5000;
const MAX_WAIT_MS = 240000;
const XONG = /^(succeeded|success|ready|done|completed?)$/i;
const HONG = /^(failed|failure|error|rejected)$/i;

function ffmpegPath() {
  const s = storage.getSettings();
  if (s.ffmpegPath && fs.existsSync(s.ffmpegPath)) return s.ffmpegPath;
  const cands = [
    path.join(__dirname, '..', '..', 'bin', 'ffmpeg.exe'),
    process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe') : null
  ].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  return 'ffmpeg';
}

// Mảng cookie (account.cookies) -> chuỗi "name=value; ..." cho header Cookie (chỉ cookie Pinterest).
function cookieHeader(account) {
  const arr = Array.isArray(account && account.cookies) ? account.cookies : [];
  const seen = {};
  return arr
    .filter(c => c && c.name && (!c.domain || String(c.domain).includes('pinterest')))
    .filter(c => { if (seen[c.name]) return false; seen[c.name] = 1; return true; })
    .map(c => c.name + '=' + c.value)
    .join('; ');
}
function getCsrf(cookieStr) {
  const m = String(cookieStr || '').match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? m[1] : '';
}

function buildMultipart(fields, file) {
  const boundary = '----KZPin' + Math.random().toString(36).slice(2);
  const parts = [];
  for (const [k, v] of Object.entries(fields || {})) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v == null ? '' : v}\r\n`));
  }
  if (file && file.buffer) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`));
    parts.push(file.buffer);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function authHeaders(cookieStr, csrf) {
  return Object.assign({}, RES_HEADERS, {
    'Cookie': cookieStr,
    'X-CSRFToken': csrf,
    'X-Requested-With': 'XMLHttpRequest'
  });
}

async function resPost(ctx, resource, options) {
  const body = 'source_url=' + SOURCE_URL + '&data=' + encodeURIComponent(JSON.stringify({ options, context: {} }));
  const r = await proxyNet.proxyFetch(PIN + '/resource/' + resource + '/', {
    method: 'POST', proxy: ctx.proxy, timeoutMs: 45000,
    headers: Object.assign(authHeaders(ctx.cookie, ctx.csrf), { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }),
    body
  });
  let json = null; try { json = await r.json(); } catch (_) {}
  return { ok: r.ok, status: r.status, json };
}
async function resGet(ctx, resource, options) {
  const qs = 'source_url=' + SOURCE_URL + '&data=' + encodeURIComponent(JSON.stringify({ options, context: {} }));
  const r = await proxyNet.proxyFetch(PIN + '/resource/' + resource + '/?' + qs, {
    method: 'GET', proxy: ctx.proxy, timeoutMs: 30000, headers: authHeaders(ctx.cookie, ctx.csrf)
  });
  let json = null; try { json = await r.json(); } catch (_) {}
  return { ok: r.ok, status: r.status, json };
}
function resData(r) { return (r && r.json && r.json.resource_response && r.json.resource_response.data) || null; }
function resError(r) { return (r && r.json && r.json.resource_response && r.json.resource_response.error && r.json.resource_response.error.message) || ''; }

// Viewer context từ bootstrap trang chủ (__PWS_DATA__) -> username + appVersion.
async function getViewer(ctx) {
  const r = await proxyNet.proxyFetch(PIN + '/', { proxy: ctx.proxy, timeoutMs: 30000, headers: { 'Cookie': ctx.cookie, 'Accept': 'text/html' } });
  const html = await r.text();
  const m = html.match(/<script id="__PWS_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data; try { data = JSON.parse(m[1]); } catch (_) { return null; }
  const c = data.context || {};
  if (c.is_authenticated && c.user && c.user.username) {
    if (data.appVersion) RES_HEADERS['X-APP-VERSION'] = data.appVersion;
    return { username: c.user.username };
  }
  return null;
}

async function fetchBoards(ctx, username) {
  const r = await resGet(ctx, 'BoardsResource/get', { username, privacy_filter: 'all', sort: 'custom', page_size: 250, field_set_key: 'profile_grid_item' });
  const raw = resData(r);
  const list = Array.isArray(raw) ? raw : ((raw && (raw.results || raw.boards || raw.all_boards)) || []);
  return list.filter(b => b && (b.id || b.board_id) && b.name).map(b => ({ id: String(b.id || b.board_id), name: b.name }));
}

async function uploadImage(ctx, buffer, mime) {
  const mp = buildMultipart({}, { field: 'img', filename: 'pin.jpg', contentType: mime || 'image/jpeg', buffer });
  const r = await proxyNet.proxyFetch(PIN + '/upload-image/', {
    method: 'POST', proxy: ctx.proxy, timeoutMs: 60000,
    headers: { 'Cookie': ctx.cookie, 'X-CSRFToken': ctx.csrf, 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': mp.contentType },
    body: mp.body
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  const url = (j && (j.image_url || (j.resource_response && j.resource_response.data && j.resource_response.data.image_url))) || '';
  if (!r.ok || !url) return { ok: false, error: 'Upload ảnh lỗi HTTP ' + r.status };
  return { ok: true, url };
}

function extractCover(videoPath) {
  return new Promise((resolve) => {
    try {
      const out = path.join(os.tmpdir(), 'kz_pin_cover_' + Date.now() + '.jpg');
      const p = spawn(ffmpegPath(), ['-y', '-ss', '1', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=1000:-2', out], { windowsHide: true });
      p.on('close', () => resolve(fs.existsSync(out) ? out : ''));
      p.on('error', () => resolve(''));
    } catch (_) { resolve(''); }
  });
}

function findUploadTicket(data) {
  const lay = (o) => {
    if (!o || typeof o !== 'object') return null;
    const url = o.upload_url || o.uploadUrl || '';
    const params = o.upload_parameters || o.uploadParameters || o.fields || null;
    const id = o.upload_id || o.uploadId || o.media_id || o.id || '';
    return url && params && typeof params === 'object' && id ? { url: String(url), params, id: String(id) } : null;
  };
  const t = lay(data); if (t) return t;
  if (data && typeof data === 'object') for (const v of Object.values(data)) { const p = lay(v); if (p) return p; }
  return null;
}
function readStatus(data, uploadId) {
  if (!data) return '';
  let one = null;
  if (Array.isArray(data)) one = data.find(x => x && String(x.upload_id || x.id || '') === uploadId) || null;
  else if (typeof data === 'object') one = data[uploadId] || data;
  if (!one || typeof one !== 'object') return '';
  return String(one.status || one.upload_status || one.state || '');
}

async function createImagePin(ctx, { boardId, title, description, link, imageUrl }) {
  const r = await resPost(ctx, 'PinResource/create', {
    board_id: boardId,
    title: String(title || '').slice(0, 100),
    description: String(description || '').slice(0, 500),
    link: link || '',
    image_url: imageUrl,
    method: 'uploaded'
  });
  const pin = resData(r);
  if (r.ok && pin && pin.id) return { ok: true, id: String(pin.id) };
  return { ok: false, error: resError(r) || ('HTTP ' + r.status) };
}

async function createVideoPin(ctx, { boardId, title, description, link, videoBuffer, mime, coverUrl, durationMs }, onLog) {
  // 1) Đăng ký upload video
  const mediaId = 'video-' + Date.now() + Math.random().toString(36).slice(2, 8);
  const regAttempts = [
    () => resPost(ctx, 'ApiResource/create', { url: '/v3/media/uploads/register/', data: { type: 'video', mime_type: mime } }),
    () => resPost(ctx, 'ApiResource/create', { url: '/v3/media/uploads/register/', data: { type: 'video' } }),
    () => resPost(ctx, 'ApiResource/create', {
      url: '/v3/media/uploads/register/batch/',
      data: { media_info_list: JSON.stringify([{ id: mediaId, media_type: 'video-pin', upload_aux_data: { clips: [{ durationMs: Number(durationMs) || 0, isFromImage: false, startTimestampMs: 0 }] } }]) }
    })
  ];
  let ticket = null, regErr = '';
  for (const attempt of regAttempts) {
    let r; try { r = await attempt(); } catch (e) { regErr = e.message; continue; }
    const t = r.ok ? findUploadTicket(resData(r)) : null;
    if (t) { ticket = t; break; }
    if (!regErr) regErr = resError(r) || ('HTTP ' + (r && r.status));
  }
  if (!ticket) return { ok: false, error: 'Không đăng ký được upload video: ' + (regErr || '?') };

  // 2) POST file lên S3 (upload_parameters là các field form, file = cuối)
  if (onLog) onLog('Đang tải video lên Pinterest...');
  const up = buildMultipart(ticket.params, { field: 'file', filename: 'video.mp4', contentType: mime || 'video/mp4', buffer: videoBuffer });
  const s3 = await proxyNet.proxyFetch(ticket.url, { method: 'POST', proxy: ctx.proxy, timeoutMs: 180000, headers: { 'Content-Type': up.contentType }, body: up.body });
  if (!s3.ok && s3.status !== 201 && s3.status !== 204) return { ok: false, error: 'Upload S3 lỗi HTTP ' + s3.status };

  // 3) Poll trạng thái xử lý
  if (onLog) onLog('Pinterest đang xử lý video...');
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));
    let st = '';
    try {
      const r = await resPost(ctx, 'ApiResource/get', { url: '/v3/media/uploads/', data: { upload_ids: ticket.id } });
      st = readStatus(resData(r), ticket.id);
    } catch (_) {}
    if (XONG.test(st)) break;
    if (HONG.test(st)) return { ok: false, error: 'Pinterest xử lý video thất bại (' + st + ')' };
  }

  // 4) Tạo pin với media_upload_id
  const r = await resPost(ctx, 'PinResource/create', {
    board_id: boardId,
    title: String(title || '').slice(0, 100),
    description: String(description || '').slice(0, 500),
    link: link || '',
    media_upload_id: ticket.id,
    image_url: coverUrl || ''
  });
  const pin = resData(r);
  if (r.ok && pin && pin.id) return { ok: true, id: String(pin.id) };
  return { ok: false, error: resError(r) || ('HTTP ' + r.status) };
}

/**
 * Entry cho publisher. item: { video_path, title, caption, destination_name, pinterestBoardId?, link? }
 * account: { cookies, proxy, pinterestBoardId? }. Trả { ok, id, board } hoặc { ok:false, error }.
 */
async function publishPin(item, account, onProgress = () => {}) {
  const log = (m) => { try { onProgress({ phase: 'uploading', message: m }); } catch (_) {} };
  const cookie = cookieHeader(account);
  const csrf = getCsrf(cookie);
  if (!csrf) return { ok: false, error: 'Thiếu cookie Pinterest (csrftoken). Kết nối lại nick Pinterest.' };
  const ctx = { cookie, csrf, proxy: (account.proxy || '').trim() };

  log('Xác thực phiên Pinterest...');
  const viewer = await getViewer(ctx);
  if (!viewer) return { ok: false, error: 'Chưa đăng nhập Pinterest (cookie hết hạn?).' };

  const boards = await fetchBoards(ctx, viewer.username);
  if (!boards.length) return { ok: false, error: 'Nick chưa có Board nào — tạo 1 Board trên Pinterest trước.' };
  const wantBoard = item.pinterestBoardId || account.pinterestBoardId || item.destination_id || '';
  const board = boards.find(b => b.id === String(wantBoard)) || boards.find(b => b.name === item.destination_name) || boards[0];

  const title = item.title || '';
  const description = item.caption || item.title || '';
  const link = item.link || '';

  const vpath = item.video_path || item.filePath || '';
  const isVideo = vpath && fs.existsSync(vpath) && /\.(mp4|mov|m4v|webm)$/i.test(vpath);

  if (isVideo) {
    log('Chuẩn bị ảnh bìa + video...');
    let coverUrl = '';
    const coverPath = await extractCover(vpath);
    if (coverPath) {
      try { const up = await uploadImage(ctx, fs.readFileSync(coverPath), 'image/jpeg'); if (up.ok) coverUrl = up.url; } catch (_) {}
      try { fs.unlinkSync(coverPath); } catch (_) {}
    }
    const videoBuffer = fs.readFileSync(vpath);
    const res = await createVideoPin(ctx, { boardId: board.id, title, description, link, videoBuffer, mime: 'video/mp4', coverUrl, durationMs: Number(item.duration_ms) || 0 }, log);
    return res.ok ? { ok: true, id: res.id, board: board.name } : res;
  }

  // Không có video -> image pin (dùng cover/thumbnail nếu có)
  const imgPath = item.coverPath || item.thumbnail || '';
  if (imgPath && fs.existsSync(imgPath)) {
    const up = await uploadImage(ctx, fs.readFileSync(imgPath), 'image/jpeg');
    if (!up.ok) return up;
    const res = await createImagePin(ctx, { boardId: board.id, title, description, link, imageUrl: up.url });
    return res.ok ? { ok: true, id: res.id, board: board.name } : res;
  }

  return { ok: false, error: 'Không có video hợp lệ hoặc ảnh để đăng Pin.' };
}

module.exports = { publishPin, fetchBoards, getViewer, cookieHeader, getCsrf };
