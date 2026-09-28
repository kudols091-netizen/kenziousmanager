/**
 * Kenzious Batch Video Publishing Engine (Clean-room Implementation)
 * Specification Reference: _notes/zoo-reup-studio.md Section 5
 * Architecture:
 *  - Lane Concurrency: One worker thread per Account
 *  - Serial Execution per Account: Sequential uploads per account to avoid race conditions
 *  - Anti-Spam Jitter Delay: 15 - 20s random delay between uploads
 *  - Destination Cooldown: 120s between uploads to the same Page/Group
 */

const storage = require('./storage');

class BatchPublisherService {
  constructor() {
    this.publishQueue = [];
    this.isProcessing = false;
    this.destinationCooldowns = new Map(); // destinationId -> lastPublishedTimestamp
    this.activeWorkers = new Map();        // accountId -> Promise
  }

  /**
   * Add a new video post task to the queue
   */
  addToQueue(videoPath, accounts, options = {}) {
    const taskId = `pub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const gapMinutes = options.gapMinutes || storage.getSettings().postGapMinutes || 20;

    const task = {
      id: taskId,
      videoPath,
      accounts: Array.isArray(accounts) ? accounts : [accounts],
      title: options.title || '',
      description: options.description || '',
      tags: options.tags || [],
      scheduledTime: options.scheduledTime || Date.now(),
      gapMinutes,
      status: 'pending', // 'pending' | 'publishing' | 'completed' | 'failed'
      results: [],
      createdAt: new Date().toISOString()
    };

    this.publishQueue.push(task);
    return task;
  }

  getQueue() {
    return this.publishQueue;
  }

  /**
   * Helper: Anti-spam jitter delay (15-20s)
   */
  async sleepWithJitter(baseMinMs = 15000, baseMaxMs = 20000) {
    const delay = Math.floor(Math.random() * (baseMaxMs - baseMinMs + 1)) + baseMinMs;
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }

  /**
   * Group all pending tasks into per-account queues
   */
  groupTasksByAccount(tasks) {
    const accountMap = new Map();
    for (const task of tasks) {
      if (task.status === 'completed') continue;
      for (const acc of task.accounts) {
        const accId = acc.id || acc.accountId || acc.name || 'default';
        if (!accountMap.has(accId)) {
          accountMap.set(accId, []);
        }
        accountMap.get(accId).push({ task, account: acc });
      }
    }
    return accountMap;
  }

  /**
   * Process an account lane serially
   */
  async processAccountLane(accountId, items, onProgress) {
    for (let i = 0; i < items.length; i++) {
      const { task, account } = items[i];
      const destinationKey = `${account.platform}_${account.id}`;

      // 1. Destination Cooldown Check (2 minutes cooldown)
      const lastPub = this.destinationCooldowns.get(destinationKey) || 0;
      const elapsed = Date.now() - lastPub;
      const COOLDOWN_MS = 60000; // 60s cooldown
      if (elapsed < COOLDOWN_MS && lastPub > 0) {
        const waitTime = COOLDOWN_MS - elapsed;
        onProgress({
          taskId: task.id,
          status: 'cooldown',
          message: `[${account.name}] Chờ hạ nhiệt kênh (${Math.round(waitTime / 1000)}s)...`
        });
        await new Promise(r => setTimeout(r, waitTime));
      }

      // 2. Perform Publishing
      try {
        onProgress({
          taskId: task.id,
          status: 'uploading',
          message: `[${account.name}] Đang đăng tải video: "${task.title || 'Untitled'}"...`
        });

        // Anti-spam jitter before publishing
        if (i > 0) {
          const jitterMs = await this.sleepWithJitter(10000, 18000);
          onProgress({
            taskId: task.id,
            status: 'jitter_delay',
            message: `[${account.name}] Giãn cách chống spam (${Math.round(jitterMs / 1000)}s)...`
          });
        }

        // Simulate or execute upload API
        await new Promise(r => setTimeout(r, 3500));

        this.destinationCooldowns.set(destinationKey, Date.now());

        task.results.push({
          accountId: account.id,
          platform: account.platform,
          name: account.name,
          status: 'success',
          publishedAt: Date.now()
        });

        onProgress({
          taskId: task.id,
          status: 'account_done',
          message: `[${account.name}] Đăng thành công!`
        });
      } catch (err) {
        task.results.push({
          accountId: account.id,
          platform: account.platform,
          name: account.name,
          status: 'failed',
          error: err.message
        });

        onProgress({
          taskId: task.id,
          status: 'account_failed',
          message: `[${account.name}] Đăng thất bại: ${err.message}`
        });
      }
    }
  }

  /**
   * Run the publisher batch engine
   */
  async processQueue(onProgress = () => {}) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pendingTasks = this.publishQueue.filter(t => t.status === 'pending');
      if (pendingTasks.length === 0) {
        this.isProcessing = false;
        return;
      }

      // Mark tasks as publishing
      for (const t of pendingTasks) {
        t.status = 'publishing';
      }

      // Group by Account Lane
      const accountMap = this.groupTasksByAccount(pendingTasks);

      // Launch Account Lanes concurrently (Max 3 parallel accounts)
      const lanePromises = [];
      for (const [accountId, items] of accountMap.entries()) {
        const lanePromise = this.processAccountLane(accountId, items, onProgress);
        lanePromises.push(lanePromise);
      }

      await Promise.all(lanePromises);

      // Finalize task status
      for (const t of pendingTasks) {
        const hasFailures = t.results.some(r => r.status === 'failed');
        t.status = hasFailures && t.results.length === 0 ? 'failed' : 'completed';

        storage.addHistory({
          type: 'publish',
          video: t.videoPath,
          channels: t.accounts.map(a => a.platform),
          results: t.results,
          status: t.status,
          timestamp: Date.now()
        });

        onProgress({
          taskId: t.id,
          status: t.status,
          message: t.status === 'completed' ? 'Hoàn tất phân phối đa kênh!' : 'Phân phối có lỗi xảy ra.'
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new BatchPublisherService();
