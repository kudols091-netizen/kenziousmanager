/**
 * Kenzious Batch Video Publishing Engine (Clean-Room Implementation)
 * Specification Reference: _notes/zoo-reup-studio.md Section 5
 * Architecture:
 *  - Lane Sequential Queue: Sequential execution per Account to eliminate checkpoint race conditions
 *  - Multi-Lane Concurrency: Max 2 parallel lanes across different accounts
 *  - Anti-Spam Jitter Delay: 15s - 20s random jitter between uploads + real-time countdown
 *  - Destination Cooldown: 120s between uploads to the same Page/Profile
 *  - Real-time SQLite WAL persistent synchronization
 */

const publisherDb = require('./publisher-db');
const storage = require('./storage');
const facebookPoster = require('./facebook-reels-poster');
const pinterestPoster = require('./pinterest-poster');
const fs = require('fs');
const path = require('path');

// Trạng thái coi như video ĐÃ (hoặc có thể đã) lên kênh → không tự đăng lại
const POSTED_STATUSES = new Set(['success', 'unverified']);
// Trạng thái chưa hoàn tất, có thể chạy tiếp khi Resume
const RESUMABLE_STATUSES = ['pending', 'waiting_cooldown', 'jitter_delay'];

/**
 * ID đích thống nhất ghi vào post_events.destination_id (và dùng làm cooldown key).
 * Profile luôn quy về UID/ID tài khoản để 'dest_main', 'dest_main_<acc>' và c_user không bị tách rời.
 */
function resolveDestinationId(dest, account) {
  const explicit = dest.target_id || dest.targetId;
  if (explicit) return String(explicit);
  const raw = String(dest.id || '');
  if ((dest.type || 'profile') !== 'page' || /^dest_main/.test(raw)) {
    return String(account.uid || account.id);
  }
  return raw.replace(/^dest_page_/, '');
}

/**
 * Khoá chống trùng: Fanpage tính theo page ID (đăng từ acc nào cũng là trùng trên page đó),
 * Profile tính theo tài khoản. Dùng cùng một hàm cho cả sự kiện cũ lẫn kế hoạch mới.
 */
function dedupKey(accountId, destType, destId, videoPath) {
  let p = path.resolve(String(videoPath || ''));
  if (process.platform === 'win32') p = p.toLowerCase();
  const target = destType === 'page' ? `page:${destId}` : `profile:${accountId}`;
  return `${target}|${p}`;
}

// Số ffmpeg tạo thumbnail chạy song song tối đa
const THUMB_CONCURRENCY = 2;

class BatchPublisherService {
  /**
   * Extract video thumbnail frame using ffmpeg and return as base64 Data URL
   * Chạy bất đồng bộ (không khoá main process), tối đa THUMB_CONCURRENCY ffmpeg cùng lúc,
   * dùng ffmpeg đi kèm app, có cache + gộp các yêu cầu trùng.
   */
  async getVideoThumbnail(videoPath) {
    if (!videoPath || !fs.existsSync(videoPath)) return null;
    if (!this.thumbnailCache) this.thumbnailCache = new Map();
    if (this.thumbnailCache.has(videoPath)) return this.thumbnailCache.get(videoPath);
    if (!this.thumbnailPending) this.thumbnailPending = new Map();
    if (this.thumbnailPending.has(videoPath)) return this.thumbnailPending.get(videoPath);

    const job = (async () => {
      // Giây thứ 1; video quá ngắn thì lấy khung đầu
      const dataUrl = (await this._grabFrame(videoPath, '00:00:01')) || (await this._grabFrame(videoPath, '00:00:00'));
      if (dataUrl) this.thumbnailCache.set(videoPath, dataUrl);
      return dataUrl;
    })().finally(() => this.thumbnailPending.delete(videoPath));
    this.thumbnailPending.set(videoPath, job);
    return job;
  }

  async _grabFrame(videoPath, seek) {
    await this._acquireThumbSlot();
    try {
      const { execFile } = require('child_process');
      const ffmpeg = require('./renderer').getFfmpegPath();
      const args = ['-ss', seek, '-i', videoPath, '-vframes', '1', '-vf', 'scale=160:-1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'];
      const buf = await new Promise((resolve) => {
        execFile(ffmpeg, args, { encoding: 'buffer', maxBuffer: 5 * 1024 * 1024, timeout: 8000, windowsHide: true },
          (err, stdout) => resolve(err ? null : stdout));
      });
      return buf && buf.length > 0 ? 'data:image/jpeg;base64,' + buf.toString('base64') : null;
    } finally {
      this._releaseThumbSlot();
    }
  }

