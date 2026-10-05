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
      // Chỉ dùng gói 'webtorrent' cài trong app (trước đây có đường dẫn cứng tới máy khác)
      let WebTorrent = null;
      try {
        const mod = await import('webtorrent');
        WebTorrent = mod.default || mod;
      } catch (err) {
        throw new Error('Tính năng tải Torrent chưa khả dụng: thiếu thư viện WebTorrent trong bản này (' + err.message + ').');
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
      let torrent = null;
      const timeout = setTimeout(() => {
        // Huỷ torrent đang chờ metadata — nếu không, lần tải sau cùng infoHash sẽ báo trùng torrent
        if (torrent) { try { torrent.destroy({ destroyStore: true }); } catch (_) {} }
        reject(new Error('Hết thời gian chờ Metadata Torrent (Timeout 60 giây). Vui lòng thử link Magnet khác.'));
      }, 60000);

      try {
        const inspectDir = path.join(os.tmpdir(), 'kenzi-torrent-inspect');
        if (!fs.existsSync(inspectDir)) fs.mkdirSync(inspectDir, { recursive: true });

        torrent = client.add(magnetOrBuf, {
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

        let infoHash = torrent.infoHash || null;
        const registerTorrent = () => {
          infoHash = torrent.infoHash;
          this.activeTorrents.set(infoHash, torrent);
          this.stallTimers.set(infoHash, stallInterval);
        };

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
        if (torrent.infoHash) registerTorrent(); else torrent.once('infoHash', registerTorrent);

        let selectedFiles = [];
        let finished = false;
        const cleanup = () => {
          clearInterval(stallInterval);
          if (infoHash) {
            this.stallTimers.delete(infoHash);
            this.activeTorrents.delete(infoHash);
          }
        };
        // Xong khi CÁC FILE ĐÃ CHỌN tải đủ (sự kiện 'done' của torrent chỉ phát khi tải hết mọi file → tải chọn lọc
        // trước đây không bao giờ kết thúc). Xong thì dừng torrent (giữ file) để không seed ngầm tốn băng thông.
        const finishIfSelectedDone = () => {
          if (finished || selectedFiles.length === 0 || !selectedFiles.every(f => f.done)) return;
          finished = true;
          cleanup();
          const files = selectedFiles.map(f => path.join(destDir, f.path));
          torrent.destroy({ destroyStore: false }, () => resolve({ success: true, infoHash, name: torrent.name, files }));
        };

        torrent.on('ready', () => {
          // Bỏ chọn tất cả file
          torrent.files.forEach(f => { if (f.deselect) f.deselect(); });

          // Chỉ chọn các file video trong danh sách fileIndices
          const selectedIndices = new Set(fileIndices.map(Number));
          selectedFiles = [];
          torrent.files.forEach((f, idx) => {
            if (selectedIndices.size === 0) {
              // Mặc định: Tự động chọn tất cả file video > 50MB
              if (/\.(mp4|mkv|mov|webm|avi)$/i.test(f.name) && f.length > 50 * 1024 * 1024) {
                f.select();
                selectedFiles.push(f);
              }
            } else if (selectedIndices.has(idx)) {
              f.select();
              selectedFiles.push(f);
            }
          });

          if (selectedFiles.length === 0) {
            cleanup();
            torrent.destroy({ destroyStore: true });
            reject(new Error('Torrent không có file video nào để tải (cần file video > 50MB, hoặc chọn file cụ thể).'));
            return;
          }
          selectedFiles.forEach(f => f.once('done', finishIfSelectedDone));

          onProgress({
            phase: 'started',
            infoHash,
            name: torrent.name,
            totalLength: selectedFiles.reduce((s, f) => s + f.length, 0),
            numPeers: torrent.numPeers
          });
          finishIfSelectedDone(); // file đã có sẵn trên đĩa từ lần trước
        });

        // Báo cáo tiến độ download
        torrent.on('download', () => {
          // Tiến độ tính trên các file đã chọn (torrent.progress tính cả file bị bỏ qua → gần như luôn 0%)
          const total = selectedFiles.reduce((s, f) => s + f.length, 0);
          const got = selectedFiles.reduce((s, f) => s + Math.min(f.length, f.downloaded || 0), 0);
          const progress = total > 0 ? got / total : 0;
          onProgress({
            phase: 'downloading',
            infoHash,
            progress,
            percent: Math.round(progress * 100),
            downloaded: torrent.downloaded,
            downloadSpeed: torrent.downloadSpeed,
            uploadSpeed: torrent.uploadSpeed,
            numPeers: torrent.numPeers,
            timeRemaining: torrent.timeRemaining
          });
        });

        torrent.on('done', finishIfSelectedDone);

        torrent.on('error', (err) => {
          cleanup();
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Đóng hẳn WebTorrent (gọi khi thoát app): dừng mọi torrent + socket trước khi tiến trình kết thúc
  destroyClient() {
    for (const timer of this.stallTimers.values()) clearInterval(timer);
    this.stallTimers.clear();
    this.activeTorrents.clear();
    const client = this.client;
    this.client = null;
    if (!client) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, 3000);
      try {
        client.destroy(() => { clearTimeout(t); resolve(); });
      } catch (_) {
        clearTimeout(t);
        resolve();
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
