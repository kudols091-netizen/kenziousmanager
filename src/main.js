const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const storage = require('./core/storage');
const downloader = require('./core/downloader');
const renderer = require('./core/renderer');
const aiPipeline = require('./core/ai-pipeline');
const channelManager = require('./core/channel-manager');
const publisher = require('./core/publisher');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1100,
    minHeight: 740,
    title: 'Kenzious Reel v2 — AI Video Studio & Multi-Platform Reup',
    icon: path.join(__dirname, '..', 'assets', 'Mascot-Kenzious.png'),
    backgroundColor: '#070a13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler Helpers
function sendProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('progress:update', data);
  }
}

function sendLog(text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log:update', text);
  }
}

// ------------------- Storage IPC -------------------
ipcMain.handle('storage:getSettings', () => storage.getSettings());
ipcMain.handle('storage:saveSettings', (e, settings) => storage.saveSettings(settings));
ipcMain.handle('storage:getPresets', () => storage.getPresets());
ipcMain.handle('storage:savePresets', (e, presets) => storage.savePresets(presets));
ipcMain.handle('storage:getAccounts', () => storage.getAccounts());
ipcMain.handle('storage:addAccount', (e, acc) => storage.addAccount(acc));
ipcMain.handle('storage:deleteAccount', (e, id) => storage.deleteAccount(id));
ipcMain.handle('storage:getHistory', () => storage.getHistory());

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

ipcMain.handle('renderer:cancelRender', (e, taskId) => {
  return renderer.cancelRender(taskId);
});

// ------------------- Stage 2: AI Pipeline IPC -------------------
ipcMain.handle('ai:getVoices', async () => {
  return await aiPipeline.getVoices();
});

ipcMain.handle('ai:synthesizeVoice', async (e, text, voice, outputFile, rate, pitch) => {
  return await aiPipeline.synthesizeVoice(text, voice, outputFile, rate, pitch);
});

ipcMain.handle('ai:translateScript', async (e, text, targetLang, apiKey, provider) => {
  return await aiPipeline.translateScript(text, targetLang, apiKey, provider);
});

ipcMain.handle('ai:generateAss', async (e, cues, outputPath, options) => {
  return aiPipeline.generateAssSubtitles(cues, outputPath, options);
});

ipcMain.handle('ai:mixAudioDucking', async (e, videoPath, voicePath, outputPath, duckingVol) => {
  return await aiPipeline.mixAudioDucking(videoPath, voicePath, outputPath, duckingVol);
});

// ------------------- Stage 3: Channel Manager & Publisher IPC -------------------
ipcMain.handle('channel:importCookies', async (e, platform, cookies, proxy, name, options) => {
  return await channelManager.importCookies(platform, cookies, proxy, name, options);
});

ipcMain.handle('channel:interactiveLogin', async (e, platform, proxy, options) => {
  return await channelManager.interactiveLogin(platform, proxy, (msg) => sendLog(msg), options);
});

ipcMain.handle('channel:checkStatus', async (e, id) => {
  return await channelManager.checkAccountStatus(id);
});

ipcMain.handle('channel:openBrowser', async (e, accountId) => {
  return await channelManager.openProfileBrowser(accountId);
});

ipcMain.handle('channel:updateSettings', async (e, accountId, patch) => {
  return channelManager.updateAccountSettings(accountId, patch);
});

ipcMain.handle('channel:getToken', async (e, accountId) => {
  return await channelManager.getAccountToken(accountId);
});

ipcMain.handle('publisher:addToQueue', (e, videoPath, accounts, options) => {
  return publisher.addToQueue(videoPath, accounts, options);
});

ipcMain.handle('publisher:getQueue', () => {
  return publisher.getQueue();
});

ipcMain.handle('publisher:processQueue', async () => {
  return await publisher.processQueue((prog) => sendProgress({ type: 'publish', ...prog }));
});

// ------------------- Dialogs IPC -------------------
ipcMain.handle('dialog:pickDirectory', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (!res.canceled && res.filePaths.length > 0) {
    return res.filePaths[0];
  }
  return null;
});

ipcMain.handle('dialog:openDirectory', async (e, dir) => {
  if (fs.existsSync(dir)) {
    shell.openPath(dir);
    return true;
  }
  return false;
});

ipcMain.handle('dialog:pickFile', async (e, filters = []) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters
  });
  if (!res.canceled && res.filePaths.length > 0) {
    return res.filePaths[0];
  }
  return null;
});