  _acquireThumbSlot() {
    if (!this.thumbQueue) { this.thumbQueue = []; this.thumbActive = 0; }
    if (this.thumbActive < THUMB_CONCURRENCY) { this.thumbActive++; return Promise.resolve(); }
    return new Promise(resolve => this.thumbQueue.push(resolve));
  }

  _releaseThumbSlot() {
    const next = this.thumbQueue.shift();
    if (next) next(); else this.thumbActive--;
  }

  constructor() {
    this.isProcessing = false;
    this.destinationCooldowns = new Map(); // destinationKey -> timestamp
    this.runningLanes = new Map();        // accountId -> boolean (cancel flag)
    this.activeSessionId = null;
    this.cancelRequested = false;         // Cờ tạm dừng cho cả phiên (kể cả lane chưa kịp khởi động)
    this.concurrencyLimit = 2;            // Max 2 parallel accounts

    // App vừa khởi động: không có gì đang chạy → dọn trạng thái treo từ lần crash/tắt trước
    this._recoverStaleEvents();
  }

  _shouldStop(accountId) {
    return this.cancelRequested || this.runningLanes.get(accountId) === false;
  }

  /**
   * 'uploading' bị bỏ dở (crash giữa chừng) → 'unverified' vì không biết bài đã lên hay chưa.
   * Các trạng thái chờ → quay lại 'pending' để Resume chạy tiếp được.
   */
  _recoverStaleEvents() {
    publisherDb.bulkUpdateStatus(e => e.status === 'uploading', 'unverified', {
      error_message: 'Ứng dụng bị tắt khi đang đăng — không xác nhận được kết quả, vui lòng kiểm tra tay.'
    });
    publisherDb.bulkUpdateStatus(e => e.status === 'waiting_cooldown' || e.status === 'jitter_delay', 'pending');
  }

  _sessionCounts(sessionId) {
    const evs = publisherDb.getEventsBySession(sessionId);
    const count = (s) => evs.filter(e => e.status === s).length;
    return {
      completed: count('success'),
      failed: count('failed'),
      review: count('unverified') + count('draft'),
      total: evs.length
    };
  }

