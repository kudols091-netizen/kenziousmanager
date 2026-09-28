const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Storage & Settings
  getSettings: () => ipcRenderer.invoke('storage:getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('storage:saveSettings', settings),
  getPresets: () => ipcRenderer.invoke('storage:getPresets'),
  savePresets: (presets) => ipcRenderer.invoke('storage:savePresets', presets),
  getAccounts: () => ipcRenderer.invoke('storage:getAccounts'),
  addAccount: (acc) => ipcRenderer.invoke('storage:addAccount', acc),
  deleteAccount: (id) => ipcRenderer.invoke('storage:deleteAccount', id),
  getHistory: () => ipcRenderer.invoke('storage:getHistory'),

  // Stage 1: Download & Render
  getVideoInfo: (url) => ipcRenderer.invoke('downloader:getVideoInfo', url),
  downloadVideo: (url, options) => ipcRenderer.invoke('downloader:downloadVideo', url, options),
  cancelDownload: (taskId) => ipcRenderer.invoke('downloader:cancelDownload', taskId),
  renderVideo: (inputPath, outputPath, options) => ipcRenderer.invoke('renderer:renderVideo', inputPath, outputPath, options),
  cancelRender: (taskId) => ipcRenderer.invoke('renderer:cancelRender', taskId),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  openDirectory: (dir) => ipcRenderer.invoke('dialog:openDirectory', dir),
  pickFile: (filters) => ipcRenderer.invoke('dialog:pickFile', filters),

  // Stage 2: AI Pipeline
  getVoices: () => ipcRenderer.invoke('ai:getVoices'),
  synthesizeVoice: (text, voice, outputFile, rate, pitch) => ipcRenderer.invoke('ai:synthesizeVoice', text, voice, outputFile, rate, pitch),
  translateScript: (text, targetLang, apiKey, provider) => ipcRenderer.invoke('ai:translateScript', text, targetLang, apiKey, provider),
  generateAss: (cues, outputPath, options) => ipcRenderer.invoke('ai:generateAss', cues, outputPath, options),
  mixAudioDucking: (videoPath, voicePath, outputPath, duckingVol) => ipcRenderer.invoke('ai:mixAudioDucking', videoPath, voicePath, outputPath, duckingVol),

  // Stage 3: Channel Manager & Publishing
  importCookies: (platform, cookies, proxy, name, options) => ipcRenderer.invoke('channel:importCookies', platform, cookies, proxy, name, options),
  interactiveLogin: (platform, proxy, options) => ipcRenderer.invoke('channel:interactiveLogin', platform, proxy, options),
  checkAccountStatus: (id) => ipcRenderer.invoke('channel:checkStatus', id),
  openBrowser: (accountId) => ipcRenderer.invoke('channel:openBrowser', accountId),
  updateAccountSettings: (accountId, patch) => ipcRenderer.invoke('channel:updateSettings', accountId, patch),
  getAccountToken: (accountId) => ipcRenderer.invoke('channel:getToken', accountId),
  addToPublishQueue: (videoPath, accounts, options) => ipcRenderer.invoke('publisher:addToQueue', videoPath, accounts, options),
  getPublishQueue: () => ipcRenderer.invoke('publisher:getQueue'),
  processPublishQueue: () => ipcRenderer.invoke('publisher:processQueue'),

  // Event Listeners from Main Process
  onProgress: (callback) => ipcRenderer.on('progress:update', (event, data) => callback(data)),
  onLog: (callback) => ipcRenderer.on('log:update', (event, text) => callback(text))
});
