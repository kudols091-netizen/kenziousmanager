const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const storage = require('./storage');

class Renderer {
  constructor() {
    this.activeRenders = new Map();
  }

  getFfmpegPath() {
    const s = storage.getSettings();
    if (s.ffmpegPath && fs.existsSync(s.ffmpegPath)) return s.ffmpegPath;
    const localBin = path.join(__dirname, '..', '..', 'bin', 'ffmpeg.exe');
    if (fs.existsSync(localBin)) return localBin;
    return 'ffmpeg';
  }

  getFfprobePath() {
    const s = storage.getSettings();
    if (s.ffprobePath && fs.existsSync(s.ffprobePath)) return s.ffprobePath;
    const localBin = path.join(__dirname, '..', '..', 'bin', 'ffprobe.exe');
    if (fs.existsSync(localBin)) return localBin;
    return 'ffprobe';
  }

  // Lấy thời lượng (duration tính theo giây) của video
  async getVideoMetadata(videoPath) {
    const ffprobe = this.getFfprobePath();
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'error',
        '-show_entries', 'format=duration,size,bit_rate:stream=width,height,codec_name,r_frame_rate',
        '-of', 'json',
        videoPath
      ];

      const proc = spawn(ffprobe, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());

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
  buildFilterComplex(opts, videoWidth = 1080, videoHeight = 1920) {
    const filters = [];
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
      const escapedPath = opts.assSubtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
      filters.push(`[${currentV}]ass='${escapedPath}'[v_sub]`);
      currentV = 'v_sub';
    }

    // 6. Title Hook banner (3 giây đầu hoặc toàn clip)
    if (opts.titleHookEnabled && opts.titleHookText) {
      const cleanTitle = opts.titleHookText.replace(/'/g, '').replace(/:/g, '\\:');
      filters.push(
        `[${currentV}]drawbox=x=0:y=60:w=iw:h=120:color=black@0.75:t=fill,` +
        `drawtext=text='${cleanTitle}':font='Roboto':fontsize=42:fontcolor=white:x=(w-tw)/2:y=100:` +
        `shadowcolor=purple@0.8:shadowx=3:shadowy=3[v_hook]`
      );
      currentV = 'v_hook';
    }

    // 7. Watermark Text
    if (opts.watermarkText) {
      const wmText = opts.watermarkText.replace(/'/g, '').replace(/:/g, '\\:');
      let pos = 'x=w-tw-40:y=h-th-50'; // default bottom-right
      if (opts.watermarkPos === 'top-right') pos = 'x=w-tw-40:y=60';
      else if (opts.watermarkPos === 'top-left') pos = 'x=40:y=60';
      else if (opts.watermarkPos === 'bottom-left') pos = 'x=40:y=h-th-50';

      filters.push(
        `[${currentV}]drawtext=text='${wmText}':font='Roboto':fontsize=28:fontcolor=white@0.85:` +
        `${pos}:shadowcolor=black@0.6:shadowx=2:shadowy=2[v_wm]`
      );
      currentV = 'v_wm';
    }

    return {
      filterComplex: filters.join(';'),
      finalStream: currentV
    };
  }

  // Thực thi Render video
  async renderVideo(inputPath, outputPath, options = {}, callbacks = {}) {
    const ffmpeg = this.getFfmpegPath();
    const taskId = options.taskId || `rnd_${Date.now()}`;

    // Lấy metadata để tính toán thời gian render
    const meta = await this.getVideoMetadata(inputPath);
    const duration = options.testRender ? Math.min(15, meta.duration) : meta.duration;

    const { filterComplex, finalStream } = this.buildFilterComplex(options);

    const args = [
      '-y',
      '-i', inputPath
    ];

    // Nếu test render thì chỉ lấy 15 giây đầu
    if (options.testRender) {
      args.push('-t', '15');
    }

    // Filter complex
    if (filterComplex) {
      args.push('-filter_complex', filterComplex, '-map', `[${finalStream}]`);
    } else {
      args.push('-map', '0:v');
    }

    // Xử lý Audio
    if (options.externalAudioPath && fs.existsSync(options.externalAudioPath)) {
      // Dùng âm thanh lồng tiếng AI mới
      args.push('-i', options.externalAudioPath);
      args.push('-map', '1:a');
    } else {
      // Dùng âm thanh gốc, có thể biến điệu pitch/tempo
      if (options.tweakPitch) {
        args.push('-af', 'asetrate=44100*1.02,aresample=44100,atempo=1/1.02');
      }
      args.push('-map', '0:a?');
    }

    // Video encoding params (NVENC nếu có, fallback libx264)
    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
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
      const proc = spawn(ffmpeg, args, { windowsHide: true });
      this.activeRenders.set(taskId, proc);

      let stderrOutput = '';

      proc.stderr.on('data', data => {
        const text = data.toString();
        stderrOutput += text;

        // Parse: time=00:00:08.52 bitrate=... speed=...
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
        if (code === 0) {
          if (callbacks.onProgress) {
            callbacks.onProgress({ taskId, percent: 100, status: 'completed' });
          }
          storage.addHistory({
            type: 'render',
            input: path.basename(inputPath),
            output: path.basename(outputPath),
            outputPath,
            status: 'success',
            options
          });
          resolve({
            taskId,
            status: 'completed',
            outputPath
          });
        } else {
          reject(new Error(`Render failed with code ${code}: ${stderrOutput}`));
        }
      });

      proc.on('error', err => {
        this.activeRenders.delete(taskId);
        reject(err);
      });
    });
  }

  cancelRender(taskId) {
    const proc = this.activeRenders.get(taskId);
    if (proc) {
      try {
        proc.kill('SIGTERM');
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
