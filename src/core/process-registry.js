/**
 * Theo dõi tiến trình con (ffmpeg, yt-dlp, python…) để:
 *  - Huỷ tác vụ: tắt CẢ CÂY tiến trình (proc.kill() trên Windows chỉ tắt tiến trình trực tiếp —
 *    vd ffmpeg do yt-dlp gọi để ghép file vẫn chạy và giữ khoá file).
 *  - Thoát app: tắt mọi tiến trình còn chạy, không để lại ffmpeg/python mồ côi chiếm CPU/GPU.
 * Không dùng cho Chrome mở cho người dùng thao tác (đăng nhập tay, nút "Mở").
 */

const { execFileSync } = require('child_process');

const children = new Set();

function track(proc) {
  if (!proc) return proc;
  children.add(proc);
  const forget = () => children.delete(proc);
  proc.once('exit', forget);
  proc.once('error', forget);
  return proc;
}

function killTree(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode) return;
  if (process.platform === 'win32' && proc.pid) {
    try {
      execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      return;
    } catch (_) {
      // tiến trình đã thoát, hoặc taskkill lỗi → thử kill thường
    }
  }
  try { proc.kill('SIGTERM'); } catch (_) {}
}

function killAll() {
  for (const proc of [...children]) killTree(proc);
  children.clear();
}

function runningCount() {
  return children.size;
}

module.exports = { track, killTree, killAll, runningCount };
