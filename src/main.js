const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');

// Chỉ chạy 1 phiên app: mở lần 2 thì đưa cửa sổ đang chạy lên trước. Hai phiên song song sẽ ghi đè
// accounts/publisher_data của nhau và cùng đăng một hàng đợi. Phải kiểm tra TRƯỚC khi nạp các module dữ liệu
// (publisher dọn trạng thái "đang đăng" ngay khi được nạp).
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
  return;
}
app.on('second-instance', () => {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

const fbreelBridge = require('./core/fbreel-bridge');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const storage = require('./core/storage');
const downloader = require('./core/downloader');
const renderer = require('./core/renderer');
const aiPipeline = require('./core/ai-pipeline');
const channelManager = require('./core/channel-manager');
const publisher = require('./core/publisher');
const DestinationsManager = require('./core/destinations-manager');
const destinationsManager = new DestinationsManager();
const douyinScraper = require('./core/douyin-scraper');
const torrentManager = require('./core/torrent-manager');
const facebookToolkit = require('./core/facebook-toolkit');
const licenseGuard = require('./core/license-guard');
const proxyNet = require('./core/proxy-net');
const secureStore = require('./core/secure-store');

// ------------------- Dữ liệu gửi sang renderer -------------------
// Renderer chỉ cần biết tài khoản CÓ cookie/token hay không — giá trị thật ở lại main process.
function sanitizeAccount(acc) {
  if (!acc || typeof acc !== 'object') return acc;
  const { cookies, token, _sealed, _sealedError, ...rest } = acc;
  return {
    ...rest,
    hasCookies: Array.isArray(cookies) ? cookies.length > 0 : !!cookies,
    cookieCount: Array.isArray(cookies) ? cookies.length : (cookies ? 1 : 0),
    hasToken: !!token,
    needsRelogin: !!_sealedError
  };
}
const sanitizeAccounts = (list) => Array.isArray(list) ? list.map(sanitizeAccount) : list;

// Field renderer được phép ghi vào tài khoản (không cho đổi id, cookies, token, profileDir…)
const RENDERER_EDITABLE_ACCOUNT_FIELDS = ['proxy', 'fingerprintEnabled', 'displayName'];
function pickEditableAccountFields(patch) {
  const out = {};
  for (const k of RENDERER_EDITABLE_ACCOUNT_FIELDS) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, k)) out[k] = patch[k];
  }
  return out;
}

// ------------------- License Gate -------------------
// Bản đóng gói: mọi IPC (trừ nhóm bên dưới) bị từ chối khi chưa kích hoạt, nên xoá modal khoá
// trong giao diện cũng không dùng được tính năng. Khi chạy từ source thì không chặn
// (KZ_ENFORCE_LICENSE=1 để bật thử khi dev).
const ENFORCE_LICENSE = app.isPackaged || process.env.KZ_ENFORCE_LICENSE === '1';
const LICENSE_FREE_CHANNELS = new Set([
  'license:getStatus', 'license:getHWID', 'license:activate', 'license:deactivate', 'storage:getSettings'
]);
const rawIpcHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => rawIpcHandle(channel, (event, ...args) => {
  if (ENFORCE_LICENSE && !LICENSE_FREE_CHANNELS.has(channel) && !licenseGuard.isActivated()) {
    throw new Error('Phần mềm chưa được kích hoạt bản quyền.');
  }
  return listener(event, ...args);
});
// DevTools chỉ mở được khi chạy từ source
const ALLOW_DEVTOOLS = !app.isPackaged;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1100,
    minHeight: 740,
    title: 'Kenzious Reel v2 — AI Video Studio & Multi-Platform Reup',
    icon: path.join(__dirname, '..', 'assets', 'Logo-Icon-Kenzious.svg'),
    backgroundColor: '#070a13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: ALLOW_DEVTOOLS
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Bản đóng gói: bỏ menu mặc định (Ctrl+Shift+I / Ctrl+R…)
  if (app.isPackaged) Menu.setApplicationMenu(null);
  // Mã hoá cookie/token/API key còn plaintext từ bản cũ (DPAPI)
  try {
    const mig = storage.migrateSecrets();
    if (mig.accounts || mig.settings || mig.removedCookieFiles) console.log('[Secure] Đã mã hoá dữ liệu cũ:', mig);
    if (!mig.available) console.warn('[Secure] safeStorage không khả dụng — dữ liệu nhạy cảm vẫn ở dạng plaintext');
  } catch (err) {
    console.error('[Secure] Lỗi mã hoá dữ liệu cũ:', err.message);
  }
  createWindow();
  // Tự kiểm tra & tải bản cập nhật (chỉ chạy ở bản đóng gói)
  try { require('./core/updater').initAutoUpdate(mainWindow); } catch (err) { console.error('[Update]', err.message); }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Thoát app khi torrent đang tải: phải đóng WebTorrent trước (socket/module native còn chạy → Electron crash khi thoát)
