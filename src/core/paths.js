/**
 * Đường dẫn dùng chung cho cả chạy từ source (dev) và bản đóng gói (asar).
 *
 *  - getDataDir():    dữ liệu người dùng (settings, accounts, profiles, license, publisher_data…)
 *                     dev: <repo>/data   |   đóng gói: %APPDATA%/<productName>/data
 *                     (biến môi trường KZ_DATA_DIR ghi đè — dùng khi chạy thử)
 *                     → không ghi vào thư mục cài đặt (Program Files không ghi được, cập nhật app sẽ xoá).
 *  - getDefaultOutputDir(): dev: <repo>/output | đóng gói: Videos/Kenzious Reel
 *  - resourcePath(...): bin / Chromium / extensions — dev: <repo>/... | đóng gói: resources/...
 *  - unpackedPath(p): file phải chạy bằng tiến trình ngoài (python) → app.asar.unpacked
 *  - readJsonSafe / writeJsonAtomic: ghi file tạm rồi rename, file hỏng được giữ lại để khôi phục.
 */

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..', '..');

let electronApp = null;
try {
  // Trong Node thường (script, test) require('electron') trả về chuỗi đường dẫn → không có .app
  electronApp = require('electron').app || null;
} catch (_) {}

const isPackaged = !!(electronApp && electronApp.isPackaged);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Lần đầu chạy bản đóng gói: chép dữ liệu mặc định (presets, prompts) và dữ liệu cũ của các bản
 * trước (vốn nằm trong resources/data) sang userData. Không ghi đè file đã có.
 */
function migrateLegacyData(targetDir) {
  const marker = path.join(targetDir, '.migrated-from-resources');
  if (fs.existsSync(marker)) return;
  const legacyDir = process.resourcesPath ? path.join(process.resourcesPath, 'data') : null;
  if (legacyDir && fs.existsSync(legacyDir)) {
    try {
      fs.cpSync(legacyDir, targetDir, { recursive: true, force: false, errorOnExist: false });
    } catch (err) {
      console.error('[paths] Migrate data error:', err.message);
    }
  }
  try { fs.writeFileSync(marker, new Date().toISOString(), 'utf-8'); } catch (_) {}
}

let cachedDataDir = null;
function getDataDir() {
  if (cachedDataDir) return cachedDataDir;
  if (process.env.KZ_DATA_DIR) {
    // Chạy thử với thư mục dữ liệu riêng (test, nhiều bộ dữ liệu) — không đụng dữ liệu thật
    cachedDataDir = ensureDir(path.resolve(process.env.KZ_DATA_DIR));
  } else if (isPackaged) {
    cachedDataDir = ensureDir(path.join(electronApp.getPath('userData'), 'data'));
    migrateLegacyData(cachedDataDir);
  } else {
    cachedDataDir = ensureDir(path.join(APP_ROOT, 'data'));
  }
  return cachedDataDir;
}

function getProfilesDir() {
  return path.join(getDataDir(), 'profiles');
}

function getDefaultOutputDir() {
  if (isPackaged) return path.join(electronApp.getPath('videos'), 'Kenzious Reel');
  return path.join(APP_ROOT, 'output');
}

function resourcePath(...parts) {
  if (isPackaged && process.resourcesPath) return path.join(process.resourcesPath, ...parts);
  return path.join(APP_ROOT, ...parts);
}

function unpackedPath(p) {
  return p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

function readJsonSafe(file, defaultVal) {
  if (!fs.existsSync(file)) return defaultVal;
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    // File hỏng (vd: tắt máy giữa lúc ghi): giữ lại bản hỏng để khôi phục tay thay vì để lần ghi sau xoá mất
    const backup = `${file}.corrupt-${Date.now()}`;
    try { fs.renameSync(file, backup); } catch (_) {}
    console.error(`[paths] ${path.basename(file)} bị hỏng (${err.message}). Đã lưu bản sao: ${backup}`);
    return defaultVal;
  }
}

function writeJsonAtomic(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2), null, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

module.exports = {
  APP_ROOT,
  isPackaged,
  ensureDir,
  getDataDir,
  getProfilesDir,
  getDefaultOutputDir,
  resourcePath,
  unpackedPath,
  readJsonSafe,
  writeJsonAtomic
};
