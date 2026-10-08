/**
 * Kenzious-Instagram server (Python, cổng 5055) cho tab IG Reel — app tự bật khi khởi động,
 * tự tắt khi thoát (process-registry). Người dùng chỉ cần mở Kenzious Reel Studio v2.exe.
 *
 *  - Code server: đóng gói → resources/ig-server | dev → ../Kenzious-instagram (repo bên cạnh)
 *  - Python:      bin/python/python.exe (bản nhúng, tạo bằng scripts/setup-ig-python.ps1)
 *                 → không có thì dùng pythonPath trong cài đặt / python của máy
 *  - Dữ liệu:     đóng gói → <userData>/data/instagram | dev → giữ nguyên data cạnh code
 *  - Log:         <dataDir>/logs/ig-server.log (gửi kèm khi báo lỗi)
 */

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const paths = require('./paths');
const storage = require('./storage');
const { track } = require('./process-registry');

const PORT = 5055;

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    sock.setTimeout(800);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.once('error', () => resolve(false));
  });
}

function existing(p) {
  return p && fs.existsSync(p) ? p : null;
}

async function start() {
  if (await portInUse(PORT)) {
    console.log(`[IG Server] Cổng ${PORT} đã có server chạy sẵn — dùng luôn.`);
    return null;
  }

  const serverDir = paths.isPackaged
    ? paths.resourcePath('ig-server')
    : path.resolve(paths.APP_ROOT, '..', 'Kenzious-instagram');
  const script = path.join(serverDir, 'ui', 'server.py');
  if (!fs.existsSync(script)) {
    console.warn('[IG Server] Không tìm thấy', script, '— tab IG Reel sẽ không hoạt động.');
    return null;
  }

  const python = existing(paths.resourcePath('bin', 'python', 'python.exe'))
    || storage.getSettings().pythonPath
    || 'python';

  const env = {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    KENZIOUS_REEL_OUTPUT: paths.getDefaultOutputDir()
  };
  if (paths.isPackaged) env.KENZIOUS_IG_HOME = paths.ensureDir(path.join(paths.getDataDir(), 'instagram'));
  const chromium = existing(paths.resourcePath('Chromium', 'bin', 'chrome.exe'));
  if (chromium) env.KENZIOUS_CHROMIUM = chromium;
  const ffmpeg = existing(paths.resourcePath('bin', 'ffmpeg.exe'));
  const ffprobe = existing(paths.resourcePath('bin', 'ffprobe.exe'));
  if (ffmpeg) env.KENZIOUS_FFMPEG = ffmpeg;
  if (ffprobe) env.KENZIOUS_FFPROBE = ffprobe;

  const logFile = path.join(paths.ensureDir(path.join(paths.getDataDir(), 'logs')), 'ig-server.log');
  const log = fs.createWriteStream(logFile, { flags: 'w' });
  log.write(`[${new Date().toISOString()}] ${python} ${script}\n`);

  const proc = track(spawn(python, [script], { cwd: serverDir, env, windowsHide: true }));
  proc.stdout.pipe(log, { end: false });
  proc.stderr.pipe(log, { end: false });
  proc.on('error', (err) => {
    log.write(`[IG Server] Không chạy được Python: ${err.message}\n`);
    console.error('[IG Server] Không chạy được Python:', err.message);
  });
  proc.on('exit', (code) => {
    log.write(`[IG Server] Đã dừng (code ${code})\n`);
    if (code) console.error(`[IG Server] Dừng với code ${code} — xem ${logFile}`);
  });
  console.log(`[IG Server] Đang khởi động (PID ${proc.pid}) — log: ${logFile}`);
  return proc;
}

module.exports = { start };
