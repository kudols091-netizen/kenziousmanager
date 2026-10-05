/**
 * Kenzious Get Cookie - Scan UID Modal
 * Advanced Facebook UID Scraper for Reactions, Comments, and Group Members with direct Excel/CSV export.
 */

window.ScanUidModal = {
  isScanning: false,
  scannedData: [],
  scanType: 'reactions', // 'reactions' | 'comments' | 'members'

  open() {
    let modal = document.getElementById('kz-scan-uid-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'kz-scan-uid-modal';
      modal.className = 'kz-modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="kz-modal-container" style="width: 680px;">
        <div class="kz-modal-header">
          <div class="kz-modal-title">
            <span>🎯 Quét UID Facebook & Xuất Excel</span>
            <span class="kz-brand-badge">KENZIOUS PRO</span>
          </div>
          <button class="kz-modal-close-btn" id="kz-scan-close">&times;</button>
        </div>

        <div class="kz-modal-body">
          <!-- Selection & Controls Row -->
          <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: flex-end;">
            <div style="flex: 1;">
              <label class="kz-field-label">Chọn chế độ quét:</label>
              <select class="kz-field-input" id="kz-scan-mode" style="padding: 7px 10px;">
                <option value="reactions">Quét người Like / Thả cảm xúc trên bài viết</option>
                <option value="comments">Quét người bình luận (Comments) & lọc SĐT</option>
                <option value="members">Quét thành viên Group (Nếu đang ở trong Group)</option>
              </select>
            </div>
            <div>
              <button class="kz-btn kz-btn-primary" id="kz-btn-start-scan">
                ▶ Bắt Đầu Quét
              </button>
              <button class="kz-btn kz-btn-secondary" id="kz-btn-stop-scan" style="display: none;">
                ⏹ Dừng Lại
              </button>
            </div>
          </div>

          <!-- Statistics Cards -->
          <div class="kz-scan-stats-row">
            <div class="kz-stat-card">
              <div class="kz-stat-num" id="kz-stat-total">0</div>
              <div class="kz-stat-label">Tổng UID Đã Quét</div>
            </div>
            <div class="kz-stat-card">
              <div class="kz-stat-num" id="kz-stat-phone" style="color: #10B981;">0</div>
              <div class="kz-stat-label">Phát Hiện SĐT</div>
            </div>
            <div class="kz-stat-card">
              <div class="kz-stat-num" id="kz-stat-status" style="font-size: 13px; color: #94A3B8; padding-top: 4px;">Sẵn sàng</div>
              <div class="kz-stat-label">Trạng Thái</div>
            </div>
          </div>

          <!-- Preview Table -->
          <div class="kz-table-wrapper">
            <table class="kz-table">
              <thead>
                <tr>
                  <th style="width: 45px;">STT</th>
                  <th style="width: 150px;">UID Facebook</th>
                  <th>Họ & Tên</th>
                  <th>Loại / Ghi chú</th>
                  <th style="width: 80px;">Profile</th>
                </tr>
              </thead>
              <tbody id="kz-scan-table-body">
                <tr>
                  <td colspan="5" style="text-align: center; color: #64748B; padding: 24px;">
                    Chưa có dữ liệu. Bấm "Bắt Đầu Quét" để tiến hành cào UID từ trang Facebook hiện tại.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="kz-modal-footer">
          <button class="kz-btn kz-btn-secondary" id="kz-btn-export-csv" disabled>
            📄 Xuất CSV (BOM)
          </button>
          <button class="kz-btn kz-btn-primary" id="kz-btn-export-excel" disabled>
            📊 Xuất File Excel (.xls)
          </button>
          <button class="kz-btn kz-btn-secondary" id="kz-btn-copy-uids" disabled>
            📋 Copy Tất Cả UID
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    this.bindEvents(modal);
  },

  bindEvents(modal) {
    const closeBtn = modal.querySelector('#kz-scan-close');
    closeBtn.onclick = () => {
      this.isScanning = false;
      modal.style.display = 'none';
    };

    const btnStart = modal.querySelector('#kz-btn-start-scan');
    const btnStop = modal.querySelector('#kz-btn-stop-scan');
    const modeSelect = modal.querySelector('#kz-scan-mode');

    btnStart.onclick = () => {
      this.scanType = modeSelect.value;
      this.startScanning(modal);
    };

    btnStop.onclick = () => {
      this.isScanning = false;
      btnStart.style.display = 'inline-flex';
      btnStop.style.display = 'none';
      modal.querySelector('#kz-stat-status').textContent = 'Đã dừng';
    };

    // Export Excel
    const btnExportExcel = modal.querySelector('#kz-btn-export-excel');
    btnExportExcel.onclick = () => {
      if (this.scannedData.length === 0) return;
      const columns = [
        { key: 'stt', title: 'STT', width: 50 },
        { key: 'uid', title: 'UID Facebook', width: 160 },
        { key: 'name', title: 'Họ và Tên', width: 180 },
        { key: 'phone', title: 'Số Điện Thoại', width: 120 },
        { key: 'type', title: 'Loại Tương Tác', width: 120 },
        { key: 'url', title: 'Link Profile', width: 250 }
      ];
      if (window.XlsxExporter) {
        window.XlsxExporter.exportToExcel(this.scannedData, columns, `kenzious_uid_${Date.now()}`);
      }
    };

    // Export CSV
    const btnExportCsv = modal.querySelector('#kz-btn-export-csv');
    btnExportCsv.onclick = () => {
      if (this.scannedData.length === 0) return;
      const columns = [
        { key: 'stt', title: 'STT' },
        { key: 'uid', title: 'UID Facebook' },
        { key: 'name', title: 'Họ và Tên' },
        { key: 'phone', title: 'Số Điện Thoại' },
        { key: 'type', title: 'Loại Tương Tác' },
        { key: 'url', title: 'Link Profile' }
      ];
      if (window.XlsxExporter) {
        window.XlsxExporter.exportToCsv(this.scannedData, columns, `kenzious_uid_${Date.now()}`);
      }
    };

    // Copy All UIDs
    const btnCopyUids = modal.querySelector('#kz-btn-copy-uids');
    btnCopyUids.onclick = () => {
      const uids = this.scannedData.map(d => d.uid).filter(Boolean).join('\n');
      navigator.clipboard.writeText(uids).then(() => {
        alert(`Đã copy ${this.scannedData.length} UID vào Clipboard!`);
      });
    };
  },

  async startScanning(modal) {
    this.isScanning = true;
    this.scannedData = [];

    const btnStart = modal.querySelector('#kz-btn-start-scan');
    const btnStop = modal.querySelector('#kz-btn-stop-scan');
    btnStart.style.display = 'none';
    btnStop.style.display = 'inline-flex';

    const statTotal = modal.querySelector('#kz-stat-total');
    const statPhone = modal.querySelector('#kz-stat-phone');
    const statStatus = modal.querySelector('#kz-stat-status');
    const tbody = modal.querySelector('#kz-scan-table-body');
    const btnExportExcel = modal.querySelector('#kz-btn-export-excel');
    const btnExportCsv = modal.querySelector('#kz-btn-export-csv');
    const btnCopyUids = modal.querySelector('#kz-btn-copy-uids');

    tbody.innerHTML = '';
    statStatus.textContent = 'Đang quét...';
    statTotal.textContent = '0';
    statPhone.textContent = '0';

    const seenUids = new Set();
    let phoneCount = 0;

    // Helper to process user element
    const processUser = (name, url, note = '') => {
      if (!url) return;
      // Extract numeric UID or username
      let uid = '';
      const idMatch = url.match(/[?&]id=(\d+)/);
      if (idMatch) {
        uid = idMatch[1];
      } else {
        const pathParts = url.split('facebook.com/')[1] || '';
        const cleanName = pathParts.split('/')[0].split('?')[0];
        if (cleanName && !['groups', 'pages', 'watch', 'reel', 'stories', 'events'].includes(cleanName)) {
          uid = cleanName;
        }
      }

      if (!uid || seenUids.has(uid)) return;
      seenUids.add(uid);

      // Check phone regex
      let foundPhone = '';
      const phoneMatch = note.match(/(0\d{9,10}|\+84\d{9,10})/);
      if (phoneMatch) {
        foundPhone = phoneMatch[1];
        phoneCount++;
        statPhone.textContent = phoneCount;
      }

      const item = {
        stt: this.scannedData.length + 1,
        uid: uid,
        name: name || 'FB User',
        phone: foundPhone,
        type: note ? `Comment: ${note.slice(0, 30)}...` : this.scanType,
        url: url.startsWith('http') ? url : `https://www.facebook.com/${uid}`
      };

      this.scannedData.push(item);
      statTotal.textContent = this.scannedData.length;

      // Add to table
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:#94A3B8;">${item.stt}</td>
        <td style="font-family:monospace;font-weight:700;color:#FAC0FA;">${item.uid}</td>
        <td><b>${item.name}</b></td>
        <td style="color:#CBD5E1;font-size:11px;">${item.type}</td>
        <td><a href="${item.url}" target="_blank" style="color:#9950FA;text-decoration:none;">Xem</a></td>
      `;
      tbody.appendChild(tr);

      // Enable export buttons
      btnExportExcel.disabled = false;
      btnExportCsv.disabled = false;
      btnCopyUids.disabled = false;
    };

    // Scraping loop: scan elements on page with safe scrolling
    let iterations = 0;
    while (this.isScanning && iterations < 30) {
      iterations++;
      statStatus.textContent = `Vòng quét ${iterations}...`;

      if (this.scanType === 'reactions') {
        // Look for reaction dialog items
        const reactionNodes = document.querySelectorAll('div[role="dialog"] a[role="link"], div[role="dialog"] div[data-visualcompletion] a');
        if (reactionNodes.length > 0) {
          reactionNodes.forEach(a => {
            const name = a.textContent.trim();
            if (name && a.href && !a.href.includes('/reactions/')) {
              processUser(name, a.href, 'Reaction');
            }
          });
        } else {
          // If no dialog open, scan post links
          const links = document.querySelectorAll('a[href*="/user/"], a[role="link"][tabindex="0"]');
          links.forEach(a => {
            const name = a.textContent.trim();
            if (name && a.href && a.href.includes('facebook.com')) {
              processUser(name, a.href, 'Tương tác');
            }
          });
        }
      } else if (this.scanType === 'comments') {
        // Look for comment containers
        const commentArticles = document.querySelectorAll('div[role="article"]');
        commentArticles.forEach(article => {
          const authorLink = article.querySelector('a[role="link"], strong a');
          const commentTextEl = article.querySelector('div[dir="auto"], span[dir="auto"]');
          const commentText = commentTextEl ? commentTextEl.innerText.trim() : '';

          if (authorLink && authorLink.href) {
            const name = authorLink.textContent.trim();
            processUser(name, authorLink.href, commentText);
          }
        });
      } else if (this.scanType === 'members') {
        // Group members list
        const memberLinks = document.querySelectorAll('a[href*="/user/"], div[data-visualcompletion] a[role="link"]');
        memberLinks.forEach(a => {
          const name = a.textContent.trim();
          if (name && a.href) {
            processUser(name, a.href, 'Member');
          }
        });
      }

      // Scroll a bit to trigger more data load
      window.scrollBy({ top: 350, behavior: 'smooth' });
      await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    }

    statStatus.textContent = `Hoàn thành (${this.scannedData.length} kết quả)`;
    btnStart.style.display = 'inline-flex';
    btnStop.style.display = 'none';
    this.isScanning = false;
  }
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'OPEN_SCAN_UID_MODAL') {
    window.ScanUidModal.open();
    sendResponse({ success: true });
    return true;
  }
});
