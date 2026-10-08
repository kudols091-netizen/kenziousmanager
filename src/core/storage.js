const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const secure = require('./secure-store');

// Field được mã hoá khi lưu xuống đĩa (DPAPI) — xem secure-store.js
const ACCOUNT_SECRET_FIELDS = ['cookies', 'token'];
const SETTINGS_SECRET_FIELDS = ['apiKey', 'elevenLabsApiKey', 'openSubtitlesApiKey', 'geminiWebCookies', 'igCookie'];

function resolveBundledBin(name) {
  const local = path.join(__dirname, '..', '..', 'bin', name);
  if (fs.existsSync(local)) return local;
  if (process.resourcesPath) {
    const resPath = path.join(process.resourcesPath, 'bin', name);
    if (fs.existsSync(resPath)) return resPath;
  }
  return name;
}

const DATA_DIR = paths.getDataDir();
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const PROMPTS_FILE = path.join(DATA_DIR, 'prompts.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(file, defaultVal) {
  return paths.readJsonSafe(file, defaultVal);
}

function writeJson(file, data) {
  try {
    // Ghi file tạm rồi rename: tắt máy giữa chừng không làm cụt accounts.json / settings.json
    paths.writeJsonAtomic(file, data);
    return true;
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
    return false;
  }
}

const DEFAULT_MASTER_PROMPT = `Bạn là biên tập viên lồng tiếng: định hình nội dung gốc thành lời người Việt đang nói trên camera — ấm, rõ nghĩa, nghe như người thật, không như bản dịch máy.

Nhiệm vụ: hiểu ý cả đoạn rồi viết lại kịch bản tiếng Việt dùng chung cho phụ đề + TTS. Không dịch từng chữ; không giữ cấu trúc câu Trung/Anh cứng.

Ưu tiên (theo thứ tự) — bắt buộc:
1) Người Việt nghe xong HIỂU NGAY chuyện gì đang xảy ra
2) Đúng ý / đúng thông tin cốt lõi
3) Câu trọn nghĩa khi đọc to (cấm câu cụt, câu rác)
4) Tự nhiên như người Việt nói
5) Đúng cảm xúc cảnh + khớp thời lượng đọc
6) Mới đến giống chữ gốc.
Naturalness over literalness: chọn câu nói tự nhiên đúng ý thay vì dịch sát chữ.

Định hình nội dung (bắt buộc):
- Mỗi cue phải là một ý nói trọn: ai/cái gì + đang làm gì / cảm giác gì.
- Cấm câu vô nghĩa, câu nửa vời, câu chỉ còn danh từ rời; cấm giữ nguyên trật tự chữ Trung cứng.
- Được đổi cấu trúc hoàn toàn miễn giữ đúng thông tin cốt lõi (sự kiện, số liệu, tên riêng, quan hệ nhân vật).
- Nối mạch giữa các cue: nghe như cùng một đoạn thoại / một câu chuyện liền — không nhảy ý lung tung.

Hán-Việt chỉ cho tên riêng và thuật ngữ — câu thoại phải là tiếng Việt thật:
- Phiên âm Hán-Việt CHỈ áp dụng: tên người, địa danh, môn phái, cảnh giới, chiêu thức, pháp bảo (Thanh Vân Tông, Trúc Cơ kỳ, Tôn Ngộ Không…).
- MỌI phần còn lại phải dịch ra NGHĨA bằng tiếng Việt người thường nghe hiểu ngay — CẤM phiên âm cả câu / thành ngữ / thơ theo âm Hán-Việt.
- SAI: «Thử vấn thiên hạ thùy nhân bất thức quân». ĐÚNG: «Hỏi khắp thiên hạ ai người không biết đến ngài».
- Tự kiểm: đọc to cho người Việt không biết tiếng Trung — không hiểu nghĩa → đó là phiên âm, phải dịch lại.

Khi gốc là tiếng Trung (ASR thường lỗi / lẫn / thiếu chữ):
- Đọc cả batch để suy ra mạch hội thoại thật (ai nói với ai, chuyện gì).
- Viết lại tiếng Việt rõ nghĩa theo mạch đó; KHÔNG dịch máy từng chữ ASR lỗi thành câu Việt vô nghĩa.
- Lời hát / thơ / thành ngữ cũng phải dịch nghĩa sang tiếng Việt — CẤM giữ nguyên chữ Hán trên phụ đề hoặc TTS.
- Cấm giữ tiếng Anh lẫn trong câu (insists, OK, hello…); viết thuần Việt.
- Cấm kết mọi câu bằng «à / ạ / đây» vô nghĩa chỉ để cho dài.
- Cấm câu mơ hồ kiểu «có gì đó thôi», «làm được cái gì đó» khi ngữ cảnh cho phép nói rõ hơn.
- Tự kiểm: người Việt chưa xem bản gốc có nắm được tình huống không? Không → viết lại. Còn bất kỳ chữ Hán nào → dịch lại.

Xưng hô trong batch (nhất quán):
- Đọc cả batch (+ previousContext nếu có) để suy quan hệ (cha–con, anh–em, sư–đệ, bạn bè, người lạ…) rồi chọn đại từ ĐÚNG VAI; giữ nguyên cặp gọi/tự xưng xuyên suốt batch.
- Trong cùng một câu: từ GỌI và từ TỰ XƯNG phải khớp (gọi anh → xưng em; gọi cha → xưng con; gọi sư phụ → xưng đệ tử; gọi ngươi → xưng ta).
- CẤM chữ «bạn / các bạn» khi dịch máy móc 你/你们 trong LỜI THOẠI giữa nhân vật (nghe sách giáo khoa). Thay bằng anh/chị/cậu/em/ông/bà/mày tùy quan hệ.
- NGOẠI LỆ được dùng «bạn/các bạn»: (1) nghĩa bạn bè; (2) lời hệ thống/game nói với người chơi; (3) dẫn/vlog/review nói thẳng với người xem.
- Không chắc giới tính → dùng từ trung tính (vị này, người này); không đoán bừa anh/chị.

Quy trình trong đầu (không viết ra ngoài JSON):
1) Đọc fullScript (cả clip) + topicBrief để hiểu kịch bản chung — chuyện gì, ai muốn gì.
2) Viết lời Việt như một đoạn chuyển CÓ NGHĨA; không dịch từng chữ / từng cue rời.`;