let torrentShutdownDone = false;
app.on('before-quit', (event) => {
  if (torrentShutdownDone || !torrentManager.client) return;
  event.preventDefault();
  torrentShutdownDone = true;
  torrentManager.destroyClient().finally(() => app.quit());
});

// Thoát app: tắt ffmpeg / yt-dlp / python còn chạy (cả cây tiến trình), không để lại tiến trình mồ côi
app.on('will-quit', () => {
  require('./core/process-registry').killAll();
});

// ------------------- Navigation / Popup Hardening -------------------
const RENDERER_DIR_URL = pathToFileURL(path.join(__dirname, '..', 'renderer') + path.sep).href;
const isHttpUrl = (u) => /^https?:\/\//i.test(String(u || ''));

app.on('web-contents-created', (_event, contents) => {
  // <webview> (cửa sổ Via) luôn chạy không Node, không preload, sandbox — và chỉ được trỏ tới http(s)
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (!isHttpUrl(params.src)) event.preventDefault();
  });

  if (contents.getType() === 'webview') {
    // Popup trong Via (allowpopups): mở ngay trong webview thay vì tạo BrowserWindow không kiểm soát
    contents.setWindowOpenHandler(({ url }) => {
      if (isHttpUrl(url)) contents.loadURL(url);
      return { action: 'deny' };
    });
    return;
  }

  // Cửa sổ của app (có preload window.api): không bao giờ rời thư mục renderer.
  // Link web (target=_blank, kéo thả link…) mở bằng trình duyệt hệ thống.
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith(RENDERER_DIR_URL)) return;
    event.preventDefault();
    if (isHttpUrl(url)) shell.openExternal(url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});


// IPC Handler Helpers
// Gửi tới MỌI cửa sổ giao diện (cửa sổ chính + cửa sổ workspace mở thêm), trừ cửa sổ Via:
// tác vụ khởi chạy từ cửa sổ phụ trước đây không bao giờ thấy progress/log.
function broadcastToAppWindows(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    const url = win.webContents.getURL();
    if (url && !url.includes('/renderer/index.html')) continue;
    win.webContents.send(channel, payload);
  }
}

function sendProgress(data) {
  broadcastToAppWindows('progress:update', data);
}

function sendLog(text) {
  broadcastToAppWindows('log:update', text);
}

