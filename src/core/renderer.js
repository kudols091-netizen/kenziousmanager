const { spawn } = require('child_process');
const { track, killTree } = require('./process-registry');
const path = require('path');
const fs = require('fs');
const os = require('os');
const storage = require('./storage');

/**
 * Đường dẫn file đặt trong tham số filter (ass='...', textfile='...').
 * Hai lớp phân tích của ffmpeg: ':' tách option → '\:'; dấu ' không đặt được trong '...'
 * → đóng nháy, chèn \\\' (thành \' ở lớp option = ' thật), mở nháy lại.
 */
function quoteFilterPath(p) {
  const s = String(p).replace(/\\/g, '/').replace(/:/g, '\\:');
  return "'" + s.replace(/'/g, "'\\\\\\''") + "'";
}

// Pitch +2% giữ nguyên độ dài: chuẩn hoá về 44.1kHz trước để asetrate tính đúng với nguồn 48kHz
const PITCH_FACTOR = 1.02;
const PITCH_FILTER = `aresample=44100,asetrate=${Math.round(44100 * PITCH_FACTOR)},aresample=44100,atempo=${(1 / PITCH_FACTOR).toFixed(6)}`;

const BASE_CAP_PIXELS = 1080 * 1920;
const BASE_MAXRATE_KBPS = 8000;
const LONG_UPLOAD_MIN_SEC = 180;
const LONG_UPLOAD_MIN_MB = 150;
const SHORT_UPLOAD_WAIT_MS = 180000; // 3 phút
const MAX_UPLOAD_WAIT_MS = 3600000;  // 1 giờ

class Renderer {
  constructor() {
    this.activeRenders = new Map();
  }

  // drawtext với font='Name' cần fontconfig — bản ffmpeg bundle báo "Cannot load default config file"
  // nên dùng fontfile= trỏ thẳng file .ttf (ưu tiên Roboto bundle, fallback font hệ thống Windows).
  getFontFile() {
    if (this._fontFile) return this._fontFile;
    const candidates = [
      path.join(__dirname, '..', '..', 'assets', 'Roboto-Bold.ttf'),
      process.resourcesPath ? path.join(process.resourcesPath, 'assets', 'Roboto-Bold.ttf') : null,
      'C:/Windows/Fonts/arialbd.ttf',
      'C:/Windows/Fonts/segoeuib.ttf',
      'C:/Windows/Fonts/arial.ttf'
    ].filter(Boolean);
    for (const c of candidates) { try { if (fs.existsSync(c)) { this._fontFile = c; return c; } } catch (_) {} }
    this._fontFile = 'C:/Windows/Fonts/arial.ttf';
    return this._fontFile;
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

  getFfprobePath() {
    const s = storage.getSettings();
    if (s.ffprobePath && fs.existsSync(s.ffprobePath)) return s.ffprobePath;
    const candidates = [
      path.join(__dirname, '..', '..', 'bin', 'ffprobe.exe'),
      process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'ffprobe.exe') : null
    ].filter(Boolean);
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return 'ffprobe';
  }

  /**
   * Tự động tính toán tham số -maxrate và -bufsize cho FFmpeg dựa trên độ phân giải pixel
   * Ngăn chặn phình dung lượng và tràn băng thông khi đăng Reels/TikTok
   */
  bitrateCapArgs(width = 1080, height = 1920) {
    const pixels = Math.max(1, width) * Math.max(1, height);
    const maxrateKbps = Math.round(Math.min(20000, Math.max(4000, (BASE_MAXRATE_KBPS * pixels) / BASE_CAP_PIXELS)));
    return ['-maxrate', `${maxrateKbps}k`, '-bufsize', `${maxrateKbps * 2}k`];
  }

  /**
   * Tính toán ngân sách tải lên & hạn mức thời gian chờ của Playwright
   */
  computeUploadBudget(info = {}) {
    const durationSec = Number.isFinite(info.durationSec) && Number(info.durationSec) > 0 ? Number(info.durationSec) : 0;
    const sizeMb = Number.isFinite(info.sizeBytes) && Number(info.sizeBytes) > 0 ? Number(info.sizeBytes) / (1024 * 1024) : 0;
    const isLong = durationSec > LONG_UPLOAD_MIN_SEC || sizeMb > LONG_UPLOAD_MIN_MB;

    if (!isLong) {
      return {
        kind: 'short',
        durationSec,
        sizeMb: parseFloat(sizeMb.toFixed(2)),
        uploadWaitMs: SHORT_UPLOAD_WAIT_MS
      };
    }

    const waitByDuration = Math.round(durationSec * 1500);
    const waitBySize = Math.round(sizeMb * 12000);
    const uploadWaitMs = Math.min(MAX_UPLOAD_WAIT_MS, Math.max(SHORT_UPLOAD_WAIT_MS, Math.max(waitByDuration, waitBySize)));

    return {
      kind: 'long',
      durationSec,
      sizeMb: parseFloat(sizeMb.toFixed(2)),
      uploadWaitMs
    };
  }

  describeUploadBudget(budget = {}) {
    const kindLabel = budget.kind === 'long' ? 'video dài' : 'video ngắn';
    const durLabel = budget.durationSec >= 60 ? `~${Math.round(budget.durationSec / 60)}p` : (budget.durationSec > 0 ? `~${Math.round(budget.durationSec)}s` : '');
    const sizeLabel = budget.sizeMb >= 1 ? `${Math.round(budget.sizeMb)}MB` : '';
    return [kindLabel, durLabel, sizeLabel].filter(Boolean).join(' · ');
  }

  // Đọc metadata video (Resolution, FPS, Duration)
  async getVideoMetadata(videoPath) {
    const ffprobe = this.getFfprobePath();
    return new Promise((resolve) => {
      const args = [
        '-v', 'error',
        '-show_entries', 'stream=width,height,r_frame_rate,codec_name:format=duration',
        '-of', 'json',
        videoPath
      ];

      const proc = track(spawn(ffprobe, args, { windowsHide: true }));
      let stdout = '';

      proc.stdout.on('data', data => stdout += data.toString());
      proc.on('close', code => {
        if (code === 0) {
          try {
            const data = JSON.parse(stdout);
            const duration = parseFloat(data.format?.duration || 0);
            const videoStream = (data.streams || []).find(s => s.width && s.height) || {};
            resolve({
              duration,
              width: videoStream.width || 0,
              height: videoStream.height || 0,
              codec: videoStream.codec_name || 'unknown',
              fps: videoStream.r_frame_rate || '30/1'
            });
          } catch (e) {
            resolve({ duration: 60, width: 1080, height: 1920 });
          }
        } else {
          resolve({ duration: 60, width: 1080, height: 1920 });
        }
      });
    });
  }

  // Xây dựng chuỗi filter_complex chuẩn xác cho FFmpeg
  // Ghi text drawtext ra file tạm (UTF-8) — được xoá sau khi render xong
  writeDrawtextFile(text, tempFiles) {
    const file = path.join(os.tmpdir(), `kz_drawtext_${process.pid}_${Date.now()}_${tempFiles.length}.txt`);
    fs.writeFileSync(file, String(text), 'utf-8');
    tempFiles.push(file);
    return file;
  }

  buildFilterComplex(opts, videoWidth = 1080, videoHeight = 1920) {
    const filters = [];
    const tempFiles = [];
    let currentV = '0:v';
    const targetW = opts.targetWidth || 1080;
    const targetH = opts.targetHeight || 1920;

    // 1. Lật gương (Mirror Flip)
    if (opts.mirrorFlip) {
      filters.push(`[${currentV}]hflip[v_flip]`);
      currentV = 'v_flip';
    }

    // 2. Crop viền lách bản quyền
    if (opts.cropPercent && opts.cropPercent > 0) {
      const scale = 1 - (opts.cropPercent / 100);
      filters.push(`[${currentV}]crop=iw*${scale.toFixed(4)}:ih*${scale.toFixed(4)}[v_crop]`);
      currentV = 'v_crop';
    }

    // 3. Khung hình dọc 9:16 Vertical Blur
    if (opts.frameMode === 'vertical-blur') {
      const sigma = opts.blurSigma || 8;
      filters.push(
        `[${currentV}]split[bg][fg];` +
        `[bg]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},` +
        `scale=${targetW / 4}:${targetH / 4},gblur=sigma=${sigma},scale=${targetW}:${targetH}:flags=lanczos[bgb];` +
        `[fg]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease[fgf];` +
        `[bgb][fgf]overlay=(W-w)/2:(H-h)/2,setsar=1[v_canvas]`
      );
      currentV = 'v_canvas';
    }

    // 4. Thêm nhiễu hạt vi mô (Micro Noise)
    if (opts.addNoise) {
      filters.push(`[${currentV}]noise=alls=2:allf=t+u[v_noise]`);
      currentV = 'v_noise';
    }

    // 5. Gắn phụ đề cứng (Hardsub ASS)
    if (opts.assSubtitlePath && fs.existsSync(opts.assSubtitlePath)) {
      filters.push(`[${currentV}]ass=${quoteFilterPath(opts.assSubtitlePath)}[v_sub]`);
      currentV = 'v_sub';
    }

    // 6. Title Hook banner (3 giây đầu hoặc toàn clip)
    if (opts.titleHookEnabled && opts.titleHookText) {
      const hookFile = this.writeDrawtextFile(opts.titleHookText, tempFiles);
      filters.push(
        `[${currentV}]drawbox=x=0:y=60:w=iw:h=120:color=black@0.75:t=fill,` +
        `drawtext=textfile=${quoteFilterPath(hookFile)}:expansion=none:fontfile=${quoteFilterPath(this.getFontFile())}:fontsize=42:fontcolor=white:x=(w-tw)/2:y=100:` +
        `shadowcolor=purple@0.8:shadowx=3:shadowy=3[v_hook]`
      );
      currentV = 'v_hook';
    }

    // 7. Watermark Text
    if (opts.watermarkText) {
      const wmFile = this.writeDrawtextFile(opts.watermarkText, tempFiles);
      let pos = 'x=w-tw-40:y=h-th-50';
      if (opts.watermarkPos === 'top-right') pos = 'x=w-tw-40:y=60';
      else if (opts.watermarkPos === 'top-left') pos = 'x=40:y=60';
      else if (opts.watermarkPos === 'bottom-left') pos = 'x=40:y=h-th-50';

      filters.push(
        `[${currentV}]drawtext=textfile=${quoteFilterPath(wmFile)}:expansion=none:fontfile=${quoteFilterPath(this.getFontFile())}:fontsize=28:fontcolor=white@0.85:` +
        `${pos}:shadowcolor=black@0.6:shadowx=2:shadowy=2[v_wm]`
      );
      currentV = 'v_wm';
    }

    return {
      filterComplex: filters.join(';'),
      finalStream: currentV,
      tempFiles
    };
  }

  // Thực thi Render video
  async renderVideo(inputPath, outputPath, options = {}, callbacks = {}) {
    const ffmpeg = this.getFfmpegPath();
    const taskId = options.taskId || `rnd_${Date.now()}`;

    // Lấy metadata để tính toán thời gian render
    const meta = await this.getVideoMetadata(inputPath);
    const duration = options.testRender ? Math.min(15, meta.duration) : meta.duration;
    const targetW = options.targetWidth || (meta.width > 0 ? meta.width : 1080);
    const targetH = options.targetHeight || (meta.height > 0 ? meta.height : 1920);

    const { filterComplex, finalStream, tempFiles } = this.buildFilterComplex(options, targetW, targetH);
    const cleanupTemp = () => tempFiles.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });

    // ffmpeg áp option cho file đứng NGAY SAU nó: mọi -i phải đứng trước -filter_complex/-map,
    // còn -t (test 15s) phải là option của output — nếu không -map sẽ bị gán nhầm cho input và ffmpeg báo lỗi.
    const hasExternalAudio = !!(options.externalAudioPath && fs.existsSync(options.externalAudioPath));
    const args = ['-y', '-i', inputPath];
    if (hasExternalAudio) args.push('-i', options.externalAudioPath);

    // Filter complex
    if (filterComplex) {
      args.push('-filter_complex', filterComplex, '-map', `[${finalStream}]`);
    } else {
      args.push('-map', '0:v');
    }

    // Xử lý Audio
    if (hasExternalAudio) {
      args.push('-map', '1:a');
    } else {
      if (options.tweakPitch) {
        args.push('-af', PITCH_FILTER);
      }
      args.push('-map', '0:a?');
    }

    // Nếu test render thì chỉ lấy 15 giây đầu
    if (options.testRender) {
      args.push('-t', '15');
    }

    // Video encoding params với bitrate cap tối ưu dung lượng
    const capArgs = this.bitrateCapArgs(targetW, targetH);

    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      ...capArgs,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k'
    );

    // Xóa Metadata
    if (options.stripMetadata !== false) {
      args.push('-map_metadata', '-1', '-bitexact');
    }

    args.push(outputPath);

    return new Promise((resolve, reject) => {
      const proc = track(spawn(ffmpeg, args, { windowsHide: true }));
      this.activeRenders.set(taskId, proc);

      let stderrOutput = '';

      proc.stderr.on('data', data => {
        const text = data.toString();
        stderrOutput += text;

        const timeMatch = text.match(/time=(\d+):(\d+):([\d\.]+)/);
        if (timeMatch && duration > 0) {
          const hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const seconds = parseFloat(timeMatch[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          const percent = Math.min(99, Math.round((currentTime / duration) * 100));

          const fpsMatch = text.match(/fps=\s*([\d\.]+)/);
          const speedMatch = text.match(/speed=\s*([\d\.]+)x/);

          if (callbacks.onProgress) {
            callbacks.onProgress({
              taskId,
              percent,
              currentTime: currentTime.toFixed(1),
              totalDuration: duration.toFixed(1),
              fps: fpsMatch ? fpsMatch[1] : '',
              speed: speedMatch ? speedMatch[1] + 'x' : ''
            });
          }
        }

        if (callbacks.onLog) {
          callbacks.onLog(text.trim());
        }
      });

      proc.on('close', code => {
        this.activeRenders.delete(taskId);
        cleanupTemp();
        if (code === 0) {
          if (callbacks.onProgress) {
            callbacks.onProgress({ taskId, percent: 100, status: 'completed' });
          }

          let sizeBytes = 0;
          try {
            sizeBytes = fs.statSync(outputPath).size;
          } catch {}

          const budget = this.computeUploadBudget({ durationSec: duration, sizeBytes });

          storage.addHistory({
            type: 'render',
            input: path.basename(inputPath),
            output: path.basename(outputPath),
            outputPath,
            status: 'success',
            budget,
            options
          });

          resolve({
            taskId,
            status: 'completed',
            outputPath,
            budget
          });
        } else {
          reject(new Error(`Render failed with code ${code}: ${stderrOutput}`));
        }
      });

      proc.on('error', err => {
        this.activeRenders.delete(taskId);
        cleanupTemp();
        reject(err);
      });
    });
  }

  cancelRender(taskId) {
    const proc = this.activeRenders.get(taskId);
    if (proc) {
      try {
        killTree(proc);
      } catch (e) {
        console.error('Kill render error:', e);
      }
      this.activeRenders.delete(taskId);
      return true;
    }
    return false;
  }
}

module.exports = new Renderer();