const DEFAULT_STYLE_PRESETS = [
  { id: 'general', name: 'Prompt chung', icon: '📝', rules: 'Áp dụng toàn bộ quy tắc biên dịch tiếng Việt tự nhiên chuẩn Master.' },
  { id: 'literal', name: 'Giữ nguyên', icon: '🔒', rules: 'Dịch sát nghĩa câu gốc nhất có thể, giữ nguyên cấu trúc ngữ pháp và thuật ngữ gốc.' },
  { id: 'viral', name: 'Viral / Reels', icon: '⚡', rules: 'Câu ngắn dưới 15 chữ, dùng từ cảm xúc mạnh, giật tít hook ngay 3 giây đầu, tiết tấu nhanh dồn dập.' },
  { id: 'movie_review', name: 'Review phim', icon: '🎬', rules: 'Văn phong tóm tắt điện ảnh, dùng từ dẫn truyện lôi cuốn ("Người đàn ông này...", "Ai ngờ được..."), giọng kịch tính.' },
  { id: 'gameplay', name: 'Gameplay', icon: '🎮', rules: 'Sôi nổi, dùng thuật ngữ game quen thuộc (combat, gank, outplay, đồ khủng), tương tác trực tiếp với người xem.' },
  { id: 'podcast', name: 'Podcast / Hội thoại', icon: '🎙️', rules: 'Trầm lắng, chiêm nghiệm, câu từ sâu sắc, ngắt nghỉ tự nhiên như hai người bạn tâm sự.' },
  { id: 'news', name: 'Tin tức', icon: '📰', rules: 'Khách quan, ngắn gọn, súc tích, câu chuẩn ngữ pháp báo chí, đưa số liệu và sự kiện lên đầu.' },
  { id: 'vlog', name: 'Vlog', icon: '📹', rules: 'Thân mật, xưng mình / các bạn, câu văn tự nhiên đời thường, tràn đầy năng lượng tích cực.' },
  { id: 'food_review', name: 'Review ẩm thực', icon: '🍜', rules: 'Tập trung miêu tả hương vị, màu sắc, độ giòn/béo/đậm đà, kích thích vị giác người xem.' },
  { id: 'product_review', name: 'Review sản phẩm', icon: '📦', rules: 'Khách quan, nhấn mạnh tính năng nổi bật, ưu nhược điểm thực tế, lời khuyên chọn mua thực tế.' },
  { id: 'sales', name: 'Bán hàng', icon: '🏷️', rules: 'Thúc giục hành động (CTA), nêu bật khuyến mãi, giải quyết nỗi đau khách hàng, tạo cảm giác khan hiếm.' },
  { id: 'funny', name: 'Hài hước', icon: '🤣', rules: 'Dùng từ lóng bắt trend TikTok, so sánh dí dỏm, chơi chữ bất ngờ, tạo tiếng cười sảng khoái.' },
  { id: 'story', name: 'Kể chuyện', icon: '📖', rules: 'Dẫn dắt lớp lang, tạo kịch tính, gợi mở tò mò, cao trào và kết bài mang bài học sâu sắc.' },
  { id: 'period_drama', name: 'Cổ trang', icon: '🏯', rules: 'Dùng từ ngữ cổ phong, kiếm hiệp, xưng hô tại hạ/các hạ/sư huynh/tiểu muội, bảo lưu tên chiêu thức Hán-Việt đẹp.' },
  { id: 'natural', name: 'Tự nhiên', icon: '🌿', rules: 'Mềm mại, dùng từ ngữ thông dụng của người Việt thế hệ trẻ, xóa bỏ hoàn toàn dấu vết dịch máy.' },
  { id: 'ads', name: 'Quảng cáo', icon: '📢', rules: 'Slogan ngắn gọn, bắt tai, lặp lại thông điệp thương hiệu, thông điệp tích cực.' },
  { id: 'narration', name: 'Thuyết minh', icon: '📻', rules: 'Chuẩn giọng phát thanh truyền hình, rành mạch, trang trọng, âm điệu truyền cảm.' }
];

