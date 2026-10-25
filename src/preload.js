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
  getPrompts: () => ipcRenderer.invoke('storage:getPrompts'),
  savePrompts: (data) => ipcRenderer.invoke('storage:savePrompts', data),
  openWorkspaceWindow: (workspace) => ipcRenderer.invoke('window:openWorkspace', { workspace }),

  // Stage 1: Download & Render
  getVideoInfo: (url) => ipcRenderer.invoke('downloader:getVideoInfo', url),
  scanChannel: (url, limit) => ipcRenderer.invoke('downloader:scanChannel', url, limit),
  getVideoMetadata: (videoPath) => ipcRenderer.invoke('renderer:getVideoMetadata', videoPath),
  downloadVideo: (url, options) => ipcRenderer.invoke('downloader:downloadVideo', url, options),
  cancelDownload: (taskId) => ipcRenderer.invoke('downloader:cancelDownload', taskId),
  renderVideo: (inputPath, outputPath, options) => ipcRenderer.invoke('renderer:renderVideo', inputPath, outputPath, options),
  cancelRender: (taskId) => ipcRenderer.invoke('renderer:cancelRender', taskId),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  openDirectory: (dir) => ipcRenderer.invoke('dialog:openDirectory', dir),
  pickFile: (filters) => ipcRenderer.invoke('dialog:pickFile', filters),

  // Stage 2: AI Pipeline & Phase 3 Dubbing Engine
  getVoices: () => ipcRenderer.invoke('ai:getVoices'),
  synthesizeVoice: (text, voiceOrOpts, outputFile, rate, pitch) => ipcRenderer.invoke('ai:synthesizeVoice', text, voiceOrOpts, outputFile, rate, pitch),
  translateScript: (text, targetLang, apiKey, provider) => ipcRenderer.invoke('ai:translateScript', text, targetLang, apiKey, provider),
  generateAss: (cues, outputPath, options) => ipcRenderer.invoke('ai:generateAss', cues, outputPath, options),
  mixAudioDucking: (videoPath, voicePath, outputPath, options) => ipcRenderer.invoke('ai:mixAudioDucking', videoPath, voicePath, outputPath, options),
  softShortenVi: (text, options) => ipcRenderer.invoke('ai:softShorten', text, options),
  separateAudio: (inputMedia, outputDir, options) => ipcRenderer.invoke('ai:separateAudio', inputMedia, outputDir, options),
  checkDemucs: (force) => ipcRenderer.invoke('ai:checkDemucs', !!force),
  loginGeminiInteractive: (options) => ipcRenderer.invoke('ai:browserAccountLoginGemini', options),

  // Stage 3: Channel Manager & Publishing
  importCookies: (platform, cookies, proxy, name, options) => ipcRenderer.invoke('channel:importCookies', platform, cookies, proxy, name, options),
  interactiveLogin: (platform, proxy, options) => ipcRenderer.invoke('channel:interactiveLogin', platform, proxy, options),
  grabCookieViaExtension: (platform, proxy, options) => ipcRenderer.invoke('channel:grabCookieViaExtension', platform, proxy, options),
  useIgCookieForDownload: () => ipcRenderer.invoke('account:useIgCookieForDownload'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdate: () => ipcRenderer.invoke('app:checkForUpdate'),
  checkAccountStatus: (id) => ipcRenderer.invoke('channel:checkStatus', id),
  openBrowser: (accountId) => ipcRenderer.invoke('channel:openBrowser', accountId),
  updateAccountSettings: (accountId, patch) => ipcRenderer.invoke('channel:updateSettings', accountId, patch),
  getAccountToken: (accountId) => ipcRenderer.invoke('channel:getToken', accountId),
  getDestinations: (accountId) => ipcRenderer.invoke('channel:getDestinations', accountId),
  refreshDestinations: (accountId) => ipcRenderer.invoke('channel:refreshDestinations', accountId),
  toggleDestination: (accountId, destId, selected) => ipcRenderer.invoke('channel:toggleDestination', accountId, destId, selected),
  checkProxy: (rawProxy, timeoutMs) => ipcRenderer.invoke('proxy:check', rawProxy, timeoutMs),

  // Stage 1/2: Ingestion Pipeline (Douyin & WebTorrent)
  probeDouyin: (url) => ipcRenderer.invoke('downloader:probeDouyin', url),
  downloadDouyin: (url, outputDir) => ipcRenderer.invoke('downloader:downloadDouyin', url, outputDir),
  inspectTorrent: (source) => ipcRenderer.invoke('torrent:inspect', source),
  downloadTorrent: (source, fileIndices, outputDir) => ipcRenderer.invoke('torrent:download', source, fileIndices, outputDir),
  cancelTorrent: (infoHash) => ipcRenderer.invoke('torrent:cancel', infoHash),
  addToPublishQueue: (videoPath, accounts, options) => ipcRenderer.invoke('publisher:addToQueue', videoPath, accounts, options),
  publisherAddVideos: (videoPaths, gapMinutes, accounts) => ipcRenderer.invoke('publisher:addVideosToQueue', videoPaths, gapMinutes, accounts),
  getPublishQueue: () => ipcRenderer.invoke('publisher:getQueue'),
  publisherGetQueue: () => ipcRenderer.invoke('publisher:getQueue'),
  publisherGetQueueEvents: () => ipcRenderer.invoke('publisher:getQueueEvents'),
  getQueueEvents: () => ipcRenderer.invoke('publisher:getQueueEvents'),
  publisherGetSessions: () => ipcRenderer.invoke('publisher:getSessions'),
  publisherGetEvents: (sessionId) => ipcRenderer.invoke('publisher:getEvents', sessionId),
  publisherStartSession: (sessionId) => ipcRenderer.invoke('publisher:startSession', sessionId),
  publisherPauseSession: () => ipcRenderer.invoke('publisher:pauseSession'),
  publisherClearQueue: () => ipcRenderer.invoke('publisher:clearQueue'),
  scanFolderClips: (dirPath) => ipcRenderer.invoke('publisher:scanFolderClips', dirPath),
  saveJobDraft: (job) => ipcRenderer.invoke('publisher:saveJobDraft', job),
  getJobDraft: (id) => ipcRenderer.invoke('publisher:getJobDraft', id),
  getVideoThumbnail: (videoPath) => ipcRenderer.invoke('publisher:getVideoThumbnail', videoPath),
  publisherCreatePublishSession: (payload) => ipcRenderer.invoke('publisher:createPublishSession', payload),
  publisherStartJob: (payload) => ipcRenderer.invoke('publisher:startJob', payload),

  // Stage 5: Kenzious Kit Tool (Facebook EAAB, UID & Audio Isolation)
  extractEaabToken: (options) => ipcRenderer.invoke('toolkit:extractEaabToken', options),
  convertUrlsToUid: (urls) => ipcRenderer.invoke('toolkit:convertUrlsToUid', urls),
  onUidProgress: (callback) => {
    ipcRenderer.removeAllListeners('toolkit:uidProgress');
    ipcRenderer.on('toolkit:uidProgress', (event, data) => callback(data));
  },

  // Stage 6: License & HWID Security
  licenseGetStatus: () => ipcRenderer.invoke('license:getStatus'),
  licenseGetHWID: () => ipcRenderer.invoke('license:getHWID'),
  licenseActivate: (key) => ipcRenderer.invoke('license:activate', key),
  licenseDeactivate: () => ipcRenderer.invoke('license:deactivate'),

  // Event Listeners from Main Process
  onProgress: (callback) => ipcRenderer.on('progress:update', (event, data) => callback(data)),
  onLog: (callback) => ipcRenderer.on('log:update', (event, text) => callback(text))
});

