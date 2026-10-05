/**
 * Mã hoá dữ liệu nhạy cảm khi lưu xuống đĩa (cookie, token, API key, mật khẩu clone…).
 *
 * Dùng Electron safeStorage — trên Windows là DPAPI, khoá gắn với TÀI KHOẢN WINDOWS hiện tại:
 * file bị chép sang máy khác / user khác sẽ không giải mã được (phải đăng nhập lại tài khoản).
 * Chạy ngoài Electron (script, test) thì không có safeStorage → giữ nguyên plaintext.
 *
 *  - encryptString / decryptString: chuỗi ↔ "dpapi:v1:<base64>"
 *  - sealFields / openFields: mã hoá một nhóm field của object thành field `_sealed`
 *  - kv*: kho key-value đã mã hoá cho renderer (thay localStorage với các khoá nhạy cảm)
 */

const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const PREFIX = 'dpapi:v1:';

let safeStorage = null;
try {
  safeStorage = require('electron').safeStorage || null;
} catch (_) {}

function isAvailable() {
  try {
    return !!(safeStorage && safeStorage.isEncryptionAvailable());
  } catch (_) {
    return false;
  }
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** @returns {string|null} chuỗi đã mã hoá, hoặc null nếu máy không hỗ trợ (giữ plaintext) */
function encryptString(plain) {
  if (!isAvailable()) return null;
  return PREFIX + safeStorage.encryptString(String(plain)).toString('base64');
}

function decryptString(value) {
  if (!isEncrypted(value)) return value;
  if (!isAvailable()) throw new Error('Không giải mã được dữ liệu: hệ thống mã hoá (DPAPI) không khả dụng');
  return safeStorage.decryptString(Buffer.from(value.slice(PREFIX.length), 'base64'));
}

/**
 * Gom các field nhạy cảm vào `_sealed` (đã mã hoá). Không thay đổi object gốc.
 * Máy không hỗ trợ mã hoá → trả nguyên bản.
 */
function sealFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const secret = {};
  let has = false;
  for (const f of fields) {
    if (obj[f] !== undefined && obj[f] !== null && obj[f] !== '') {
      secret[f] = obj[f];
      has = true;
    }
  }
  if (!has) {
    const out = { ...obj };
    // Khối không giải mã được (chép từ máy/user khác) → giữ nguyên, không xoá mất khi lưu lại
    if (!obj._sealedError) delete out._sealed;
    delete out._sealedError;
    return out;
  }
  const sealed = encryptString(JSON.stringify(secret));
  if (!sealed) return obj;
  const out = { ...obj, _sealed: sealed };
  delete out._sealedError;
  for (const f of fields) delete out[f];
  return out;
}

/**
 * Giải `_sealed` trở lại thành field thường. Không giải được (chép sang máy/user khác)
 * → bỏ các field bí mật và đánh dấu _sealedError để giao diện báo cần đăng nhập lại.
 */
function openFields(obj) {
  if (!obj || typeof obj !== 'object' || !obj._sealed) return obj;
  const out = { ...obj };
  try {
    Object.assign(out, JSON.parse(decryptString(obj._sealed)));
    delete out._sealed;
  } catch (err) {
    out._sealedError = err.message;
  }
  return out;
}

function hasPlainSecrets(obj, fields) {
  return !!obj && fields.some(f => obj[f] !== undefined && obj[f] !== null && obj[f] !== '' && !obj._sealed);
}

/* ── Kho key-value mã hoá cho renderer ─────────────────────────────────────── */

// Chỉ các khoá này được lưu qua đây (dữ liệu clone: mật khẩu, 2FA, cookie, token, proxy)
const KV_ALLOWED_KEYS = new Set(['reel-clones', 'kenzi-clone-meta', 'reel-ppages', 'reel-clone-proxies']);

let kvCache = null;
function kvFile() {
  return path.join(paths.getDataDir(), 'secure-kv.json');
}

function kvLoad() {
  if (!kvCache) kvCache = paths.readJsonSafe(kvFile(), {}) || {};
  return kvCache;
}

function kvGet(key) {
  if (!KV_ALLOWED_KEYS.has(key)) throw new Error(`Khoá không được phép: ${key}`);
  const raw = kvLoad()[key];
  if (raw === undefined || raw === null) return null;
  try {
    return decryptString(raw);
  } catch (_) {
    return null;
  }
}

function kvSet(key, value) {
  if (!KV_ALLOWED_KEYS.has(key)) throw new Error(`Khoá không được phép: ${key}`);
  const store = kvLoad();
  if (value === null || value === undefined) {
    delete store[key];
  } else {
    store[key] = encryptString(String(value)) || String(value);
  }
  paths.writeJsonAtomic(kvFile(), store);
  return true;
}

module.exports = {
  isAvailable,
  isEncrypted,
  encryptString,
  decryptString,
  sealFields,
  openFields,
  hasPlainSecrets,
  KV_ALLOWED_KEYS,
  kvGet,
  kvSet
};