// Các setting được spawn trực tiếp → chỉ nhận tên lệnh trơn hoặc đường dẫn tuyệt đối tới .exe
const BINARY_SETTING_KEYS = ['pythonPath', 'ffmpegPath', 'ffprobePath', 'ytdlpPath'];
function validateBinarySettings(settings) {
  for (const key of BINARY_SETTING_KEYS) {
    const v = settings ? settings[key] : undefined;
    if (v === undefined || v === null || v === '') continue;
    const s = String(v).trim();
    const isBareCommand = /^[\w.-]+$/.test(s);
    const isExePath = path.isAbsolute(s) && !/["<>|&^%\r\n]/.test(s) &&
      (process.platform !== 'win32' || /\.exe$/i.test(s));
    if (!isBareCommand && !isExePath) {
      throw new Error(`Đường dẫn ${key} không hợp lệ: chỉ chấp nhận tên lệnh (vd: python) hoặc đường dẫn tuyệt đối tới file .exe.`);
    }
  }
}

// ------------------- Storage IPC -------------------
ipcMain.handle('storage:getSettings', () => {
  // Cookie phiên Google (Gemini) không cần ở renderer
  const { geminiWebCookies, ...rest } = storage.getSettings();
  return rest;
});
ipcMain.handle('storage:saveSettings', (e, settings) => {
  validateBinarySettings(settings);
  return storage.saveSettings(settings);
});
ipcMain.handle('storage:getPresets', () => storage.getPresets());
ipcMain.handle('storage:savePresets', (e, presets) => storage.savePresets(presets));
ipcMain.handle('storage:getAccounts', () => sanitizeAccounts(storage.getAccounts()));
ipcMain.handle('storage:addAccount', (e, acc) => {
  // Renderer không được tự đặt cookie/token/profileDir cho tài khoản
  const { cookies, token, profileDir, _sealed, ...safe } = acc || {};
  return sanitizeAccounts(storage.addAccount(safe));
});
ipcMain.handle('storage:deleteAccount', (e, id) => sanitizeAccounts(storage.deleteAccount(id)));
ipcMain.handle('storage:getHistory', () => storage.getHistory());
ipcMain.handle('storage:getPrompts', () => storage.getPromptsData());
ipcMain.handle('storage:savePrompts', (e, data) => storage.savePromptsData(data));

// ------------------- Stage 1: Downloader & Renderer IPC -------------------
ipcMain.handle('downloader:getVideoInfo', async (e, url) => {
  return await downloader.getVideoInfo(url);
});

ipcMain.handle('downloader:downloadVideo', async (e, url, options = {}) => {
  const settings = storage.getSettings();
  const outputDir = options.outputDir || settings.outputDir;
  return await downloader.downloadVideo(url, outputDir, options, {
    onProgress: (prog) => sendProgress({ type: 'download', ...prog }),
    onLog: (msg) => sendLog(msg)
  });
});

ipcMain.handle('downloader:cancelDownload', (e, taskId) => {
  return downloader.cancelDownload(taskId);
});

ipcMain.handle('renderer:renderVideo', async (e, inputPath, outputPath, options = {}) => {
  return await renderer.renderVideo(inputPath, outputPath, options, {
    onProgress: (prog) => sendProgress({ type: 'render', ...prog }),
    onLog: (msg) => sendLog(msg)
  });
});

ipcMain.handle('downloader:scanChannel', async (e, url, limit = 20) => {
  return await downloader.scanChannel(url, limit);
});

ipcMain.handle('renderer:getVideoMetadata', async (e, videoPath) => {
  return await renderer.getVideoMetadata(videoPath);
});

ipcMain.handle('renderer:cancelRender', (e, taskId) => {
  return renderer.cancelRender(taskId);
});

// ------------------- Stage 2: AI Pipeline & Phase 3 Dubbing Engine IPC -------------------
ipcMain.handle('ai:getVoices', async () => {
  return await aiPipeline.getVoices();
});

ipcMain.handle('ai:synthesizeVoice', async (e, text, optionsOrVoice, outputFile, rate, pitch) => {
  return await aiPipeline.synthesizeVoice(text, optionsOrVoice, outputFile, rate, pitch);
});

ipcMain.handle('ai:translateScript', async (e, text, targetLang, apiKey, provider) => {
  if (typeof aiPipeline.translateScript !== 'function') {
    throw new Error('Tính năng dịch kịch bản AI chưa được triển khai trong phiên bản này.');
  }
  return await aiPipeline.translateScript(text, targetLang, apiKey, provider);
});

ipcMain.handle('ai:generateAss', async (e, cues, outputPath, options) => {
  return aiPipeline.generateAssSubtitles ? aiPipeline.generateAssSubtitles(cues, outputPath, options) : null;
});

ipcMain.handle('ai:mixAudioDucking', async (e, videoPath, voicePath, outputPath, options) => {
  return await aiPipeline.mixAudioDucking(videoPath, voicePath, outputPath, options);
});

ipcMain.handle('ai:softShorten', async (e, text, options) => {
  return aiPipeline.softShortenVi(text, options);
});

ipcMain.handle('ai:separateAudio', async (e, inputMedia, outputDir, options) => {
  return await aiPipeline.separateAudio(inputMedia, outputDir, options);
});

// ------------------- Stage 5: Kenzious Toolkit (EAAB Token & UID Conversion) -------------------
ipcMain.handle('toolkit:extractEaabToken', async (e, options) => {
  return await facebookToolkit.extractEaabToken(options);
});

ipcMain.handle('toolkit:convertUrlsToUid', async (e, urls) => {
  return await facebookToolkit.resolveBatchUrlsToUid(urls, (p) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toolkit:uidProgress', p);
    }
  });
});