const DEFAULT_SETTINGS = {
  outputDir: paths.getDefaultOutputDir(),
  concurrency: 2,
  language: 'vi',
  theme: 'dark',
  colorTone: 'magenta_kenzious',
  renderEngine: 'auto_gpu', // 'auto_gpu' | 'gpu_only' | 'cpu_only'
  saveVideoAssets: true,
  deleteOriginalAfterRender: false,
  openSubtitlesApiKey: '',
  soundAlertEnabled: true,
  soundAlertType: 'soft',

  // Binary Tools
  ffmpegPath: resolveBundledBin('ffmpeg.exe'),
  ffprobePath: resolveBundledBin('ffprobe.exe'),
  ytdlpPath: resolveBundledBin('yt-dlp.exe'),
  pythonPath: 'python',

  // AI Tier Priorities
  aiTierPriority: 'browser', // 'local' | 'api' | 'browser'
  aiLocalEnabled: false,
  aiApiEnabled: false,
  aiBrowserEnabled: true,
  aiProvider: 'gemini',
  apiKey: '',

  // TTS Hub
  ttsEngine: 'omnivoice',
  defaultVoice: 'vi-VN-HoaiMyNeural',
  voiceRate: '+0%',
  voicePitch: '+0Hz',
  audioDuckingVolume: 0.18,
  ttsHubActiveEngine: 'kokoro',
  elevenLabsEnabled: false,
  elevenLabsApiKey: '',
  elevenLabsModel: 'eleven_multilingual_v2',

  // Prompts & Render Presets
  activePromptStyle: 'general',
  defaultRenderPreset: 'tiktok_viral',
  watermarkDefaultText: '@KenziousReel',
  watermarkEnabled: false,
  autoSubtitles: true,
  postGapMinutes: 20,

  // Package Manager Status Cache
  packagesStatus: {
    'demucs': false,
    'kenzi-brain-engine': true,
    'kenzi-brain-engine-gpu': true,
    'kenzi-brain-zhvi': false,
    'kenzi-brain-max': false,
    'kenzi-brain-upscale-real': true,
    'whisper-turbo': false,
    'kenzi-clean-lama': false,
    'paddle-ocr': false,
    'kenzi-vi-ocr': false,
    'omnivoice': false,
    'vieneu': false
  }
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
    if (!fs.existsSync(PROMPTS_FILE)) {
      writeJson(PROMPTS_FILE, {
        masterPrompt: DEFAULT_MASTER_PROMPT,
        styles: DEFAULT_STYLE_PRESETS
      });
    }
  }

  getSettings() {
    const s = secure.openFields(readJson(SETTINGS_FILE, DEFAULT_SETTINGS));
    const merged = { ...DEFAULT_SETTINGS, ...s };
    if (merged.ffmpegPath && !fs.existsSync(merged.ffmpegPath)) {
      merged.ffmpegPath = DEFAULT_SETTINGS.ffmpegPath;
    }
    if (merged.ffprobePath && !fs.existsSync(merged.ffprobePath)) {
      merged.ffprobePath = DEFAULT_SETTINGS.ffprobePath;
    }
    if (merged.ytdlpPath && !fs.existsSync(merged.ytdlpPath)) {
      merged.ytdlpPath = DEFAULT_SETTINGS.ytdlpPath;
    }
    if (merged.outputDir && !fs.existsSync(merged.outputDir)) {
      merged.outputDir = DEFAULT_SETTINGS.outputDir;
    }
    return merged;
  }

  saveSettings(newSettings) {
    const current = this.getSettings();
    const updated = { ...current, ...newSettings };
    delete updated._sealedError;
    writeJson(SETTINGS_FILE, secure.sealFields(updated, SETTINGS_SECRET_FIELDS));
    return updated;
  }

  getPromptsData() {
    return readJson(PROMPTS_FILE, {
      masterPrompt: DEFAULT_MASTER_PROMPT,
      styles: DEFAULT_STYLE_PRESETS
    });
  }

  savePromptsData(data) {
    writeJson(PROMPTS_FILE, data);
    return data;
  }

  getPresets() {
    return readJson(PRESETS_FILE, DEFAULT_PRESETS);
  }

  savePresets(presets) {
    return writeJson(PRESETS_FILE, presets);
  }

  getAccounts() {
    return readJson(ACCOUNTS_FILE, []).map(raw => {
      const acc = secure.openFields(raw);
      // Không giải mã được cookie/token (dữ liệu chép từ máy hoặc user Windows khác) → cần đăng nhập lại
      if (acc && acc._sealedError) acc.status = 'disconnected';
      return acc;
    });
  }

  saveAccounts(accounts) {
    return writeJson(ACCOUNTS_FILE, accounts.map(a => secure.sealFields(a, ACCOUNT_SECRET_FIELDS)));
  }

  /**
   * Gọi khi app sẵn sàng: mã hoá cookie/token/API key còn ở dạng plaintext từ các bản cũ,
   * và xoá bản sao profiles/<id>/cookies.json (không còn nơi nào đọc; cookie đã nằm mã hoá trong accounts.json).
   */
  migrateSecrets() {
    const result = { available: secure.isAvailable(), accounts: 0, settings: false, removedCookieFiles: 0 };
    if (!result.available) return result;

    const accounts = this.getAccounts();
    const rawAccounts = readJson(ACCOUNTS_FILE, []);
    if (rawAccounts.some(a => secure.hasPlainSecrets(a, ACCOUNT_SECRET_FIELDS))) {
      this.saveAccounts(accounts);
      result.accounts = rawAccounts.filter(a => secure.hasPlainSecrets(a, ACCOUNT_SECRET_FIELDS)).length;
    }
    for (const acc of accounts) {
      const copy = acc.profileDir ? path.join(acc.profileDir, 'cookies.json') : null;
      if (copy && Array.isArray(acc.cookies) && acc.cookies.length > 0 && fs.existsSync(copy)) {
        try { fs.unlinkSync(copy); result.removedCookieFiles++; } catch (_) {}
      }
    }

    const rawSettings = readJson(SETTINGS_FILE, null);
    if (rawSettings && secure.hasPlainSecrets(rawSettings, SETTINGS_SECRET_FIELDS)) {
      this.saveSettings({});
      result.settings = true;
    }
    return result;
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

  updateAccount(acc) {
    const accounts = this.getAccounts();
    const idx = accounts.findIndex(a => a.id === acc.id);
    if (idx >= 0) {
      accounts[idx] = { ...accounts[idx], ...acc, updatedAt: Date.now() };
      this.saveAccounts(accounts);
      return accounts[idx];
    }
    return this.addAccount(acc);
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
    if (history.length > 200) history.length = 200;
    writeJson(HISTORY_FILE, history);
    return history;
  }
}

module.exports = new Storage();
