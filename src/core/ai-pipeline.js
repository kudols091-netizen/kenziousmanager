/**
 * Kenzious Reel V2 - AI Audio & Script Processing Pipeline (Clean-Room Master Engine)
 * Features:
 * 1. softShortenVi: Vietnamese Filler Word & Redundancy Pruner (time-budget fitting)
 * 2. Stem Audio Isolation: Demucs v4 HTDemucs & FFmpeg Spectral Inversion Fallback
 * 3. Multi-Engine Voice Synthesis: Edge TTS, OmniVoice, ElevenLabs
 * 4. Sidechain Audio Ducking (-14dB background dipping)
 * 5. Audio Extractor & Karaoke ASS Generator
 * 6. Google Gemini Web Interactive CDP Login & Session Extraction (Zoo Reup v2.03.00 Architecture)
 */

const { spawn } = require('child_process');
const { track, killTree } = require('./process-registry');
const path = require('path');
const fs = require('fs');
const net = require('net');
const storage = require('./storage');
const textShortener = require('./text-shortener');
const audioSeparator = require('./audio-separator');
const voiceSynthesizer = require('./voice-synthesizer');

class AiPipeline {
  constructor() {
    this.textShortener = textShortener;
    this.audioSeparator = audioSeparator;
    this.voiceSynthesizer = voiceSynthesizer;
  }

  getPythonPath() {
    const s = storage.getSettings();
    return s.pythonPath || 'python';
  }

  getFfmpegPath() {
    const s = storage.getSettings();
    if (s.ffmpegPath && fs.existsSync(s.ffmpegPath)) return s.ffmpegPath;
    const candidates = [
      path.join(__dirname, '..', '..', 'bin', 'ffmpeg.exe'),
      process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe') : null
    ].filter(Boolean);
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return 'ffmpeg';
  }

