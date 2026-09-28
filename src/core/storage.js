const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(file, defaultVal) {
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
  }
  return defaultVal;
}

function writeJson(file, data) {
  try {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
    return false;
  }
}

const DEFAULT_SETTINGS = {
  outputDir: path.join(__dirname, '..', '..', 'output'),
  concurrency: 2,
  defaultRenderPreset: 'tiktok_viral',
  ffmpegPath: path.join(__dirname, '..', '..', 'bin', 'ffmpeg.exe'),
  ffprobePath: path.join(__dirname, '..', '..', 'bin', 'ffprobe.exe'),
  ytdlpPath: path.join(__dirname, '..', '..', 'bin', 'yt-dlp.exe'),
  pythonPath: 'python',
  aiProvider: 'gemini', // 'gemini' | 'openai' | 'deepseek'
  apiKey: '',
  defaultVoice: 'vi-VN-HoaiMyNeural',
  voiceRate: '+0%',
  voicePitch: '+0Hz',
  audioDuckingVolume: 0.18,
  watermarkDefaultText: '@KenziousReel',
  watermarkEnabled: false,
  autoSubtitles: true,
  postGapMinutes: 20
};

const DEFAULT_PRESETS = [
  {
    id: 'tiktok_viral',
    name: 'TikTok Viral (9:16 Vertical Blur + Karaoke Sub)',
    frameMode: 'vertical-blur',
    targetWidth: 1080,
    targetHeight: 1920,
    blurSigma: 8,
    mirrorFlip: false,
    addNoise: true,
    cropPercent: 1.5,
    tweakPitch: true,
    stripMetadata: true,
    watermarkText: '@KenziousReel',
    watermarkPos: 'bottom-right',
    titleHookEnabled: true,
    titleHookText: 'BÍ MẬT KHÔNG THỂ BỎ LỠ ⚡',
    subtitleKaraoke: true
  },
  {
    id: 'youtube_shorts',
    name: 'YouTube Shorts Clean (9:16 + Watermark)',
    frameMode: 'vertical-blur',
    targetWidth: 1080,
    targetHeight: 1920,
    blurSigma: 10,
    mirrorFlip: false,
    addNoise: false,
    cropPercent: 0,
    tweakPitch: false,
    stripMetadata: true,
    watermarkText: 'KENZIOUS SHORTS',
    watermarkPos: 'top-right',
    titleHookEnabled: false,
    subtitleKaraoke: true
  },
  {
    id: 'anti_copyright_heavy',
    name: 'Lách Bản Quyền Cực Mạnh (Flip + Noise + Crop + Audio)',
    frameMode: 'vertical-blur',
    targetWidth: 1080,
    targetHeight: 1920,
    blurSigma: 12,
    mirrorFlip: true,
    addNoise: true,
    cropPercent: 2.5,
    tweakPitch: true,
    stripMetadata: true,
    watermarkText: '@KenziousPro',
    watermarkPos: 'bottom-right',
    titleHookEnabled: true,
    titleHookText: 'XEM ĐẾN CUỐI ĐỂ BIẾT SỰ THẬT 🔥',
    subtitleKaraoke: true
  },
  {
    id: 'original_ratio',
    name: 'Giữ Nguyên Tỉ Lệ Gốc (Chỉ Lồng Tiếng AI)',
    frameMode: 'keep',
    targetWidth: 1080,
    targetHeight: 1920,
    blurSigma: 0,
    mirrorFlip: false,
    addNoise: false,
    cropPercent: 0,
    tweakPitch: false,
    stripMetadata: true,
    watermarkText: '',
    watermarkPos: 'bottom-right',
    titleHookEnabled: false,
    subtitleKaraoke: true
  }
];

class Storage {
  constructor() {
    ensureDir(DATA_DIR);
    if (!fs.existsSync(SETTINGS_FILE)) {
      writeJson(SETTINGS_FILE, DEFAULT_SETTINGS);
    }
    if (!fs.existsSync(PRESETS_FILE)) {
      writeJson(PRESETS_FILE, DEFAULT_PRESETS);
    }
    if (!fs.existsSync(ACCOUNTS_FILE)) {
      writeJson(ACCOUNTS_FILE, []);
    }
    if (!fs.existsSync(HISTORY_FILE)) {
      writeJson(HISTORY_FILE, []);
    }
  }

  getSettings() {
    const s = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...s };
  }

  saveSettings(newSettings) {
    const current = this.getSettings();
    const updated = { ...current, ...newSettings };
    writeJson(SETTINGS_FILE, updated);
    return updated;
  }

  getPresets() {
    return readJson(PRESETS_FILE, DEFAULT_PRESETS);
  }

  savePresets(presets) {
    return writeJson(PRESETS_FILE, presets);
  }

  getAccounts() {
    return readJson(ACCOUNTS_FILE, []);
  }

  saveAccounts(accounts) {
    return writeJson(ACCOUNTS_FILE, accounts);
  }

  addAccount(acc) {
    const accounts = this.getAccounts();
    const existingIndex = accounts.findIndex(a => a.id === acc.id || (a.platform === acc.platform && a.username === acc.username));
    if (existingIndex >= 0) {
      accounts[existingIndex] = { ...accounts[existingIndex], ...acc, updatedAt: Date.now() };
    } else {
      accounts.push({
        id: acc.id || `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...acc
      });
    }
    this.saveAccounts(accounts);
    return accounts;
  }

  deleteAccount(id) {
    const accounts = this.getAccounts().filter(a => a.id !== id);
    this.saveAccounts(accounts);
    return accounts;
  }

  getHistory() {
    return readJson(HISTORY_FILE, []);
  }

  addHistory(item) {
    const history = this.getHistory();
    history.unshift({
      id: `task_${Date.now()}`,
      timestamp: Date.now(),
      ...item
    });
    // keep last 200 items
    if (history.length > 200) history.length = 200;
    writeJson(HISTORY_FILE, history);
    return history;
  }
}

module.exports = new Storage();