  /**
   * Pre-flight: Giải phóng SingletonLock của profile dir trước khi launch browser
   * Đây là lớp bảo vệ phụ ngoài _unlockProfileDir trong facebook-reels-poster.js
   */
  _ensureProfileUnlocked(account) {
    const profileDir = account.profileDir || path.join(require('./paths').getProfilesDir(), account.id);
    if (!fs.existsSync(profileDir)) return;

    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
    let cleaned = 0;
    for (const lockName of lockFiles) {
      const lockPath = path.join(profileDir, lockName);
      try {
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
          cleaned++;
        }
      } catch (e) {}
    }
    if (cleaned > 0) {
      console.log(`[Publisher] 🔓 Pre-flight: Xóa ${cleaned} lock file(s) trong profile ${account.displayName || account.id}`);
    }
  }

  /**
   * Helper: Sleep with random jitter
   */
  async sleepWithJitter(baseMinMs = 15000, baseMaxMs = 20000) {
    const delay = Math.floor(Math.random() * (baseMaxMs - baseMinMs + 1)) + baseMinMs;
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }

  /**
   * Add video files into the persistent publish queue
   */
  addVideosToQueue(videoPaths, gapMinutes = 20, selectedAccounts = []) {
    const accounts = selectedAccounts.length > 0 ? selectedAccounts : storage.getAccounts();
    if (accounts.length === 0) {
      throw new Error('Chưa có tài khoản nào được kết nối trong hệ thống.');
    }

    const session = publisherDb.createSession(`Phiên đăng ${new Date().toLocaleTimeString('vi-VN')}`, gapMinutes);
    const events = [];

    for (const vPath of videoPaths) {
      const fileName = require('path').basename(vPath);
      const title = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

      for (const acc of accounts) {
        // Find selected destinations or default to profile
        const destinations = (acc.destinations || []).filter(d => d.selected);
        const targetList = destinations.length > 0 ? destinations : [{ id: acc.uid || acc.id, name: acc.displayName || 'Profile', type: 'profile' }];

        for (const dest of targetList) {
          const evt = publisherDb.addEvent({
            session_id: session.id,
            account_id: acc.id,
            destination_id: resolveDestinationId(dest, acc),
            destination_name: dest.name || acc.displayName,
            destination_type: dest.type || 'profile',
            platform: acc.platform || 'facebook',
            video_path: vPath,
            title,
            caption: `${title} #kenzious #reels #xuhuong #viral`,
            cooldown_seconds: gapMinutes * 60
          });
          events.push(evt);
        }
      }
    }

    return { session, session_id: session.id, items: events, events, eventsCount: events.length };
  }


  /**
   * Scan folder for video clips and optional import.xml
   */
  scanFolderClips(dirPath) {
    const fs = require('fs');
    const path = require('path');
    if (!fs.existsSync(dirPath)) throw new Error('Thư mục không tồn tại: ' + dirPath);
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) throw new Error('Đường dẫn không phải là thư mục: ' + dirPath);

    const videoExts = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm']);
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const videoFiles = entries
      .filter(e => e.isFile() && videoExts.has(path.extname(e.name).toLowerCase()))
      .map(e => path.join(dirPath, e.name));

    // Check import.xml in dirPath or parent
    let importMetaMap = new Map();
    const xmlPaths = [path.join(dirPath, 'import.xml'), path.join(path.dirname(dirPath), 'import.xml')];
    for (const xp of xmlPaths) {
      if (fs.existsSync(xp)) {
        try {
          const xml = fs.readFileSync(xp, 'utf-8');
          const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
          for (const im of itemMatches) {
            const titleM = im.match(/<title>([\s\S]*?)<\/title>/i);
            const captionM = im.match(/<caption>([\s\S]*?)<\/caption>/i);
            const fileM = im.match(/<(file|media_path)>([\s\S]*?)<\/(file|media_path)>/i);
            if (fileM && fileM[2]) {
              const fKey = path.basename(fileM[2].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
              importMetaMap.set(fKey, {
                title: titleM ? titleM[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '',
                caption: captionM ? captionM[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : ''
              });
            }
          }
        } catch (e) {
          console.warn('[Publisher] Could not parse import.xml:', e.message);
        }
        break;
      }
    }

    return videoFiles.map(vPath => {
      const base = path.basename(vPath);
      const meta = importMetaMap.get(base) || {};
      const defaultTitle = base.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      // Thumbnail được giao diện xin sau (bất đồng bộ) — không chạy ffmpeg tuần tự ở đây làm đứng app
      const thumb = (this.thumbnailCache && this.thumbnailCache.get(vPath)) || null;
      return {
        itemId: 'clip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        mediaPath: vPath,
        title: meta.title || defaultTitle,
        caption: meta.caption || `${meta.title || defaultTitle} #kenzious #reels #xuhuong #viral`,
        selected: true,
        thumbnail: thumb
      };
    });
  }

  /**
   * Plan and launch custom batch publishing job
   */
    /**
   * Package selected clips and channels into post_events in SQLite WAL
   */
  createPublishSession({ clips = [], channels = [], settings = {} }) {
    // 1. Gather active clips
    let activeClips = (clips || []).filter(c => c && c.selected !== false);
    if (activeClips.length === 0) {
      const draft = publisherDb.getJobDraft('default_job');
      if (draft && draft.clips) {
        activeClips = draft.clips.filter(c => c && c.selected !== false);
      }
    }
    if (activeClips.length === 0) {
      throw new Error('Chưa chọn video nào để đăng. Vui lòng chọn ít nhất 1 video ở Cột 1.');
    }

    // 2. Gather active channels
    let activeChannels = (channels || []).filter(ch => ch && !ch.disabled);
    if (activeChannels.length === 0) {
      const draft = publisherDb.getJobDraft('default_job');
      if (draft && draft.channels) {
        activeChannels = draft.channels.filter(ch => ch && !ch.disabled);
      }
    }
    const allAccounts = storage.getAccounts();
    if (activeChannels.length === 0 && allAccounts.length > 0) {
      // Auto-fallback to all connected accounts
      activeChannels = allAccounts.map(acc => ({
        accountId: acc.id,
        destinationIds: (acc.destinations || []).map(d => d.id || d.target_id),
        disabled: false
      }));
    }
    if (activeChannels.length === 0) {
      throw new Error('Chưa chọn kênh nào để đăng. Vui lòng kết nối tài khoản hoặc chọn kênh ở Cột 2.');
    }

    // 3. Resolve targets (Account + Destination pairs)
    const targets = [];
    for (const ch of activeChannels) {
      const acc = allAccounts.find(a => a.id === ch.accountId);
      if (!acc) continue;

      const destinations = (acc.destinations || []);
      let chosenDests = [];
      if (ch.destinationIds && ch.destinationIds.length > 0) {
        chosenDests = destinations.filter(d => ch.destinationIds.includes(d.id || d.target_id));
      }
      if (chosenDests.length === 0) {
        chosenDests = destinations.filter(d => d.selected);
      }
      if (chosenDests.length === 0 && destinations.length > 0) {
        chosenDests = [destinations[0]];
      }
      if (chosenDests.length === 0) {
        chosenDests = [{ id: 'dest_main_acc_' + acc.id, name: acc.displayName || 'Profile', type: 'profile' }];
      }

      for (const d of chosenDests) {
        targets.push({ account: acc, dest: d });
      }
    }

    if (targets.length === 0) {
      throw new Error('Không có đích đăng nào hợp lệ trong các kênh đã chọn.');
    }

    for (const t of targets) {
      t.destId = resolveDestinationId(t.dest, t.account);
      t.destType = t.dest.type || 'profile';
    }

    // 4. Build planned tasks with deduplication logic
    const postedPairs = new Set();
    const shouldDedup = settings.skipDuplicateVideoPerChannel !== false && !settings.forceDispatch;
    if (shouldDedup) {
      for (const ev of publisherDb.getAllEvents()) {
        if (POSTED_STATUSES.has(ev.status)) {
          postedPairs.add(dedupKey(ev.account_id, ev.destination_type, ev.destination_id, ev.video_path));
        }
      }
    }

    const plannedTasks = [];
    let skippedDuplicates = 0;
    const postToAll = settings.postVideoToAllChannels !== false;
    const planTask = (clip, t) => {
      const key = dedupKey(t.account.id, t.destType, t.destId, clip.mediaPath);
      if (shouldDedup && postedPairs.has(key)) {
        skippedDuplicates++;
        return;
      }
      // Chống trùng ngay trong phiên (vd: 2 tài khoản cùng quản trị 1 Fanpage)
      if (shouldDedup) postedPairs.add(key);
      plannedTasks.push({ clip, target: t });
    };

    if (postToAll) {
      for (const clip of activeClips) {
        for (const t of targets) planTask(clip, t);
      }
    } else {
      for (let i = 0; i < activeClips.length; i++) {
        planTask(activeClips[i], targets[i % targets.length]);
      }
    }

    if (plannedTasks.length === 0) {
      throw new Error(`Tất cả ${skippedDuplicates} lượt đăng đã chọn đều đã được đăng (hoặc đang chờ kiểm tra tay) trên các kênh này. ` +
        'Nếu thật sự muốn đăng lại, hãy tắt "Không đăng trùng video lên 1 kênh" ở Cột 3.');
    }

    // 5. Create Session Record (chỉ tạo khi chắc chắn có việc để làm)
    const sessionName = settings.sessionName || ('Chiến dịch ' + new Date().toLocaleTimeString('vi-VN'));
    const gapMinutes = settings.postTimeoutMin || 5;
    const session = publisherDb.createSession(sessionName, gapMinutes);

    // 6. Shuffle if random order
    if (settings.videoOrderMode === 'random') {
      for (let i = plannedTasks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [plannedTasks[i], plannedTasks[j]] = [plannedTasks[j], plannedTasks[i]];
      }
    }

    // 7. Package each planned task into post_events in SQLite WAL
    const pathMod = require('path');
    const events = [];
    for (const task of plannedTasks) {
      const { clip, target } = task;
      const cooldownSec = (settings.intervalRandom && settings.intervalRandom.min)
        ? Math.floor(Math.random() * (settings.intervalRandom.max - settings.intervalRandom.min + 1)) + settings.intervalRandom.min
        : 20;

      const fallbackTitle = pathMod.basename(clip.mediaPath || '', pathMod.extname(clip.mediaPath || '')).replace(/[-_]/g, ' ');
      const title = clip.title || fallbackTitle;
      const caption = clip.caption !== undefined ? clip.caption : `${title} #kenzious #reels #xuhuong #viral`;

      const evt = publisherDb.addEvent({
        session_id: session.id,
        account_id: target.account.id,
        destination_id: target.destId,
        destination_name: target.dest.name || target.account.displayName,
        destination_type: target.destType,
        platform: target.account.platform || 'facebook',
        video_path: clip.mediaPath,
        title: title,
        caption: caption,
        cooldown_seconds: cooldownSec
      });
      events.push(evt);
    }

    // 8. Immediately update total_tasks in post_sessions table
    publisherDb.updateSessionStatus(session.id, 'pending', {
      total_tasks: events.length,
      completed_tasks: 0,
      failed_tasks: 0
    });

    const updatedSession = publisherDb.getSession(session.id);
    return { session: updatedSession, events, eventsCount: events.length, skippedDuplicates };
  }

  /**
   * Plan, package into SQLite WAL, and launch custom batch publishing job
   */
  async startCustomJob({ clips = [], channels = [], settings = {} }, onProgress = () => {}) {
    // Kiểm tra TRƯỚC khi tạo session, tránh tạo phiên mồ côi khi đang có phiên khác chạy/đang dừng dở
    if (this.isProcessing) {
      throw new Error('Phiên đăng trước vẫn đang chạy hoặc đang chờ video dở dang đăng xong. Vui lòng đợi rồi thử lại.');
    }

    // 1. Automatically scan Column 1 & Column 2 and package into post_events
    const result = this.createPublishSession({ clips, channels, settings });

    // Phiên mới thay thế các phiên đã tạm dừng trước đó: huỷ các lượt chưa chạy của chúng
    const newSessionId = result.session.id;
    publisherDb.bulkUpdateStatus(e => e.session_id !== newSessionId && RESUMABLE_STATUSES.includes(e.status), 'cancelled', {
      error_message: 'Đã huỷ do bắt đầu phiên đăng mới.'
    });

    // 2. Configure concurrency limit
    this.concurrencyLimit = Math.max(1, parseInt(settings.parallelThreads, 10) || 1);

    // 3. Launch Lane Sequential Queue execution asynchronously
    this._launchInBackground(result.session.id, onProgress);

    return result;
  }

  /**
   * Tiếp tục một phiên đã tạm dừng (chỉ chạy các lượt chưa hoàn tất, không tạo phiên mới)
   */
  resumeSession(sessionId, onProgress = () => {}) {
    if (this.isProcessing) {
      throw new Error('Video đang đăng dở của lượt trước chưa xong. Vui lòng đợi vài giây rồi bấm Tiếp tục lại.');
    }
    const session = publisherDb.getSession(sessionId);
    if (!session) throw new Error('Không tìm thấy phiên đăng cần tiếp tục.');

    const remaining = publisherDb.getEventsBySession(sessionId).filter(e => RESUMABLE_STATUSES.includes(e.status)).length;
    this._launchInBackground(sessionId, onProgress);
    return { session, remaining };
  }

  _launchInBackground(sessionId, onProgress) {
    this.processSession(sessionId, onProgress).catch(err => {
      console.error('[Publisher] Session error:', err.message);
      onProgress({ type: 'session_error', sessionId, status: 'failed', message: `Lỗi phiên đăng: ${err.message}` });
    });
  }

  getQueueEvents() {
    return publisherDb.getQueueEvents();
  }

  getQueue() {
    return publisherDb.getQueueEvents();
  }

  getSessions() {
    return publisherDb.getAllSessions();
  }

  getEvents(sessionId) {
    return publisherDb.getEventsBySession(sessionId);
  }

  /**
   * Group tasks into per-account sequential lanes
   */
  groupEventsByAccount(events) {
    const map = new Map();
    for (const ev of events) {
      if (!map.has(ev.account_id)) {
        map.set(ev.account_id, []);
      }
      map.get(ev.account_id).push(ev);
    }
    return map;
  }

  /**
   * Process a single account lane strictly sequentially
   */
  async processAccountLane(accountId, items, onProgress) {
    // Phiên đã bị tạm dừng trước khi lane này tới lượt → giữ nguyên 'pending' để Resume chạy tiếp
    if (this.cancelRequested) return;
    this.runningLanes.set(accountId, true);
    const account = storage.getAccounts().find(a => a.id === accountId);

    if (!account) {
      for (const item of items) {
        publisherDb.updateEventStatus(item.id, 'failed', { error_message: 'Không tìm thấy tài khoản tương ứng' });
      }
      this.runningLanes.delete(accountId);
      return;
    }

    const emitResult = (item, status, message) => {
      const c = this._sessionCounts(item.session_id);
      publisherDb.updateSessionStatus(item.session_id, 'running', { completed_tasks: c.completed, failed_tasks: c.failed });
      onProgress({
        eventId: item.id,
        accountId,
        sessionId: item.session_id,
        status,
        completedCount: c.completed,
        failedCount: c.failed,
        reviewCount: c.review,
        totalCount: c.total,
        message
      });
    };

    try {
      for (let i = 0; i < items.length; i++) {
        if (this._shouldStop(accountId)) break;

        const item = items[i];
        const destinationKey = `${item.platform}_${item.destination_id || item.account_id}`;

        // 1. Destination Cooldown & Jitter
        const lastPub = this.destinationCooldowns.get(destinationKey) || 0;
        const cooldownSec = item.cooldown_seconds || 120;
        const elapsedSec = Math.floor((Date.now() - lastPub) / 1000);

        if (lastPub > 0 && elapsedSec < cooldownSec) {
          const remaining = cooldownSec - elapsedSec;
          publisherDb.updateEventStatus(item.id, 'waiting_cooldown');

          // Countdown countdown updates every second
          for (let sec = remaining; sec > 0; sec--) {
            if (this._shouldStop(accountId)) break;
            onProgress({
              eventId: item.id,
              accountId,
              status: 'waiting_cooldown',
              remainingSec: sec,
              message: `[Fanpage: ${item.destination_name}] Đang nghỉ Cooldown: còn ${sec}s...`
            });
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        if (this._shouldStop(accountId)) {
          publisherDb.updateEventStatus(item.id, 'pending');
          break;
        }

        // Anti-Spam Jitter Delay (15s to 20s) between items in the same lane
        if (i > 0) {
          publisherDb.updateEventStatus(item.id, 'jitter_delay');
          const jitterTotal = 15 + Math.floor(Math.random() * 6);
          for (let s = jitterTotal; s > 0; s--) {
            if (this._shouldStop(accountId)) break;
            onProgress({
              eventId: item.id,
              accountId,
              status: 'jitter_delay',
              remainingSec: s,
              message: `[Tài khoản: ${account.displayName}] Giãn cách Jitter chống checkpoint: còn ${s}s...`
            });
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        if (this._shouldStop(accountId)) {
          publisherDb.updateEventStatus(item.id, 'pending');
          break;
        }

        // 2. Perform Auto-Post Execution
        publisherDb.updateEventStatus(item.id, 'uploading', { started_at: Date.now() });
        onProgress({
          eventId: item.id,
          accountId,
          status: 'uploading',
          message: `Đang đăng video "${item.title}" lên ${item.destination_name}...`
        });

        try {
          // Pre-flight: Giải phóng profile lock trước khi mở trình duyệt
          this._ensureProfileUnlocked(account);

          // Định tuyến theo nền tảng: Pinterest đăng qua API nội bộ (không mở browser); còn lại dùng driver Playwright.
          let result;
          if ((account.platform || '') === 'pinterest') {
            const pres = await pinterestPoster.publishPin(item, account, (p) => {
              onProgress({ eventId: item.id, accountId, status: p.phase || 'uploading', message: p.message });
            });
            if (!pres.ok) throw new Error(pres.error || 'Đăng Pinterest thất bại');
            result = { status: 'success', url: pres.id ? ('https://www.pinterest.com/pin/' + pres.id + '/') : '' };
          } else {
            result = await facebookPoster.uploadReel(item, account, (p) => {
              onProgress({ eventId: item.id, accountId, status: p.phase, message: p.message });
            });
          }

          this.destinationCooldowns.set(destinationKey, Date.now());

          if (result && result.status === 'draft') {
            publisherDb.updateEventStatus(item.id, 'draft', {
              error_message: 'Facebook không cho bấm Đăng — video chỉ được lưu bản nháp, cần vào Facebook đăng tay.',
              completed_at: Date.now()
            });
            emitResult(item, 'draft', `⚠ ${item.destination_name}: chỉ lưu được bản nháp, cần vào Facebook đăng tay.`);
          } else {
            publisherDb.updateEventStatus(item.id, 'success', { completed_at: Date.now() });
            emitResult(item, 'success', `✓ Đăng thành công lên ${item.destination_name}!`);
          }
        } catch (err) {
          if (err.code === 'UNVERIFIED') {
            // Bài có thể đã lên → vẫn tính cooldown và KHÔNG coi là lỗi để tránh tự đăng lại gây trùng
            this.destinationCooldowns.set(destinationKey, Date.now());
            publisherDb.updateEventStatus(item.id, 'unverified', {
              error_message: err.message,
              completed_at: Date.now()
            });
            emitResult(item, 'unverified', `⚠ ${item.destination_name}: ${err.message}`);
          } else {
            publisherDb.updateEventStatus(item.id, 'failed', {
              error_message: err.message,
              completed_at: Date.now()
            });
            emitResult(item, 'failed', `✗ Lỗi đăng lên ${item.destination_name}: ${err.message}`);
          }
        }
      }
    } finally {
      this.runningLanes.delete(accountId);
    }
  }

  /**
   * Run Batch Session with Lane Concurrency
   */
  async processSession(sessionId, onProgress = () => {}) {
    if (this.isProcessing) throw new Error('Đang có phiên xuất bản khác đang chạy.');
    this.isProcessing = true;
    this.activeSessionId = sessionId;
    this.cancelRequested = false;

    publisherDb.updateSessionStatus(sessionId, 'running');

    const emitSessionEnd = (type, status, message) => {
      const c = this._sessionCounts(sessionId);
      publisherDb.updateSessionStatus(sessionId, status, {
        completed_tasks: c.completed,
        failed_tasks: c.failed,
        total_tasks: c.total
      });
      onProgress({
        type,
        sessionId,
        status,
        completedCount: c.completed,
        failedCount: c.failed,
        reviewCount: c.review,
        totalCount: c.total,
        message: message(c)
      });
    };
    const doneMessage = (c) => `Hoàn tất phiên đăng! Thành công: ${c.completed}, Thất bại: ${c.failed}` +
      (c.review > 0 ? `, Cần kiểm tra tay: ${c.review}.` : '.');

    try {
      const events = publisherDb.getEventsBySession(sessionId).filter(e => RESUMABLE_STATUSES.includes(e.status));
      if (events.length === 0) {
        emitSessionEnd('session_done', 'completed', doneMessage);
        return;
      }

      const accountMap = this.groupEventsByAccount(events);
      const laneEntries = Array.from(accountMap.entries());

      // Process with robust concurrency pool using Set
      const executing = new Set();
      for (const [accId, items] of laneEntries) {
        if (this.cancelRequested) break;
        const lanePromise = this.processAccountLane(accId, items, onProgress).finally(() => {
          executing.delete(lanePromise);
        });
        executing.add(lanePromise);

        if (executing.size >= this.concurrencyLimit) {
          await Promise.race(executing);
        }
      }

      await Promise.all(Array.from(executing));

      const left = publisherDb.getEventsBySession(sessionId).filter(e => RESUMABLE_STATUSES.includes(e.status)).length;
      if (this.cancelRequested && left > 0) {
        emitSessionEnd('session_paused', 'paused', (c) =>
          `Đã tạm dừng. Thành công: ${c.completed}, Thất bại: ${c.failed}, còn ${left} lượt chưa đăng — bấm "Tiếp tục đăng" để chạy tiếp.`);
        return;
      }

      emitSessionEnd('session_done', 'completed', doneMessage);
    } finally {
      this.isProcessing = false;
      this.activeSessionId = null;
      this.runningLanes.clear();
    }
  }

  /**
   * Tạm dừng: không khởi động lượt/lane mới. Video đang upload dở vẫn chạy nốt,
   * processSession sẽ tự kết thúc và phát 'session_paused' — KHÔNG hạ isProcessing ở đây
   * để tránh một phiên khác mở trùng profile trong lúc đó.
   */
  pauseSession() {
    if (!this.isProcessing) return { paused: false, sessionId: null };
    this.cancelRequested = true;
    for (const [accId] of this.runningLanes.entries()) {
      this.runningLanes.set(accId, false);
    }
    return { paused: true, sessionId: this.activeSessionId };
  }
}

module.exports = new BatchPublisherService();