// ==========================================
// KENZIOUS FACEBOOK REEL NATIVE BRIDGE (EB)
// ==========================================
contextBridge.exposeInMainWorld('EB', {
  __kenzi: true,
  installed: true,
  version: '2.0.0-native',
  ready: () => Promise.resolve(true),

  checkUidLive: async (uid) => {
    return await ipcRenderer.invoke('eb:checkUidLive', { uid });
  },

  cloneFetch: async (url, cookie, options) => {
    return await ipcRenderer.invoke('eb:cloneFetch', { url, cookie: cookie || '', options: options || {} });
  },

  fbLogin: async (uid, password, secret) => {
    return await ipcRenderer.invoke('eb:fbLogin', { uid, password, secret: secret || '' });
  },

  getTokenFromCookie: async (cookie) => {
    const res = await ipcRenderer.invoke('eb:getTokenFromCookie', { cookie: cookie || '' });
    return res && res.token;
  },

  get2faOtp: async (secret) => {
    return await ipcRenderer.invoke('eb:get2faOtp', { secret: secret || '' });
  },

  
  uploadPhoto: async (url, b64, fileName, fileType, iUser) => {
    return await ipcRenderer.invoke('eb:uploadPhoto', { url, b64, fileName, fileType, iUser });
  },

  cloneUploadPhoto: async (url, cookie, b64, fileName, fileType) => {
    return await ipcRenderer.invoke('eb:uploadPhoto', { url, cookie: cookie || '', b64, fileName, fileType });
  },
  uploadReel: async (url, headers, b64, onProgress) => {
    const CH = 12 * 1024 * 1024; // 12MB chunks
    const uploadId = 'r' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const total = Math.max(1, Math.ceil(b64.length / CH));
    const note = (i, ph) => { try { if (onProgress) onProgress(i, total, ph); } catch (_) {} };
    for (let i = 0; i < total; i++) {
      const chunk = b64.slice(i * CH, (i + 1) * CH);
      const last = (i === total - 1);
      note(i + 1, last ? 'sending' : 'chunk');
      const r = await ipcRenderer.invoke('eb:uploadReelChunk', {
        uploadId,
        b64: chunk,
        last,
        url: last ? url : '',
        headers: last ? (headers || {}) : {}
      });
      if (!r || !r.ok) throw new Error((r && (r.error || r.text)) || 'Upload Reel chunk lỗi');
      if (last) { note(total, 'done'); return r; }
    }
  },

  openViaBrowser: async (opts) => {
    return await ipcRenderer.invoke('eb:openViaBrowser', opts || {});
  },
  openCookieBrowser: async (url, proxy) => {
    return await ipcRenderer.invoke('eb:openCookieBrowser', url || '', proxy || '');
  },

  testProxy: async (opts) => {
    return await ipcRenderer.invoke('eb:testProxy', opts || {});
  },

  syncCloneProxies: async (source, entries) => {
    return await ipcRenderer.invoke('eb:syncCloneProxies', { source, entries: entries || [] });
  },

  getCurrentFbUid: async () => '',
  storage: {
    get: async (keys) => {
      const res = {};
      const arr = Array.isArray(keys) ? keys : [keys];
      arr.forEach(k => { try { res[k] = localStorage.getItem(k); } catch (_) {} });
      return res;
    },
    set: async (obj) => {
      Object.keys(obj || {}).forEach(k => {
        try { localStorage.setItem(k, typeof obj[k] === 'string' ? obj[k] : JSON.stringify(obj[k])); } catch (_) {}
      });
      return { ok: true };
    },
    remove: async (keys) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      arr.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
      return { ok: true };
    }
  },
  ping: () => Promise.resolve({ ok: true, native: true }),
  keepAlive: () => Promise.resolve(true),
  onMessage: (fn) => () => {}
});

// Kho đã mã hoá (DPAPI) cho dữ liệu clone nhạy cảm — API đồng bộ giống localStorage
contextBridge.exposeInMainWorld('KZSecure', {
  getItem: (key) => {
    const r = ipcRenderer.sendSync('secure-kv:get', String(key));
    if (!r || !r.ok) throw new Error((r && r.error) || 'secure-kv lỗi');
    return r.value;
  },
  setItem: (key, value) => {
    const r = ipcRenderer.sendSync('secure-kv:set', String(key), value == null ? null : String(value));
    if (!r || !r.ok) throw new Error((r && r.error) || 'secure-kv lỗi');
  },
  removeItem: (key) => {
    ipcRenderer.sendSync('secure-kv:set', String(key), null);
  }
});
