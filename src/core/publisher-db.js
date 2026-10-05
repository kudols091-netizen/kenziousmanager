/**
 * Kenzious Reel V2 - Publisher Storage & Database Layer
 * Clean-Room Specification Reference: _notes/zoo-reup-studio.md Section 5
 * Persistent Storage for Post Sessions & Post Events
 * Fully compatible with all Electron & Node.js runtimes (No native compilation required)
 */

const path = require('path');
const fs = require('fs');
const paths = require('./paths');

class PublisherDb {
  constructor() {
    this.dataDir = paths.getDataDir();

    this.jsonPath = path.join(this.dataDir, 'publisher_data.json');
    this.data = {
      reup_jobs: {},
      post_sessions: [],
      post_events: []
    };

    this._load();
  }

  _load() {
    if (!fs.existsSync(this.jsonPath)) {
      this._save();
      return;
    }
    // File hỏng được đổi tên thành .corrupt-<ts> (giữ lại để khôi phục) thay vì bị ghi đè trắng
    const parsed = paths.readJsonSafe(this.jsonPath, null);
    if (parsed && typeof parsed === 'object') {
      this.data = {
        reup_jobs: parsed.reup_jobs || {},
        post_sessions: Array.isArray(parsed.post_sessions) ? parsed.post_sessions : [],
        post_events: Array.isArray(parsed.post_events) ? parsed.post_events : []
      };
    }
  }

  _save() {
    try {
      paths.writeJsonAtomic(this.jsonPath, this.data);
    } catch (err) {
      console.error('[PublisherDb] Save error:', err.message);
    }
  }

  // --- Sessions Management ---
  createSession(name, gapMinutes = 20) {
    const id = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const session = {
      id,
      name,
      total_tasks: 0,
      completed_tasks: 0,
      failed_tasks: 0,
      status: 'pending',
      gap_minutes: gapMinutes,
      created_at: now,
      updated_at: now
    };
    this.data.post_sessions.push(session);
    this._save();
    return { ...session };
  }

  getSession(id) {
    const sess = this.data.post_sessions.find(s => s.id === id);
    return sess ? { ...sess } : null;
  }

  getAllSessions() {
    return [...this.data.post_sessions].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }

  updateSessionStatus(id, status, patch = {}) {
    const sess = this.data.post_sessions.find(s => s.id === id);
    if (!sess) return null;

    sess.status = status;
    if (patch.completed_tasks !== undefined) sess.completed_tasks = patch.completed_tasks;
    if (patch.failed_tasks !== undefined) sess.failed_tasks = patch.failed_tasks;
    if (patch.total_tasks !== undefined) sess.total_tasks = patch.total_tasks;
    sess.updated_at = Date.now();

    this._save();
    return { ...sess };
  }

  // --- Events Management ---
  addEvent(event) {
    const id = event.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const evt = {
      id,
      session_id: event.session_id || 'default_session',
      account_id: event.account_id,
      destination_id: event.destination_id || '',
      destination_name: event.destination_name || 'Personal Profile',
      destination_type: event.destination_type || 'profile',
      platform: event.platform || 'facebook',
      video_path: event.video_path,
      title: event.title || '',
      caption: event.caption || '',
      status: 'pending',
      error_message: null,
      retry_count: 0,
      cooldown_seconds: event.cooldown_seconds || 0,
      scheduled_at: event.scheduled_at || now,
      started_at: null,
      completed_at: null,
      created_at: now
    };

    this.data.post_events.push(evt);

    if (event.session_id) {
      const sess = this.data.post_sessions.find(s => s.id === event.session_id);
      if (sess) {
        sess.total_tasks = (sess.total_tasks || 0) + 1;
        sess.updated_at = now;
      }
    }

    this._save();
    return { ...evt };
  }

  getEvent(id) {
    const evt = this.data.post_events.find(e => e.id === id);
    return evt ? { ...evt } : null;
  }

  getEventsBySession(sessionId) {
    return this.data.post_events
      .filter(e => e.session_id === sessionId)
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  }

  getQueueEvents() {
    return [...this.data.post_events].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }

  getAllEvents() {
    return [...this.data.post_events].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }

  getPendingEvents() {
    return this.data.post_events
      .filter(e => ['pending', 'waiting_cooldown', 'jitter_delay'].includes(e.status))
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  }

  updateEventStatus(id, status, patch = {}) {
    const evt = this.data.post_events.find(e => e.id === id);
    if (!evt) return null;

    evt.status = status;
    if (patch.error_message !== undefined) evt.error_message = patch.error_message;
    if (patch.retry_count !== undefined) evt.retry_count = patch.retry_count;
    if (patch.started_at !== undefined) evt.started_at = patch.started_at;
    if (patch.completed_at !== undefined) evt.completed_at = patch.completed_at;

    this._save();
    return { ...evt };
  }

  bulkUpdateStatus(predicate, status, patch = {}) {
    let changed = 0;
    for (const evt of this.data.post_events) {
      if (!predicate(evt)) continue;
      evt.status = status;
      if (patch.error_message !== undefined) evt.error_message = patch.error_message;
      if (patch.completed_at !== undefined) evt.completed_at = patch.completed_at;
      changed++;
    }
    if (changed > 0) this._save();
    return changed;
  }

  saveJobDraft(job) {
    const id = job.id || 'default_job';
    const now = Date.now();
    const existing = this.data.reup_jobs[id];

    const draft = {
      id,
      name: job.name || 'Chiến dịch xuất bản',
      clips: job.clips || [],
      channels: job.channels || [],
      settings: job.settings || {},
      created_at: existing ? existing.created_at : now,
      updated_at: now
    };

    this.data.reup_jobs[id] = draft;
    this._save();
    return { ...draft };
  }

  getJobDraft(id = 'default_job') {
    const draft = this.data.reup_jobs[id];
    return draft ? { ...draft } : null;
  }

  clearQueue() {
    this.data.post_events = this.data.post_events.filter(e => !['pending', 'failed'].includes(e.status));
    this._save();
  }
}

module.exports = new PublisherDb();