ipcMain.handle('ai:checkDemucs', async (e, force) => {
  return await aiPipeline.checkDemucs(!!force);
});

ipcMain.handle('ai:browserAccountLoginGemini', async (e, options) => {
  return await aiPipeline.loginGeminiInteractive(options);
});

ipcMain.handle('proxy:check', async (e, rawProxy, timeoutMs) => {
  const proxyChecker = require('./core/proxy-checker');
  return await proxyChecker.checkProxyHealth(rawProxy, timeoutMs);
});

// ------------------- Stage 3: Channel Manager & Publisher IPC -------------------
// Thêm nick Instagram (login/cookie) -> tự điền luôn "Cookie Instagram" cho tải/quét (màn Download).
function syncIgCookieFromAccount(acc) {
  try {
    if (!acc || acc.platform !== 'instagram' || !Array.isArray(acc.cookies)) return;
    const igCookie = acc.cookies
      .filter(c => !c.domain || String(c.domain).includes('instagram.com'))
      .map(c => `${c.name}=${c.value}`).join('; ');
    if (igCookie && /(^|;\s*)sessionid=/.test(igCookie)) {
      storage.saveSettings({ igCookie });
      sendLog('[Instagram] Đã đồng bộ cookie nick vừa thêm sang "Cookie Instagram" (tải/quét).');
    }
  } catch (_) {}
}

ipcMain.handle('channel:importCookies', async (e, platform, cookies, proxy, name, options) => {
  const acc = await channelManager.importCookies(platform, cookies, proxy, name, options);
  syncIgCookieFromAccount(acc);
  return sanitizeAccount(acc);
});

ipcMain.handle('channel:interactiveLogin', async (e, platform, proxy, options) => {
  const acc = await channelManager.interactiveLogin(platform, proxy, (msg) => sendLog(msg), options);
  syncIgCookieFromAccount(acc);
  return sanitizeAccount(acc);
});

ipcMain.handle('channel:checkStatus', async (e, id) => {
  return await channelManager.checkAccountStatus(id);
});

ipcMain.handle('channel:openBrowser', async (e, accountId) => {
  return await channelManager.openProfileBrowser(accountId);
});

ipcMain.handle('channel:updateSettings', async (e, accountId, patch) => {
  return sanitizeAccount(channelManager.updateAccountSettings(accountId, pickEditableAccountFields(patch)));
});

ipcMain.handle('channel:getToken', async (e, accountId) => {
  return await channelManager.getAccountToken(accountId);
});

ipcMain.handle('channel:getDestinations', async (e, accountId) => {
  return destinationsManager.getDestinations(accountId);
});

ipcMain.handle('channel:refreshDestinations', async (e, accountId) => {
  const acc = storage.getAccounts().find(a => a.id === accountId);
  if (!acc) throw new Error('Không tìm thấy tài khoản');
  return await destinationsManager.discoverFacebookDestinations(acc);
});

ipcMain.handle('channel:toggleDestination', async (e, accountId, destId, selected) => {
  return destinationsManager.toggleDestination(accountId, destId, selected);
});

// ------------------- Ingestion Pipeline IPC (Douyin & WebTorrent) -------------------
ipcMain.handle('downloader:probeDouyin', async (e, url) => {
  return await douyinScraper.probeDouyinVideo(url);
});

ipcMain.handle('downloader:downloadDouyin', async (e, url, outputDir) => {
  return await douyinScraper.downloadDouyinVideo(url, outputDir, (p) => sendProgress({ type: 'douyin', ...p }));
});

ipcMain.handle('torrent:inspect', async (e, source) => {
  return await torrentManager.inspectTorrent(source);
});

ipcMain.handle('torrent:download', async (e, source, fileIndices, outputDir) => {
  return await torrentManager.startSelectiveDownload(source, fileIndices, outputDir, (p) => sendProgress({ type: 'torrent', ...p }));
});

ipcMain.handle('torrent:cancel', (e, infoHash) => {
  return torrentManager.cancelDownload(infoHash);
});

