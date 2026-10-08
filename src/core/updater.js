// Auto-update qua electron-updater (provider generic — đọc URL từ publish config trong package.json).
// Chỉ tải phần thay đổi (blockmap delta), không phải toàn bộ bản cài.
const { dialog } = require('electron');

function initAutoUpdate(mainWindow) {
  // Dev (chạy từ source) không có app-update.yml → bỏ qua
  const { app } = require('electron');
  if (!app.isPackaged) return;

  // Bản PORTABLE (zip) không cài NSIS được → có file marker 'PORTABLE' cạnh exe thì bỏ qua auto-update.
  try {
    const path = require('path');
    const fs = require('fs');
    if (fs.existsSync(path.join(path.dirname(app.getPath('exe')), 'PORTABLE'))) {
      console.log('[Update] Bản portable — bỏ qua auto-update.');
      return;
    }
  } catch (_) {}

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    console.error('[Update] electron-updater chưa sẵn sàng:', e.message);
    return;
  }

  autoUpdater.autoDownload = true;          // tự tải ngầm bản mới
  autoUpdater.autoInstallOnAppQuit = true;  // cài khi thoát app

  autoUpdater.on('error', (err) => console.error('[Update] Lỗi:', err == null ? 'unknown' : (err.message || err)));

  autoUpdater.on('update-downloaded', (info) => {
    const res = dialog.showMessageBoxSync(mainWindow, {
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

  autoUpdater.checkForUpdates().catch((e) => console.error('[Update] check thất bại:', e.message));
}

module.exports = { initAutoUpdate };
