/**
 * Kenzious Get Cookie - Auto Tương Tác Nuôi Nick Sidebar
 * Floating, draggable control panel on Facebook for simulating natural user activity (Feed, Reels, Likes).
 */

window.AutoTuongTacSidebar = {
  isRunning: false,
  loopTimer: null,
  sidebarElem: null,

  // Settings
  config: {
    autoScrollFeed: true,
    autoLikePost: true,
    autoWatchReels: false,
    autoComment: false,
    minDelaySec: 3,
    maxDelaySec: 8
  },

  toggle() {
    if (!this.sidebarElem) {
      this.createSidebar();
    } else {
      if (this.sidebarElem.style.display === 'none') {
        this.sidebarElem.style.display = 'block';
      } else {
        this.sidebarElem.style.display = 'none';
      }
    }
  },

  createSidebar() {
    const el = document.createElement('div');
    el.id = 'kz-floating-sidebar';
    el.innerHTML = `
      <div class="kz-sidebar-header" id="kz-sidebar-drag-handle">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:14px;">⚡</span>
          <span style="font-size:12.5px;font-weight:700;letter-spacing:0.5px;">KENZIOUS NUÔI NICK</span>
        </div>
        <button id="kz-sidebar-close" style="background:transparent;border:none;color:#94A3B8;cursor:pointer;font-size:18px;">&times;</button>
      </div>

      <div class="kz-sidebar-body">
        <div class="kz-switch-row">
          <span>Lướt Bảng Tin Tự Động</span>
          <label class="kz-switch">
            <input type="checkbox" id="kz-cfg-scroll" checked>
            <span class="kz-slider"></span>
          </label>
        </div>

        <div class="kz-switch-row">
          <span>Thả Cảm Xúc Ngẫu Nhiên (Like/Love)</span>
          <label class="kz-switch">
            <input type="checkbox" id="kz-cfg-like" checked>
            <span class="kz-slider"></span>
          </label>
        </div>

        <div class="kz-switch-row">
          <span>Tự Động Xem Video Reels (5-15s)</span>
          <label class="kz-switch">
            <input type="checkbox" id="kz-cfg-reels">
            <span class="kz-slider"></span>
          </label>
        </div>

        <div class="kz-switch-row">
          <span>Độ Trễ Giữa Các Hành Động:</span>
          <span style="font-size:11px;color:#FAC0FA;font-weight:700;">3s - 8s</span>
        </div>

        <div style="margin-top:12px;display:flex;gap:8px;">
          <button class="kz-btn kz-btn-primary" id="kz-btn-start-auto" style="flex:1;justify-content:center;">
            ▶ Bắt Đầu Nuôi Nick
          </button>
          <button class="kz-btn kz-btn-secondary" id="kz-btn-stop-auto" style="display:none;flex:1;justify-content:center;">
            ⏹ Dừng Chạy
          </button>
        </div>

        <div class="kz-log-box" id="kz-activity-log">
          [Hệ thống] Sẵn sàng kích hoạt kịch bản nuôi nick.
        </div>
      </div>
    `;

    document.body.appendChild(el);
    this.sidebarElem = el;
    this.bindEvents();
    this.makeDraggable(el, el.querySelector('#kz-sidebar-drag-handle'));
  },

  log(msg) {
    const logBox = document.getElementById('kz-activity-log');
    if (!logBox) return;
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.textContent = `[${time}] ${msg}`;
    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight;
  },

  bindEvents() {
    const closeBtn = document.getElementById('kz-sidebar-close');
    closeBtn.onclick = () => { this.sidebarElem.style.display = 'none'; };

    const btnStart = document.getElementById('kz-btn-start-auto');
    const btnStop = document.getElementById('kz-btn-stop-auto');

    const chkScroll = document.getElementById('kz-cfg-scroll');
    const chkLike = document.getElementById('kz-cfg-like');
    const chkReels = document.getElementById('kz-cfg-reels');

    chkScroll.onchange = () => { this.config.autoScrollFeed = chkScroll.checked; };
    chkLike.onchange = () => { this.config.autoLikePost = chkLike.checked; };
    chkReels.onchange = () => { this.config.autoWatchReels = chkReels.checked; };

    btnStart.onclick = () => {
      this.isRunning = true;
      btnStart.style.display = 'none';
      btnStop.style.display = 'inline-flex';
      this.log('Kích hoạt chế độ nuôi nick...');
      this.runNextAction();
    };

    btnStop.onclick = () => {
      this.isRunning = false;
      if (this.loopTimer) clearTimeout(this.loopTimer);
      btnStart.style.display = 'inline-flex';
      btnStop.style.display = 'none';
      this.log('Đã dừng tiến trình.');
    };
  },

  async runNextAction() {
    if (!this.isRunning) return;

    try {
      if (this.config.autoWatchReels && window.location.href.includes('/reel/')) {
        // Reels Mode: scroll down after 5 - 12s
        this.log('Đang xem video Reels hiện tại...');
        const watchDuration = (Math.floor(Math.random() * 8) + 5) * 1000;
        await new Promise(r => setTimeout(r, watchDuration));

        if (!this.isRunning) return;
        window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
        this.log('Chuyển sang video Reels kế tiếp.');
      } else {
        // Feed Mode: scroll & interact
        if (this.config.autoScrollFeed) {
          const scrollDistance = Math.floor(Math.random() * 250) + 350;
          window.scrollBy({ top: scrollDistance, behavior: 'smooth' });
          this.log(`Lướt feed ${scrollDistance}px.`);
        }

        // Random reaction
        if (this.config.autoLikePost && Math.random() < 0.35) {
          const likeButtons = document.querySelectorAll('div[aria-label*="Thích"][role="button"], div[aria-label*="Like"][role="button"]');
          if (likeButtons.length > 0) {
            // Pick a visible button
            for (const btn of likeButtons) {
              const rect = btn.getBoundingClientRect();
              if (rect.top > 100 && rect.top < window.innerHeight - 100) {
                btn.click();
                this.log('Đã thả Like tự nhiên cho bài viết.');
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Kenzious] Automation action error:', e);
    }

    // Schedule next step with random delay
    const delay = (Math.floor(Math.random() * (this.config.maxDelaySec - this.config.minDelaySec + 1)) + this.config.minDelaySec) * 1000;
    this.log(`Nghỉ ${Math.round(delay / 1000)}s chống Checkpoint...`);
    this.loopTimer = setTimeout(() => {
      this.runNextAction();
    }, delay);
  },

  makeDraggable(elem, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = (e) => {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = () => {
        document.onmouseup = null;
        document.onmousemove = null;
      };
      document.onmousemove = (e2) => {
        e2.preventDefault();
        pos1 = pos3 - e2.clientX;
        pos2 = pos4 - e2.clientY;
        pos3 = e2.clientX;
        pos4 = e2.clientY;
        elem.style.top = (elem.offsetTop - pos2) + "px";
        elem.style.left = (elem.offsetLeft - pos1) + "px";
        elem.style.right = 'auto';
      };
    };
  }
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TOGGLE_AUTO_SIDEBAR') {
    window.AutoTuongTacSidebar.toggle();
    sendResponse({ success: true });
    return true;
  }
});