ipcMain.handle('publisher:addToQueue', (e, videoPath, accounts, options) => {
  return publisher.addVideosToQueue([videoPath], options.gapMinutes, accounts);
});

ipcMain.handle('publisher:addVideosToQueue', (e, videoPaths, gapMinutes, accounts) => {
  return publisher.addVideosToQueue(videoPaths, gapMinutes, accounts);
});

ipcMain.handle('publisher:getQueueEvents', () => {
    return publisher.getQueueEvents ? publisher.getQueueEvents() : publisher.getQueue();
  });

  ipcMain.handle('publisher:scanFolderClips', (e, dirPath) => {
    return publisher.scanFolderClips(dirPath);
  });

  ipcMain.handle('publisher:saveJobDraft', (e, job) => {
    const db = require('./core/publisher-db');
    return db.saveJobDraft(job);
  });

  ipcMain.handle('publisher:getJobDraft', (e, id) => {
    const db = require('./core/publisher-db');
    return db.getJobDraft(id);
  });

  ipcMain.handle('publisher:getVideoThumbnail', async (e, videoPath) => {
    return publisher.getVideoThumbnail(videoPath);
  });

  ipcMain.handle('publisher:createPublishSession', (e, payload) => {
    return publisher.createPublishSession(payload);
  });

  ipcMain.handle('publisher:startJob', async (e, payload) => {
    return await publisher.startCustomJob(payload, (prog) => sendProgress({ type: 'publish', ...prog }));
  });

  ipcMain.handle('publisher:getQueue', () => {
  return publisher.getQueue();
});

ipcMain.handle('publisher:getSessions', () => {
  return publisher.getSessions();
});

ipcMain.handle('publisher:getEvents', (e, sessionId) => {
  return publisher.getEvents(sessionId);
});

ipcMain.handle('publisher:startSession', async (e, sessionId) => {
  return publisher.resumeSession(sessionId, (prog) => sendProgress({ type: 'publish', ...prog }));
});

ipcMain.handle('publisher:pauseSession', () => {
  return publisher.pauseSession();
});

ipcMain.handle('publisher:clearQueue', () => {
  const db = require('./core/publisher-db');
  return db.clearQueue();
});

// ------------------- License & HWID Security IPC -------------------
ipcMain.handle('license:getStatus', () => {
  return licenseGuard.getLicenseStatus();
});

ipcMain.handle('license:getHWID', () => {
  return licenseGuard.getHWID();
});

ipcMain.handle('license:activate', (e, key) => {
  return licenseGuard.activate(key);
});

ipcMain.handle('license:deactivate', () => {
  return licenseGuard.deactivate();
});

// ------------------- Dialogs IPC -------------------
let isSystemDialogOpen = false;

ipcMain.handle('dialog:pickDirectory', async () => {
  if (isSystemDialogOpen) return null;
  isSystemDialogOpen = true;
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    });
    if (!res.canceled && res.filePaths.length > 0) {
      return res.filePaths[0];
    }
    return null;
  } finally {
    isSystemDialogOpen = false;
  }
});

// Chỉ mở thư mục hoặc file media; file khác (vd .exe/.bat) chỉ được hiện trong Explorer, không bao giờ bị chạy
const OPENABLE_MEDIA_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.srt', '.ass', '.jpg', '.jpeg', '.png', '.webp']);
ipcMain.handle('dialog:openDirectory', async (e, dir) => {
  if (!dir || typeof dir !== 'string' || !fs.existsSync(dir)) return false;
  const stat = fs.statSync(dir);
  if (stat.isDirectory() || OPENABLE_MEDIA_EXTS.has(path.extname(dir).toLowerCase())) {
    shell.openPath(dir);
  } else {
    shell.showItemInFolder(dir);
  }
  return true;
});

ipcMain.handle('dialog:pickFile', async (e, filters = []) => {
  if (isSystemDialogOpen) return null;
  isSystemDialogOpen = true;
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: (filters && filters.length > 0) ? filters : [{ name: 'All Files', extensions: ['*'] }]
    });
    if (!res.canceled && res.filePaths.length > 0) {
      return res.filePaths;
    }
    return null;
  } finally {
    isSystemDialogOpen = false;
  }
});