  getSystemBrowserPath() {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  async findFreePort() {
    return new Promise((resolve) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const port = srv.address().port;
        srv.close(() => resolve(port));
      });
    });
  }

  /**
   * 1. softShortenVi - Vietnamese Filler Word & Redundancy Pruner
   */
  softShortenVi(text, optionsOrDuration = {}) {
    return textShortener.softShortenVi(text, optionsOrDuration);
  }

  calculateTimeBudget(durationSeconds, charsPerSecond = 19) {
    return textShortener.calculateTimeBudget(durationSeconds, charsPerSecond);
  }

  fitToCueWindow(cues, options = {}) {
    return textShortener.fitToCueWindow(cues, options);
  }

  /**
   * 2. Audio Stem Separation (Vocals & BGM / no_vocals)
   */
  async separateAudio(inputMedia, outputDir, options = {}) {
    return await audioSeparator.separateAudio(inputMedia, outputDir, options);
  }

  async checkDemucs(force = false) {
    return await audioSeparator.checkDemucsInstalled(force);
  }

  /**
   * 3. Multi-Engine Voice Synthesis
   */
  async getVoices() {
    return await voiceSynthesizer.getVoices();
  }

  async synthesizeVoice(text, optionsOrVoice = 'vi-VN-HoaiMyNeural', outputFile = null, rate = '+0%', pitch = '+0Hz') {
    let opts = {};
    if (typeof optionsOrVoice === 'string') {
      opts = {
        voice: optionsOrVoice,
        outputFile: outputFile,
        rate: rate,
        pitch: pitch
      };
    } else {
      opts = optionsOrVoice;
      if (outputFile && !opts.outputFile) opts.outputFile = outputFile;
    }

    return await voiceSynthesizer.synthesizeVoice(text, opts);
  }

  /**
   * 4. Multi-Track Audio Ducking (-14dB sidechain compression)
   */
  async mixAudioDucking(videoOrBgPath, voicePath, outputPath, options = {}) {
    const ffmpeg = this.getFfmpegPath();
    // Hỗ trợ cách gọi cũ mixAudioDucking(..., 0.18) = âm lượng nhạc nền
    if (typeof options === 'number') options = { bgVolume: options };
    options = options || {};
    // Quyết định theo file ĐẦU RA: .aac/.mp3/.wav → chỉ xuất audio (nguồn có là video cũng vậy)
    const outputIsVideo = /\.(mp4|mkv|mov|webm|avi|flv|ts)$/i.test(outputPath);
    const bgVol = options.bgVolume !== undefined ? options.bgVolume : 1.0;
    const voiceVol = options.voiceVolume !== undefined ? options.voiceVolume : 1.25;

    const ext = path.extname(outputPath).toLowerCase();
    let audioCodec = 'aac';
    if (ext === '.mp3') audioCodec = 'libmp3lame';
    else if (ext === '.wav') audioCodec = 'pcm_s16le';

    return new Promise((resolve, reject) => {
      // Giọng đọc dùng 2 lần (tín hiệu sidechain + lớp trộn) → phải asplit, một nhãn filter chỉ được dùng 1 lần.
      // apad cho tín hiệu sidechain: sidechaincompress dừng khi 1 đầu vào hết → không có apad thì
      // tiếng gốc/nhạc nền bị cắt ngay khi giọng đọc kết thúc. amix normalize=0: không tự chia đôi âm lượng.
      const filter = `[0:a]aformat=channel_layouts=stereo,volume=${bgVol}[bg];` +
        `[1:a]aformat=channel_layouts=stereo,volume=${voiceVol},asplit=2[fg][sc0];[sc0]apad[sc];` +
        `[bg][sc]sidechaincompress=threshold=0.08:ratio=8:attack=20:release=350[ducked];` +
        `[ducked][fg]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]`;

      let args = [
        '-y',
        '-i', videoOrBgPath,
        '-i', voicePath,
        '-filter_complex', filter
      ];

      if (outputIsVideo) {
        args.push(
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          outputPath
        );
      } else {
        args.push(
          '-map', '[aout]',
          '-c:a', audioCodec
        );
        if (audioCodec !== 'pcm_s16le') {
          args.push('-b:a', '192k');
        }
        args.push(outputPath);
      }

      const proc = track(spawn(ffmpeg, args, { windowsHide: true }));
      let stderr = '';

      proc.stderr.on('data', d => stderr += d.toString());

      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else if (/matches no streams|does not contain any stream|Stream specifier ':a'/i.test(stderr)) {
          // Video gốc không có tiếng → chỉ dùng giọng đọc
          resolve(voicePath);
        } else {
          reject(new Error(`Failed to mix audio ducking: ${stderr.slice(-2000)}`));
        }
      });
      proc.on('error', err => reject(new Error(`Không chạy được ffmpeg (${ffmpeg}): ${err.message}`)));
    });
  }

  /**
   * 5. Extract audio from video to 16kHz Mono or 44.1kHz Stereo WAV
   */
  async extractAudio(videoPath, outputWav, channels = 1, sampleRate = 16000) {
    const ffmpeg = this.getFfmpegPath();
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', videoPath,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', String(sampleRate),
        '-ac', String(channels),
        outputWav
      ];

      const proc = track(spawn(ffmpeg, args, { windowsHide: true }));
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outputWav)) {
          resolve(outputWav);
        } else {
          reject(new Error(`Failed to extract audio: ${stderr}`));
        }
      });
      proc.on('error', err => reject(new Error(`Không chạy được ffmpeg (${ffmpeg}): ${err.message}`)));
    });
  }

  /**
   * 6. Generate Karaoke ASS Subtitles for 9:16 vertical video
   */
  generateAssSubtitles(cues, outputPath, options = {}) {
    const fontName = options.fontName || 'Roboto';
    const fontSize = options.fontSize || 42;
    const primaryColor = options.primaryColor || '&H0000FFFF';
    const secondaryColor = options.secondaryColor || '&H00FFFFFF';
    const outlineColor = options.outlineColor || '&H00000000';
    const shadowColor = options.shadowColor || '&H80000000';

    let assContent = `[Script Info]
Title: Kenzious Karaoke Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,${fontName},${fontSize},${primaryColor},${secondaryColor},${outlineColor},${shadowColor},-1,0,0,0,100,100,0,0,1,3.5,1.5,2,80,80,360,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const wordCues = (cues || []).filter(c => c.type === 'word' || (!c.type && c.text));
    if (wordCues.length === 0) {
      fs.writeFileSync(outputPath, assContent, 'utf-8');
      return outputPath;
    }

    const toAssTime = (ticks) => {
      const totalSec = typeof ticks === 'number' && ticks > 100000 ? ticks / 10000000 : Number(ticks || 0);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = Math.floor(totalSec % 60);
      const cs = Math.floor((totalSec * 100) % 100);
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    };

    const CHUNK_SIZE = 5;
    for (let i = 0; i < wordCues.length; i += CHUNK_SIZE) {
      const chunk = wordCues.slice(i, i + CHUNK_SIZE);
      const startTicks = chunk[0].offset || 0;
      const last = chunk[chunk.length - 1];
      const endTicks = (last.offset || 0) + (last.duration || 0);

      const startTimeStr = toAssTime(startTicks);
      const endTimeStr = toAssTime(endTicks);

      let kText = '';
      chunk.forEach(w => {
        const durSec = (w.duration || 0) > 100000 ? w.duration / 10000000 : Number(w.duration || 0.3);
        const kCentisec = Math.max(10, Math.round(durSec * 100));
        kText += `{\\k${kCentisec}}${w.text} `;
      });

      assContent += `Dialogue: 0,${startTimeStr},${endTimeStr},Karaoke,,0,0,0,,${kText.trim()}\n`;
    }

    fs.writeFileSync(outputPath, assContent, 'utf-8');
    return outputPath;
  }

  /**
   * 7. Google Gemini Web Interactive Login via CDP (Zoo Reup v2.03.00 Clean-Room Architecture)
   * Thay vì bắt người dùng điền API Key, mở trình duyệt Chrome/Edge độc lập để người dùng đăng nhập,
   * sau đó tự động phát hiện composer ready và trích xuất session cookies.
   */
  async loginGeminiInteractive(options = {}) {
    const timeoutMs = options.timeoutMs || 180000;
    const execPath = this.getSystemBrowserPath();
    if (!execPath) {
      return { ok: false, message: 'Không tìm thấy Google Chrome hoặc Microsoft Edge trên máy tính.' };
    }

    const freePort = await this.findFreePort();
    const profileDir = path.join(require('./paths').getDataDir(), 'gemini_browser_profile');
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    const args = [
      `--remote-debugging-port=${freePort}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      'https://accounts.google.com/ServiceLogin?continue=https://gemini.google.com/'
    ];

    const browserProc = track(spawn(execPath, args, { detached: true }));
    let playwright;
    try {
      playwright = require('playwright-core');
    } catch {
      return { ok: false, message: 'Thiếu thư viện playwright-core để kết nối CDP.' };
    }

    let browserCdp = null;
    const startTime = Date.now();

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 600));
      try {
        browserCdp = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${freePort}`);
        if (browserCdp) break;
      } catch {}
    }

    if (!browserCdp) {
      killTree(browserProc);
      return { ok: false, message: 'Không thể kết nối Chrome qua cổng gỡ lỗi từ xa CDP.' };
    }

    try {
      while (Date.now() - startTime < timeoutMs) {
        if (!browserCdp.isConnected()) break;
        const contexts = browserCdp.contexts();
        const pages = contexts.flatMap(c => c.pages()).filter(p => !p.isClosed());

        for (const page of pages) {
          const pageUrl = page.url();
          if (pageUrl.includes('gemini.google.com')) {
            const hasComposer = await page.evaluate(() => {
              const el = document.querySelector('rich-textarea, textarea, [contenteditable="true"], .ql-editor, bard-sidenav');
              return Boolean(el);
            }).catch(() => false);

            if (hasComposer) {
              const cookies = await contexts[0].cookies(['https://gemini.google.com', 'https://google.com']);
              storage.saveSettings({
                geminiWebCookies: cookies,
                geminiLoggedIn: true,
                geminiLastLogin: Date.now()
              });
              await browserCdp.close().catch(() => {});
              killTree(browserProc);
              return {
                ok: true,
                message: `Đăng nhập Gemini thành công! Đã bóc tách ${cookies.length} session cookies.`,
                cookiesCount: cookies.length
              };
            }
          }
        }
        await new Promise(r => setTimeout(r, 1500));
      }

      await browserCdp.close().catch(() => {});
      killTree(browserProc);
      return { ok: false, message: 'Đăng nhập Gemini bị quá thời gian chờ (timeout).' };
    } catch (err) {
      await browserCdp?.close().catch(() => {});
      killTree(browserProc);
      return { ok: false, message: err.message };
    }
  }
}

module.exports = new AiPipeline();
