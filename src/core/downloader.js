const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const storage = require('./storage');

class Downloader {
  constructor() {
    this.activeProcesses = new Map();
  }

  getYtDlpPath() {
    const s = storage.getSettings();
    if (s.ytdlpPath && fs.existsSync(s.ytdlpPath)) {
      return s.ytdlpPath;
    }
    const localBin = path.join(__dirname, '..', '..', 'bin', 'yt-dlp.exe');
    if (fs.existsSync(localBin)) return localBin;
    return 'yt-dlp';
  }

  detectPlatform(url) {
    const u = url.toLowerCase();
    if (u.includes('tiktok.com')) return 'tiktok';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'facebook';
    if (u.includes('instagram.com')) return 'instagram';
    if (u.includes('douyin.com')) return 'douyin';
    if (u.includes('bilibili.com')) return 'bilibili';
    if (u.includes('xiaohongshu.com') || u.includes('xhslink.com')) return 'rednote';
    return 'generic';
  }

  // Lấy thông tin video trước khi tải
  async getVideoInfo(url) {
    const ytdlp = this.getYtDlpPath();
    return new Promise((resolve, reject) => {
      const args = [
        '--dump-single-json',
        '--no-playlist',
        '--no-warnings',
        url
      ];

      const proc = spawn(ytdlp, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => {
        stdout += data.toString();
      });

      proc.stderr.on('data', data => {
        stderr += data.toString();
      });

      proc.on('close', code => {
        if (code === 0) {
          try {
            const info = JSON.parse(stdout);
            resolve({
              id: info.id || `v_${Date.now()}`,
              title: info.title || 'Untitled Video',
              duration: info.duration || 0,
              thumbnail: info.thumbnail || '',
              uploader: info.uploader || info.channel || 'Unknown Creator',
              platform: this.detectPlatform(url),
              url: url,
              formats: (info.formats || []).map(f => ({
                format_id: f.format_id,
                ext: f.ext,
                resolution: f.resolution || `${f.width}x${f.height}`,
                filesize: f.filesize || f.filesize_approx || 0
              }))
            });
          } catch (e) {
            reject(new Error(`Failed to parse video info: ${e.message}`));
          }
        } else {
          reject(new Error(`yt-dlp failed (code ${code}): ${stderr || 'Unknown error'}`));
        }
      });
    });
  }

  // Tải video với progress callback
  async downloadVideo(url, outputDir, options = {}, callbacks = {}) {
    const ytdlp = this.getYtDlpPath();
    const taskId = options.taskId || `dl_${Date.now()}`;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputTemplate = path.join(outputDir, '%(title).80s_%(id)s.%(ext)s');

    const args = [
      '--no-playlist',
      '--newline',
      '--progress',
      '-f', options.format || 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', outputTemplate,
      url
    ];

    if (options.cookieFile && fs.existsSync(options.cookieFile)) {
      args.push('--cookies', options.cookieFile);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(ytdlp, args, { windowsHide: true });
      this.activeProcesses.set(taskId, proc);

      let downloadedFilePath = null;
      let lastPercent = 0;

      proc.stdout.on('data', data => {
        const text = data.toString();
        // Regex parse: [download]  45.2% of ~ 15.20MiB at  3.45MiB/s ETA 00:03
        const match = text.match(/\[download\]\s+([\d\.]+)%\s+of\s+~?([\w\.\s]+)\s+at\s+([\w\.\/\s]+)\s+ETA\s+([\d:]+)/i);
        if (match) {
          const percent = parseFloat(match[1]);
          const totalSize = match[2].trim();
          const speed = match[3].trim();
          const eta = match[4].trim();

          lastPercent = percent;
          if (callbacks.onProgress) {
            callbacks.onProgress({
              taskId,
              percent,
              totalSize,
              speed,
              eta
            });
          }
        } else if (text.includes('[download] Destination:')) {
          const m = text.match(/\[download\] Destination:\s*(.*)/i);
          if (m && m[1]) downloadedFilePath = m[1].trim();
        } else if (text.includes('[Merger] Merging formats into')) {
          const m = text.match(/\[Merger\] Merging formats into "([^"]+)"/i);
          if (m && m[1]) downloadedFilePath = m[1].trim();
        } else if (text.includes('has already been downloaded')) {
          const m = text.match(/\[download\] (.*?) has already been downloaded/i);
          if (m && m[1]) downloadedFilePath = m[1].trim();
        }

        if (callbacks.onLog) {
          callbacks.onLog(text.trim());
        }
      });

      let stderrOutput = '';
      proc.stderr.on('data', data => {
        stderrOutput += data.toString();
        if (callbacks.onLog) callbacks.onLog(data.toString().trim());
      });

      proc.on('close', code => {
        this.activeProcesses.delete(taskId);
        if (code === 0) {
          if (callbacks.onProgress) {
            callbacks.onProgress({ taskId, percent: 100, speed: 'Done', eta: '00:00' });
          }
          resolve({
            taskId,
            status: 'completed',
            filePath: downloadedFilePath,
            outputDir
          });
        } else {
          reject(new Error(`Download failed with code ${code}: ${stderrOutput}`));
        }
      });

      proc.on('error', err => {
        this.activeProcesses.delete(taskId);
        reject(err);
      });
    });
  }

  cancelDownload(taskId) {
    const proc = this.activeProcesses.get(taskId);
    if (proc) {
      try {
        proc.kill('SIGTERM');
      } catch (e) {
        console.error('Kill error:', e);
      }
      this.activeProcesses.delete(taskId);
      return true;
    }
    return false;
  }
}

module.exports = new Downloader();
