const { spawn } = require('child_process');
const { track, killTree } = require('./process-registry');
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
    const candidates = [
      path.join(__dirname, '..', '..', 'bin', 'yt-dlp.exe'),
      process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'yt-dlp.exe') : null
    ].filter(Boolean);
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return 'yt-dlp';
  }

  detectPlatform(url) {
    const u = url.toLowerCase();
    if (u.startsWith('magnet:') || u.endsWith('.torrent')) return 'torrent';
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
    // Special handling for Douyin No-Watermark Scraper
    if (this.detectPlatform(url) === 'douyin') {
      try {
        const douyinScraper = require('./douyin-scraper');
        const dInfo = await douyinScraper.probeDouyinVideo(url);
        return {
          id: dInfo.id,
          title: dInfo.title,
          duration: dInfo.duration,
          thumbnail: dInfo.coverUrl,
          uploader: `${dInfo.author.nickname} (${dInfo.stats.likes} likes)`,
          platform: 'douyin',
          url: url,
          playUrl: dInfo.playUrl,
          stats: dInfo.stats
        };
      } catch (err) {
        console.warn('[Downloader] douyinScraper probe failed, falling back to yt-dlp:', err.message);
      }
    }

    // Special handling for WebTorrent (Magnet links & .torrent)
    if (url.startsWith('magnet:') || url.endsWith('.torrent')) {
      const torrentManager = require('./torrent-manager');
      const tInfo = await torrentManager.inspectTorrent(url);
      const mainVid = tInfo.videoFiles[0] || tInfo.files[0] || {};
      return {
        id: tInfo.infoHash,
        title: tInfo.name || mainVid.name || 'Torrent Video',
        duration: 0,
        thumbnail: '',
        uploader: `P2P WebTorrent (${tInfo.videoFiles.length} video files)`,
        platform: 'torrent',
        url: url,
        torrentInfo: tInfo
      };
    }

    const ytdlp = this.getYtDlpPath();
    return new Promise((resolve, reject) => {
      const args = [
        '--dump-single-json',
        '--no-playlist',
        '--no-warnings',
        url
      ];

      const proc = track(spawn(ytdlp, args, { windowsHide: true }));
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
    const taskId = options.taskId || `dl_${Date.now()}`;

    // Special handling for Douyin No-Watermark download
    if (this.detectPlatform(url) === 'douyin') {
      try {
        const douyinScraper = require('./douyin-scraper');
        const dlRes = await douyinScraper.downloadDouyinVideo(url, outputDir, (prog) => {
          if (callbacks.onProgress) {
            callbacks.onProgress({
              taskId,
              percent: prog.percent || (prog.phase === 'downloading' ? 50 : 10),
              speed: prog.speed || '',
              eta: prog.eta || ''
            });
          }
          if (callbacks.onLog && prog.message) {
            callbacks.onLog(prog.message);
          }
        });
        return {
          success: true,
          filePath: dlRes.filePath,
          title: dlRes.metadata?.title || 'Douyin Video'
        };
      } catch (err) {
        console.warn('[Downloader] douyinScraper download failed, falling back to yt-dlp:', err.message);
      }
    }

    // Special handling for WebTorrent Selective download
    if (url.startsWith('magnet:') || url.endsWith('.torrent')) {
      const torrentManager = require('./torrent-manager');
      const dlRes = await torrentManager.startSelectiveDownload(url, options.fileIndices || [], outputDir, (prog) => {
        if (callbacks.onProgress) {
          callbacks.onProgress({
            taskId,
            percent: prog.percent || 0,
            speed: prog.downloadSpeed ? `${(prog.downloadSpeed / (1024 * 1024)).toFixed(2)} MB/s` : '',
            eta: prog.timeRemaining ? `${Math.round(prog.timeRemaining / 1000)}s` : ''
          });
        }
        if (callbacks.onLog) {
          callbacks.onLog(`[WebTorrent] ${prog.phase}: ${prog.percent || 0}% (Peers: ${prog.numPeers || 0})`);
        }
      });
      return {
        success: true,
        filePath: dlRes.filePath,
        files: dlRes.files
      };
    }
    const ytdlp = this.getYtDlpPath();

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
      const proc = track(spawn(ytdlp, args, { windowsHide: true }));
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

  isChannelOrPlaylist(url) {
    if (!url) return false;
    const u = url.toLowerCase();
    if (u.includes('youtube.com/@') || u.includes('youtube.com/channel/') || u.includes('youtube.com/c/') || u.includes('youtube.com/playlist') || u.includes('youtu.be/playlist')) return true;
    if (u.includes('tiktok.com/@') && !u.includes('/video/') && !u.includes('/photo/')) return true;
    if (u.includes('facebook.com') && (u.includes('/videos') || u.includes('/reels_tab'))) return true;
    if (u.includes('instagram.com') && !u.includes('/reel/') && !u.includes('/p/')) return true;
    return false;
  }

  // Quet danh sach video tu kenh hoac playlist
  async scanChannel(url, limit = 20) {
    const ytdlp = this.getYtDlpPath();
    return new Promise((resolve, reject) => {
      const args = [
        '--dump-single-json',
        '--flat-playlist',
        '--playlist-end', String(limit),
        '--no-warnings',
        url
      ];

      const proc = track(spawn(ytdlp, args, { windowsHide: true }));
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => { stdout += data.toString(); });
      proc.stderr.on('data', data => { stderr += data.toString(); });

      proc.on('close', code => {
        if (code === 0) {
          try {
            const info = JSON.parse(stdout);
            const rawEntries = info.entries || (info._type === 'playlist' ? info.entries : null);
            if (!rawEntries || rawEntries.length === 0) {
              resolve({
                isPlaylist: false,
                title: info.title || 'Video',
                uploader: info.uploader || info.channel || 'Creator',
                platform: this.detectPlatform(url),
                entries: [{
                  id: info.id || ('vid_' + Date.now()),
                  url: url,
                  title: info.title || 'Video',
                  duration: info.duration || 0,
                  thumbnail: info.thumbnail || '',
                  uploader: info.uploader || info.channel || 'Creator',
                  platform: this.detectPlatform(url)
                }]
              });
              return;
            }

            const entries = rawEntries.map((e, idx) => {
              let entryUrl = e.url;
              if (!entryUrl && e.id) {
                if (url.includes('tiktok.com')) {
                  const userMatch = url.match(/@([^/?#]+)/);
                  const username = userMatch ? userMatch[1] : (info.uploader_id || 'user');
                  entryUrl = 'https://www.tiktok.com/@' + username + '/video/' + e.id;
                } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                  entryUrl = 'https://www.youtube.com/watch?v=' + e.id;
                } else {
                  entryUrl = e.webpage_url || e.url || url;
                }
              }
              return {
                id: e.id || ('ch_' + Date.now() + '_' + idx),
                url: entryUrl || url,
                title: e.title || ('Video ' + (idx + 1)),
                duration: e.duration || 0,
                thumbnail: (e.thumbnails && e.thumbnails[0] && e.thumbnails[0].url) || e.thumbnail || '',
                uploader: e.uploader || info.uploader || info.channel || 'Kênh quét',
                platform: this.detectPlatform(url)
              };
            });

            resolve({
              isPlaylist: true,
              title: info.title || 'Danh sách video kênh',
              uploader: info.uploader || info.channel || 'Kênh quét',
              platform: this.detectPlatform(url),
              entries
            });
          } catch (e) {
            reject(new Error('Failed to parse channel JSON: ' + e.message));
          }
        } else {
          reject(new Error('Quét kênh thất bại (code ' + code + '): ' + (stderr || 'Unknown error')));
        }
      });
    });
  }

  cancelDownload(taskId) {
    const proc = this.activeProcesses.get(taskId);
    if (proc) {
      try {
        killTree(proc);
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
