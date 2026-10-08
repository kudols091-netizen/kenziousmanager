// Auto-update qua electron-updater (provider generic — đọc URL từ publish config trong package.json).
// Chỉ tải phần thay đổi (blockmap delta), không phải toàn bộ bản cài.
const { dialog } = require('electron');

let _wired = false;   // đã gắn listener cho autoUpdater chưa (tránh gắn trùng)
let _win = null;      // cửa sổ chính để hiện dialog

// Lấy autoUpdater đã cấu hình + gắn listener 1 lần. Trả { autoUpdater } hoặc { skip, message }.
function getAutoUpdater() {
  const { app } = require('electron');
  if (!app.isPackaged) return { skip: 'dev' };

  // Bản PORTABLE (zip) không cài NSIS được → có file marker 'PORTABLE' cạnh exe thì bỏ qua.
  try {
    const path = require('path');
    const fs = require('fs');
    if (fs.existsSync(path.join(path.dirname(app.getPath('exe')), 'PORTABLE'))) return { skip: 'portable' };
  } catch (_) {}

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    return { skip: 'error', message: e.message };
  }

  if (!_wired) {
    autoUpdater.autoDownload = true;          // tự tải ngầm bản mới
    autoUpdater.autoInstallOnAppQuit = true;  // cài khi thoát app
    autoUpdater.on('error', (err) => console.error('[Update] Lỗi:', err == null ? 'unknown' : (err.message || err)));
    autoUpdater.on('update-downloaded', (info) => {
      const res = dialog.showMessageBoxSync(_win, {
        type: 'info',
        buttons: ['Cài & khởi động lại', 'Để sau'],
        defaultId: 0,
        cancelId: 1,
        title: 'Có bản cập nhật mới',
        message: `Kenzious Reel ${info.version} đã tải xong.`,
        detail: 'Khởi động lại để cài. Lần sau nếu không cài ngay thì bản mới sẽ tự cài khi bạn thoát tool.',
      });
      if (res === 0) autoUpdater.quitAndInstall();
    });
    _wired = true;
  }
  return { autoUpdater };
}

function initAutoUpdate(mainWindow) {
  _win = mainWindow;
  const u = getAutoUpdater();
  if (u.skip) { console.log('[Update] Bỏ qua auto-update:', u.skip); return; }
  u.autoUpdater.checkForUpdates().catch((e) => console.error('[Update] check thất bại:', e.message));
}

// Kiểm tra cập nhật THỦ CÔNG (gọi từ nút trong Cài đặt). Trả { status, message, current?, latest? }.
// status: 'available' | 'latest' | 'dev' | 'portable' | 'error'
async function checkForUpdateManual() {
  const { app } = require('electron');
  const u = getAutoUpdater();
  if (u.skip === 'dev') return { status: 'dev', message: 'Đang chạy bản dev (từ source) — không có cập nhật online.' };
  if (u.skip === 'portable') return { status: 'portable', message: 'Bản Portable không tự cập nhật. Tải bản mới tại virals.kenzious.com/reel.' };
  if (u.skip) return { status: 'error', message: 'Updater chưa sẵn sàng: ' + (u.message || u.skip) };
  try {
    const result = await u.autoUpdater.checkForUpdates();
    const cur = app.getVersion();
    const latest = (result && result.updateInfo && result.updateInfo.version) || cur;
    if (latest && latest !== cur) {
      return { status: 'available', current: cur, latest, message: `Có bản mới v${latest}! Đang tải ngầm — tải xong sẽ hiện popup "Cài & khởi động lại".` };
    }
    return { status: 'latest', current: cur, message: `Bạn đang dùng bản mới nhất (v${cur}).` };
  } catch (e) {
    return { status: 'error', message: 'Không kiểm tra được cập nhật: ' + (e.message || e) };
  }
}

module.exports = { initAutoUpdate, checkForUpdateManual };