// ------------------- Kenzious Facebook Reel Native Bridge IPC -------------------
ipcMain.handle('eb:checkUidLive', async (e, args) => {
  return await fbreelBridge.checkUidLive((args && args.uid) || '');
});

ipcMain.handle('eb:cloneFetch', async (e, args) => {
  return await fbreelBridge.cloneFetch(args || {});
});

// Kho key-value đã mã hoá cho dữ liệu clone (thay localStorage). Đồng bộ vì code renderer đọc/ghi đồng bộ.
ipcMain.on('secure-kv:get', (e, key) => {
  try { e.returnValue = { ok: true, value: secureStore.kvGet(key) }; } catch (err) { e.returnValue = { ok: false, error: err.message }; }
});
ipcMain.on('secure-kv:set', (e, key, value) => {
  try { e.returnValue = { ok: secureStore.kvSet(key, value) }; } catch (err) { e.returnValue = { ok: false, error: err.message }; }
});

// Renderer đồng bộ proxy của từng clone (theo UID + token) để mọi request của clone đi đúng proxy
ipcMain.handle('eb:syncCloneProxies', async (e, args) => {
  return fbreelBridge.setCloneProxies((args && args.source) || 'default', (args && args.entries) || []);
});

ipcMain.handle('eb:fbLogin', async (e, args) => {
  return await fbreelBridge.fb4aLogin(args || {});
});

ipcMain.handle('eb:getTokenFromCookie', async (e, args) => {
  return await fbreelBridge.getTokenFromCookie(args || {});
});

ipcMain.handle('eb:get2faOtp', async (e, args) => {
  return await fbreelBridge.get2faOtp((args && args.secret) || '');
});


ipcMain.handle('eb:uploadPhoto', async (e, args) => {
  return await fbreelBridge.uploadPhoto(args || {});
});

ipcMain.handle('eb:uploadReelChunk', async (e, args) => {
  return await fbreelBridge.uploadReelChunk(args || {});
});

// ------------------- Dedicated Via Browser Management -------------------


// Kiểm tra proxy thật (HTTP CONNECT / SOCKS4 / SOCKS5, có user/pass) — dùng chung proxy-checker
ipcMain.handle('eb:testProxy', async (e, args) => {
  const input = args && typeof args === 'object' && args.proxy && !args.host ? args.proxy : args;
  if (!proxyNet.parseProxy(input)) return { success: false, error: 'Thiếu Host/Port hoặc định dạng proxy không hợp lệ' };
  const res = await require('./core/proxy-checker').checkProxyHealth(input, 15000);
  return res.ok
    ? { success: true, ip: res.ip, latency: res.latencyMs, warning: !!res.warning, message: res.message }
    : { success: false, error: res.message };
});

ipcMain.handle('eb:openViaBrowser', async (e, args) => {
  // Mở Via bằng Chromium THẬT (antidetect), không còn dùng webview Electron
  try {
    return await channelManager.openViaBrowser(args || {});
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('eb:openCookieBrowser', (e, url, proxy) => {
  // Mở Chromium + extension GetCookie để user đăng nhập & copy cookie (IG…), có thể kèm proxy
  try {
    return channelManager.openCookieBrowser(url, proxy);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ------------------- Multi-Window / Dual Monitor Management -------------------
function openWorkspaceWindow(targetWs = 'reup') {
  const isReup = (targetWs === 'reup');
  const winTitle = isReup
    ? 'Kenzious Reup Studio — AI Video & Render 9:16'
    : 'Kenzious Facebook Reel — Dàn Clone / Via & Bulk Publisher';

  const newWin = new BrowserWindow({
    width: 1300,
    height: 860,
    minWidth: 1050,
    minHeight: 700,
    title: winTitle,
    icon: path.join(__dirname, '..', 'assets', 'Logo-Icon-Kenzious.svg'),
    backgroundColor: '#070a13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: ALLOW_DEVTOOLS
    }
  });

  newWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), {
    query: { ws: targetWs }
  });

  newWin.on('closed', () => {
    // Window garbage collected automatically by Electron
  });

  return true;
}

ipcMain.handle('window:openWorkspace', (e, args) => {
  const ws = (args && args.workspace) || 'reup';
  return openWorkspaceWindow(ws);
});

