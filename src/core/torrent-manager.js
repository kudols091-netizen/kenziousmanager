const path = require('path');
const fs = require('fs');
const os = require('os');

class TorrentManager {
  constructor() {
    this.client = null;
    this.activeTorrents = new Map();
    this.stallTimers = new Map();
  }

  async getClient() {
    if (!this.client) {
      const paths = [
        'webtorrent',
        'file:///D:/RE%20-%20Jobs/_work/zooreup_source/node_modules/webtorrent/index.js'
      ];
      let WebTorrent = null;
      for (const p of paths) {
        try {
          const mod = await import(p);
          WebTorrent = mod.default || mod;
          if (WebTorrent) break;
        } catch {}
      }
      if (!WebTorrent) {
        throw new Error('Không thể tải thư viện WebTorrent.');
      }
      this.client = new WebTorrent({
        maxConns: 55,
        downloadLimit: -1,
        uploadLimit: -1
      });
    }
    return this.client;
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 1. Inspect Torrent (Metadata Only) - Deselect all files immediately
  async inspectTorrent(source) {
    const client = await this.getClient();
    const magnetOrBuf = typeof source === 'object' && source.torrentPath 
      ? fs.readFileSync(source.torrentPath) 
      : (source.magnet || source);

    if (!magnetOrBuf) throw new Error('Cần cung cấp link Magnet hoặc đường dẫn file .torrent');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Hết thời gian chờ Metadata Torrent (Timeout 60 giây). Vui lòng thử link Magnet khác.'));
      }, 60000);

      try {
        const inspectDir = path.join(os.tmpdir(), 'kenzi-torrent-inspect');
        if (!fs.existsSync(inspectDir)) fs.mkdirSync(inspectDir, { recursive: true });

        const torrent = client.add(magnetOrBuf, {
          path: inspectDir,
          destroyStoreOnDestroy: true
        });

        torrent.on('ready', () => {
          clearTimeout(timeout);
          // Ngắt tải toàn bộ file ngay lập tức
          if (torrent.files) {
            torrent.files.forEach(f => { if (f.deselect) f.deselect(); });
          }

          const files = (torrent.files || []).map((f, idx) => {
            const isVideo = /\.(mp4|mkv|mov|webm|avi|flv|ts)$/i.test(f.name) && f.length > 20 * 1024 * 1024;
            return {
              index: idx,
              name: f.name,
              path: f.path,
              length: f.length,
              sizeFormatted: this.formatBytes(f.length),
              isVideo
            };
          });

          const result = {
            infoHash: torrent.infoHash,
            name: torrent.name,
            totalLength: torrent.length,
            totalFormatted: this.formatBytes(torrent.length),
            files,
            videoFiles: files.filter(f => f.isVideo)
          };

          // Hủy instance inspect tạm thời
          torrent.destroy({ destroyStore: true }, () => {
            resolve(result);
          });
        });

        torrent.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  // 2. Selective Download - Chỉ tải các file video người dùng đã chọn + Watchdog 15 phút
  async startSelectiveDownload(source, fileIndices = [], outputDir = '', onProgress = () => {}) {
    const client = await this.getClient();
    const magnetOrBuf = typeof source === 'object' && source.torrentPath 
      ? fs.readFileSync(source.torrentPath) 
      : (source.magnet || source);

    const destDir = outputDir || require('./paths').getDefaultOutputDir();
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    return new Promise((resolve, reject) => {
      try {
        const torrent = client.add(magnetOrBuf, {
          path: destDir
        });

        const infoHash = torrent.infoHash;
        this.activeTorrents.set(infoHash, torrent);

        let lastDownloaded = 0;
        let lastActivity = Date.now();
        const STALL_TIMEOUT_MS = 15 * 60 * 1000; // Watchdog 15 phút

        // Khởi tạo Watchdog chống stall
        const stallInterval = setInterval(() => {
          if (torrent.downloaded > lastDownloaded) {
            lastDownloaded = torrent.downloaded;
            lastActivity = Date.now();
          } else {
            const idleTime = Date.now() - lastActivity;
            if (idleTime > STALL_TIMEOUT_MS) {
              clearInterval(stallInterval);
              this.cancelDownload(infoHash);
              reject(new Error('Torrent bị nghẽn mạng quá 15 phút không có dữ liệu tải về (Watchdog Timeout).'));
            }
          }
        }, 10000);
        this.stallTimers.set(infoHash, stallInterval);

        torrent.on('ready', () => {
          // Bỏ chọn tất cả file
          torrent.files.forEach(f => { if (f.deselect) f.deselect(); });

          // Chỉ chọn các file video trong danh sách fileIndices
          const selectedIndices = new Set(fileIndices.map(Number));
          torrent.files.forEach((f, idx) => {
            if (selectedIndices.size === 0) {
              // Mặc định: Tự động chọn tất cả file video > 50MB
              if (/\.(mp4|mkv|mov|webm|avi)$/i.test(f.name) && f.length > 50 * 1024 * 1024) {
                f.select();
              }
            } else if (selectedIndices.has(idx)) {
              f.select();
            }
          });

          onProgress({
            phase: 'started',
            infoHash,
            name: torrent.name,
            totalLength: torrent.length,
            numPeers: torrent.numPeers
          });
        });

        // Báo cáo tiến độ download
        torrent.on('download', () => {
          onProgress({
            phase: 'downloading',
            infoHash,
            progress: torrent.progress,
            percent: Math.round(torrent.progress * 100),
            downloaded: torrent.downloaded,
            downloadSpeed: torrent.downloadSpeed,
            uploadSpeed: torrent.uploadSpeed,
            numPeers: torrent.numPeers,
            timeRemaining: torrent.timeRemaining
          });
        });

        torrent.on('done', () => {
          clearInterval(stallInterval);
          this.stallTimers.delete(infoHash);
          this.activeTorrents.delete(infoHash);

          const downloadedFiles = torrent.files
            .filter(f => f.progress === 1)
            .map(f => path.join(destDir, f.path));

          resolve({
            success: true,
            infoHash,
            name: torrent.name,
            files: downloadedFiles
          });
        });

        torrent.on('error', (err) => {
          clearInterval(stallInterval);
          this.stallTimers.delete(infoHash);
          this.activeTorrents.delete(infoHash);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Hủy download và dọn dẹp
  cancelDownload(infoHash) {
    const timer = this.stallTimers.get(infoHash);
    if (timer) {
      clearInterval(timer);
      this.stallTimers.delete(infoHash);
    }
    const torrent = this.activeTorrents.get(infoHash);
    if (torrent) {
      torrent.destroy({ destroyStore: false });
      this.activeTorrents.delete(infoHash);
      return true;
    }
    return false;
  }
}

module.exports = new TorrentManager();
