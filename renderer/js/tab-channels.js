// Tab 2: Channel Manager Controller
let accountsList = [];
let currentEditingAccount = null;

document.addEventListener('DOMContentLoaded', () => {
  initChannelsTab();
  initAddAccountModal();
  initAccountSettingsModal();
  loadAccounts();
});

function initChannelsTab() {
  const searchInput = document.getElementById('searchChannelInput');
  const platformFilter = document.getElementById('filterChannelPlatform');
  const btnCheckAll = document.getElementById('btnCheckAllChannels');
  const chkSelectAll = document.getElementById('chkSelectAllAccounts');

  if (chkSelectAll) {
    chkSelectAll.addEventListener('change', () => {
      const isChecked = chkSelectAll.checked;
      document.querySelectorAll('.chk-account-item').forEach(c => {
        c.checked = isChecked;
      });
    });
  }

  if (searchInput) searchInput.addEventListener('input', () => filterAccounts());
  if (platformFilter) platformFilter.addEventListener('change', () => filterAccounts());

  if (btnCheckAll) {
    btnCheckAll.addEventListener('click', async () => {
      if (accountsList.length === 0) {
        alert('Chưa có tài khoản nào để kiểm tra!');
        return;
      }
      btnCheckAll.disabled = true;
      btnCheckAll.innerHTML = `
        <svg width="15" height="15" class="spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg> Đang kiểm tra...`;

      for (const acc of accountsList) {
        const badge = document.getElementById(`statusBadge_${acc.id}`);
        if (badge) {
          badge.className = 'badge';
          badge.style = 'font-size: 11px; padding: 3px 8px; background: rgba(234, 179, 8, 0.25); color: #eab308; display: inline-flex; align-items: center; gap: 4px;';
          badge.innerHTML = `<svg width="11" height="11" class="spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Check...`;
        }
        try {
          await window.api.checkAccountStatus(acc.id);
        } catch (e) {
          console.warn('Check error for', acc.id, e);
        }
      }
      await loadAccounts();
      btnCheckAll.disabled = false;
      btnCheckAll.innerHTML = `
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg> Check hàng loạt`;
      alert('Đã hoàn tất kiểm tra trạng thái toàn bộ tài khoản!');
    });
  }
}

async function loadAccounts() {
  if (!window.api) return;
  try {
    accountsList = await window.api.getAccounts();
    renderAccountsTable();
  } catch (e) {
    console.error('Error loading accounts:', e);
  }
}

function maskToken(token) {
  if (!token || typeof token !== 'string') return '';
  if (token.startsWith('EAAB') && token.length > 16) {
    return token.slice(0, 8) + '...' + token.slice(-4);
  }
  return token.slice(0, 10) + '...';
}

function renderAccountsTable() {
  const tableBody = document.getElementById('accountsTableBody');
  const emptyNotice = document.getElementById('emptyAccountsNotice');
  if (!tableBody) return;

  if (accountsList.length === 0) {
    tableBody.innerHTML = '';
    if (emptyNotice) {
      tableBody.appendChild(emptyNotice);
      emptyNotice.style.display = 'block';
    }
    return;
  }

  if (emptyNotice) emptyNotice.style.display = 'none';
  tableBody.innerHTML = '';

  accountsList.forEach(acc => {
    const row = document.createElement('div');
    row.style = 'display: grid; grid-template-columns: 40px 1.8fr 110px 120px 130px 170px 240px; padding: 10px 16px; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.04); font-size: 13px; transition: background 0.15s;';
    row.onmouseenter = () => { row.style.background = 'rgba(255, 255, 255, 0.02)'; };
    row.onmouseleave = () => { row.style.background = 'transparent'; };

    const timeStr = acc.lastCheck ? new Date(acc.lastCheck).toLocaleString('vi-VN') : 'Mới tạo';
    const isLive = acc.status === 'connected';

    // Subtitle priority: token EAABs masked (e.g. EAABsbCS...2DZD) > sessionHint > UID > id
    const subtitle = acc.sessionHint || (acc.token ? maskToken(acc.token) : (acc.uid ? `UID: ${acc.uid}` : acc.id.slice(0, 10)));
    const initial = (acc.displayName || acc.username || 'A').charAt(0).toUpperCase();

    row.innerHTML = `
      <div><input type="checkbox" class="chk-account-item" data-id="${escHtml(acc.id)}"></div>
      
      <!-- TÀI KHOẢN -->
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
        <div style="position: relative; width: 34px; height: 34px; flex-shrink: 0;">
          ${acc.avatar ? `
            <img src="${KZ.safeUrl(acc.avatar)}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.15);" data-img-fallback="hide-show-next">
            <div style="display: none; width: 34px; height: 34px; border-radius: 50%; background: rgba(236,72,153,0.2); align-items: center; justify-content: center; font-weight: 700; color: var(--brand-magenta);">
              ${escHtml(initial)}
            </div>
          ` : `
            <div style="width: 34px; height: 34px; border-radius: 50%; background: rgba(236,72,153,0.2); display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--brand-magenta);">
              ${escHtml(initial)}
            </div>
          `}
        </div>
        <div style="display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
          <span style="font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(acc.displayName || acc.username)}">
            ${escHtml(acc.displayName || acc.username)}
          </span>
          <span style="font-size: 11px; color: var(--text-sub); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(subtitle)}">
            ${escHtml(subtitle)}
          </span>
        </div>
      </div>

      <!-- NỀN TẢNG & ĐIỂM ĐĂNG -->
      <div style="display: flex; flex-direction: column; gap: 3px;">
        <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 500; font-size: 12.5px; text-transform: capitalize; color: var(--brand-cyan);">
          ${getPlatformIcon(acc.platform)}
          ${escHtml(acc.platform)}
        </span>
        ${(() => {
          if (acc.platform === 'facebook' && acc.destinations) {
            return `<span style="font-size: 10.5px; color: var(--brand-magenta); font-weight: 600;">${acc.destinations.filter(d => d.selected).length}/${acc.destinations.length} điểm đăng</span>`;
          }
          if (acc.platform === 'tiktok') return `<span style="font-size: 10.5px; color: #19c8ff; font-weight: 500;">1 kênh Studio</span>`;
          if (acc.platform === 'youtube') return `<span style="font-size: 10.5px; color: #ff4e72; font-weight: 500;">1 Gmail (Shorts & Long)</span>`;
          if (acc.platform === 'instagram') return `<span style="font-size: 10.5px; color: #e1306c; font-weight: 500;">1 kênh Reels</span>`;
          if (acc.platform === 'threads') return `<span style="font-size: 10.5px; color: #ffffff; font-weight: 500;">1 kênh Video Post</span>`;
          if (acc.platform === 'zalo') return `<span style="font-size: 10.5px; color: #0068ff; font-weight: 500;">1 kênh Zalo Video</span>`;
          return '';
        })()}
      </div>

      <!-- TRẠNG THÁI -->
      <div>
        <span id="statusBadge_${acc.id}" class="badge ${isLive ? 'badge-success' : 'badge-danger'}" style="font-size: 11px; padding: 3px 8px;">
          ${isLive ? '● Đã kết nối' : '● Mất kết nối'}
        </span>
      </div>

      <!-- PROXY -->
      <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0;" title="${escHtml(acc.proxy || 'IP Trực tiếp')}">
        <span style="font-size: 11px; color: var(--text-muted); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escHtml(acc.proxy || 'ip local')}
        </span>
        ${acc.proxy ? `
          <div style="display: flex; align-items: center; gap: 4px;">
            <button type="button" class="btn-check-single-proxy" data-id="${acc.id}" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; padding: 1px 6px; font-size: 10px; color: #a1a1aa; cursor: pointer;">
              Check
            </button>
            <span id="proxyBadge_${acc.id}">
              ${acc.proxyHealth ? (acc.proxyHealth.ok ? '<span style="font-size: 10px; color: #10b981; font-weight: 600;" title="' + escHtml(acc.proxyHealth.message) + '">✓ OK</span>' : '<span style="font-size: 10px; color: #ef4444; font-weight: 600;" title="' + escHtml(acc.proxyHealth.message) + '">✗ Dead</span>') : ''}
            </span>
          </div>
        ` : ''}
      </div>

      <!-- CHECK GẦN NHẤT -->
      <div style="font-size: 11.5px; color: var(--text-sub); white-space: nowrap;">
        ${timeStr}
      </div>

      <!-- THAO TÁC (4 NÚT ZOO-REUP PARITY) -->
      <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
        <!-- Nút Cài đặt -->
        <button class="btn-action-sm" data-action="openAccountSettings" data-id="${escHtml(acc.id)}" title="Cài đặt & Đăng nhập lại">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Cài đặt
        </button>

        <!-- Nút Check lại (Tải lại tên & avatar ngầm) -->
        <button class="btn-action-sm btn-icon-only" id="btnCheckAcc_${acc.id}" data-action="refreshAccountStatus" data-id="${escHtml(acc.id)}" title="Tải lại tên & avatar (reconnect)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>

        <!-- Nút Mở Profile -->
        <button class="btn-action-sm" data-action="openAccountBrowser" data-id="${escHtml(acc.id)}" title="Mở trình duyệt Profile">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          Mở
        </button>

        <!-- Nút Xóa -->
        <button class="btn-action-sm btn-icon-only btn-danger-action" data-action="deleteAccountItem" data-id="${escHtml(acc.id)}" title="Xóa tài khoản">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    tableBody.appendChild(row);
  });
  attachProxyCheckEvents();
}

function getPlatformIcon(platform) {
  const p = (platform || '').toLowerCase();
  if (p === 'facebook') {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;
  }
  if (p === 'tiktok') {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="#19c8ff"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.86 4.43V12.9a8.16 8.16 0 0 0 5.73 2.27v-3.44a4.85 4.85 0 0 1-3.77-1.35z"/></svg>`;
  }
  if (p === 'youtube') {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="#ff4e72"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
  }
  if (p === 'instagram') {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="#e1306c"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`;
  }
  if (p === 'threads') {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff"><path d="M12.186 24c-3.568 0-6.42-.99-8.47-2.94C1.67 19.11.666 16.29.686 12.65c.02-3.67 1.052-6.52 3.072-8.48C5.818 2.18 8.73 1.18 12.44 1.18c3.78 0 6.72 1.03 8.74 3.06 2 2.01 2.98 4.88 2.92 8.52-.06 4.19-1.23 7.42-3.5 9.61-2.13 2.05-5.06 3.1-8.7 3.12l-.08.01zm.09-2.02c3.21-.02 5.65-.9 7.24-2.63 1.71-1.85 2.58-4.5 2.62-7.88.05-3.08-.75-5.46-2.38-7.07-1.63-1.62-4.03-2.44-7.14-2.44-3.14 0-5.56.84-7.2 2.49-1.66 1.67-2.5 4.09-2.52 7.18-.02 3.12.8 5.56 2.45 7.24 1.68 1.72 4.04 2.59 7.02 2.59l-.09-.08z"/></svg>`;
  }
  if (p === 'zalo') {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="#0068ff"><circle cx="12" cy="12" r="10" fill="#0068ff"/><text x="12" y="16" font-size="11" font-weight="900" text-anchor="middle" fill="#ffffff" font-family="sans-serif">Z</text></svg>`;
  }
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>`;
}
// Global action handlers
window.deleteAccountItem = async (id) => {
  if (confirm('Bạn có chắc chắn muốn xóa tài khoản này?')) {
    accountsList = await window.api.deleteAccount(id);
    renderAccountsTable();
  }
};

window.refreshAccountStatus = async (id) => {
  const btn = document.getElementById(`btnCheckAcc_${id}`);
  const badge = document.getElementById(`statusBadge_${id}`);
  if (btn) btn.classList.add('spin');
  if (badge) {
    badge.className = 'badge';
    badge.style = 'font-size: 11px; padding: 3px 8px; background: rgba(234, 179, 8, 0.25); color: #eab308; display: inline-flex; align-items: center; gap: 4px;';
    badge.innerHTML = `<svg width="11" height="11" class="spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Đang check...`;
  }
  try {
    const isLive = await window.api.checkAccountStatus(id);
    await loadAccounts();
    const target = accountsList.find(a => a.id === id);
    const tokenShow = target?.sessionHint || (target?.token ? maskToken(target.token) : 'Hợp lệ');
    if (isLive) {
      alert(`✅ Kiểm tra Live ẩn thành công!\n\n• Tài khoản: ${target?.displayName || id}\n• Trạng thái: ĐÃ KẾT NỐI (Live)\n• Token EAAB: ${tokenShow}\n• Cập nhật lúc: ${new Date().toLocaleTimeString('vi-VN')}`);
    } else {
      alert(`⚠️ Cảnh báo: Tài khoản [${target?.displayName || id}] có thể đã hết hạn phiên hoặc checkpoint!`);
    }
  } catch (err) {
    alert('❌ Lỗi kiểm tra: ' + err.message);
  } finally {
    if (btn) btn.classList.remove('spin');
  }
};

window.openAccountBrowser = async (id) => {
  try {
    await window.api.openBrowser(id);
  } catch (err) {
    alert('Không thể mở trình duyệt: ' + err.message);
  }
};

// Load and render Destinations (Profile + Pages) for the selected account
async function loadAccountDestinations(accountId) {
  const container = document.getElementById('settingDestinationsList');
  const countBadge = document.getElementById('txtDestinationsCount');
  const sec = document.getElementById('settingDestinationsSection');
  if (!container) return;

  const targetAcc = accountsList.find(a => a.id === accountId);
  if (sec) {
    sec.style.display = (targetAcc && targetAcc.platform === 'facebook') ? 'flex' : 'none';
  }
  if (!targetAcc || targetAcc.platform !== 'facebook') return;

  container.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 12px;"><svg width="14" height="14" class="spin" style="margin-right: 5px; vertical-align: middle;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Đang tải danh sách Fanpage...</div>';

  try {
    let list = await window.api.getDestinations(accountId);
    if ((!list || list.length === 0) && (targetAcc.hasCookies || targetAcc.hasToken)) {
      list = await window.api.refreshDestinations(accountId);
    }

    if (countBadge) {
      const activeCount = (list || []).filter(d => d.selected).length;
      countBadge.innerText = `${activeCount}/${(list || []).length} đang chọn`;
    }

    if (!list || list.length === 0) {
      container.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 12px;">Chưa tìm thấy Fanpage hoặc Profile nào. Bấm <b>"Làm mới Fanpage"</b> để quét tự động.</div>';
      return;
    }

    container.innerHTML = '';
    list.forEach(dest => {
      const card = document.createElement('div');
      card.style = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; font-size: 12.5px; transition: background 0.15s;';
      card.onmouseenter = () => { card.style.background = 'rgba(255, 255, 255, 0.06)'; };
      card.onmouseleave = () => { card.style.background = 'rgba(255, 255, 255, 0.03)'; };

      const isProfile = dest.type === 'profile';
      const badgeColor = isProfile ? 'var(--brand-cyan)' : 'var(--brand-magenta)';
      const badgeBg = isProfile ? 'rgba(6, 182, 212, 0.15)' : 'rgba(236, 72, 153, 0.15)';
      const typeLabel = isProfile ? 'Profile' : 'Fanpage';

      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
          <input type="checkbox" class="chk-destination-item" data-id="${escHtml(dest.id)}" ${dest.selected ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--brand-magenta); cursor: pointer; flex-shrink: 0;">
          <img src="${KZ.safeUrl(dest.avatar_url)}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;" data-img-fallback="src" data-fallback-src="data:image/svg+xml;utf8,&lt;svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'&gt;&lt;circle cx='14' cy='14' r='14' fill='%236366f1'/&gt;&lt;/svg&gt;">
          <div style="display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
            <span style="font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(dest.name)}">
              ${escHtml(dest.name)}
            </span>
            <span style="font-size: 10.5px; color: var(--text-sub); font-family: monospace;">
              ID: ${escHtml(dest.target_id || dest.id)}
            </span>
          </div>
        </div>
        <span style="font-size: 10.5px; padding: 2px 7px; border-radius: 4px; font-weight: 600; background: ${badgeBg}; color: ${badgeColor}; flex-shrink: 0;">
          ${typeLabel}
        </span>
      `;

      const chk = card.querySelector('.chk-destination-item');
      if (chk) {
        chk.addEventListener('change', async (ev) => {
          const isChecked = ev.target.checked;
          try {
            await window.api.toggleDestination(accountId, dest.id, isChecked);
            dest.selected = isChecked;
            const updatedList = await window.api.getDestinations(accountId);
            const activeNow = (updatedList || []).filter(d => d.selected).length;
            if (countBadge) countBadge.innerText = `${activeNow}/${(updatedList || []).length} đang chọn`;
          } catch (err) {
            console.error('Lỗi cập nhật điểm đến:', err);
          }
        });
      }

      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<div style="font-size: 12px; color: #ef4444; padding: 12px;">Lỗi tải điểm đến: ${escHtml(err.message)}</div>`;
  }
}

['openAccountSettings', 'refreshAccountStatus', 'openAccountBrowser', 'deleteAccountItem'].forEach(name => {
  KZ.action(name, (el) => window[name](el.dataset.id));
});

window.openAccountSettings = (id) => {
  const acc = accountsList.find(a => a.id === id);
  if (!acc) return;
  currentEditingAccount = acc;

  const modal = document.getElementById('modalAccountSettings');
  const title = document.getElementById('settingAccModalTitle');
  const name = document.getElementById('settingAccName');
  const avatar = document.getElementById('settingAccAvatar');
  const badge = document.getElementById('settingAccPlatformBadge');
  const statusPill = document.getElementById('settingAccStatusPill');
  const lastCheck = document.getElementById('settingAccLastCheck');
  const chkClean = document.getElementById('chkSettingCleanDevice');
  const chkProxy = document.getElementById('chkProxyToggle');
  const txtProxyState = document.getElementById('txtProxyToggleState');
  const proxyOffNotice = document.getElementById('proxyOffNotice');
  const proxyDetails = document.getElementById('proxyConfigDetails');
  const inputProxy = document.getElementById('inputSettingProxy');

  if (title) title.innerText = acc.displayName || acc.username;
  if (name) name.innerText = acc.displayName || acc.username;
  if (avatar) avatar.src = acc.avatar || '';
  if (badge) badge.innerHTML = `${getPlatformIcon(acc.platform)} ${escHtml(acc.platform)}`;
  if (statusPill) {
    const isLive = acc.status === 'connected';
    statusPill.className = `badge ${isLive ? 'badge-success' : 'badge-danger'}`;
    statusPill.innerText = isLive ? 'Đã kết nối' : 'Mất kết nối';
  }
  if (lastCheck) {
    lastCheck.innerText = acc.lastCheck ? new Date(acc.lastCheck).toLocaleString('vi-VN') : '—';
  }

  if (chkClean) chkClean.checked = acc.fingerprintEnabled !== false;

  const hasProxy = Boolean(acc.proxy && acc.proxy.trim());
  if (chkProxy) chkProxy.checked = hasProxy;
  if (txtProxyState) txtProxyState.innerText = hasProxy ? 'On' : 'Off';
  if (proxyOffNotice) proxyOffNotice.style.display = hasProxy ? 'none' : 'block';
  if (proxyDetails) proxyDetails.style.display = hasProxy ? 'flex' : 'none';
  if (inputProxy) inputProxy.value = acc.proxy || '';

  loadAccountDestinations(acc.id);
  if (modal) modal.classList.add('active');
};

function initAccountSettingsModal() {
  const modal = document.getElementById('modalAccountSettings');
  const btnClose = document.getElementById('btnCloseAccountSettings');
  const btnCloseFooter = document.getElementById('btnCloseAccountSettingsFooter');

  const btnTabBrowser = document.getElementById('btnTabSettingBrowser');
  const btnTabCookie = document.getElementById('btnTabSettingCookie');
  const secBrowser = document.getElementById('secSettingBrowser');
  const secCookie = document.getElementById('secSettingCookie');

  const btnReLogin = document.getElementById('btnActionReLoginBrowser');
  const btnSaveCookie = document.getElementById('btnActionSaveCookie');
  const cookieInput = document.getElementById('settingCookieInput');
  const chkClean = document.getElementById('chkSettingCleanDevice');

  const chkProxy = document.getElementById('chkProxyToggle');
  const txtProxyState = document.getElementById('txtProxyToggleState');
  const proxyOffNotice = document.getElementById('proxyOffNotice');
  const proxyDetails = document.getElementById('proxyConfigDetails');
  const inputProxy = document.getElementById('inputSettingProxy');
  const btnSaveProxy = document.getElementById('btnCheckAndSaveProxy');
  const proxyFeedback = document.getElementById('proxyFeedbackMsg');

  const closeModal = () => {
    if (modal) modal.classList.remove('active');
    currentEditingAccount = null;
  };

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCloseFooter) btnCloseFooter.addEventListener('click', closeModal);

  // Tab switching
  if (btnTabBrowser) {
    btnTabBrowser.addEventListener('click', () => {
      btnTabBrowser.style.background = 'rgba(255,35,157,0.18)';
      btnTabBrowser.style.borderColor = 'var(--primary-accent)';
      btnTabBrowser.style.color = '#fff';
      if (btnTabCookie) {
        btnTabCookie.style.background = 'transparent';
        btnTabCookie.style.borderColor = 'var(--border-color)';
        btnTabCookie.style.color = 'var(--text-muted)';
      }
      if (secBrowser) secBrowser.style.display = 'flex';
      if (secCookie) secCookie.style.display = 'none';
    });
  }

  if (btnTabCookie) {
    btnTabCookie.addEventListener('click', () => {
      btnTabCookie.style.background = 'rgba(255,35,157,0.18)';
      btnTabCookie.style.borderColor = 'var(--primary-accent)';
      btnTabCookie.style.color = '#fff';
      if (btnTabBrowser) {
        btnTabBrowser.style.background = 'transparent';
        btnTabBrowser.style.borderColor = 'var(--border-color)';
        btnTabBrowser.style.color = 'var(--text-muted)';
      }
      if (secCookie) secCookie.style.display = 'flex';
      if (secBrowser) secBrowser.style.display = 'none';
    });
  }

  // Re-login browser button
  if (btnReLogin) {
    btnReLogin.addEventListener('click', async () => {
      if (!currentEditingAccount) return;

      const hasSession = currentEditingAccount.status === 'connected' || Boolean(currentEditingAccount.hasCookies);
      if (hasSession && !confirm('Tài khoản đang đăng nhập hoặc đã có cookie. Mở lại trang đăng nhập có thể làm mất phiên. Bạn vẫn muốn tiếp tục?')) {
        return;
      }

      btnReLogin.disabled = true;
      btnReLogin.innerHTML = 'Đang mở Facebook profile...';
      try {
        const proxyVal = inputProxy ? inputProxy.value.trim() : (currentEditingAccount.proxy || '');
        const updatedAcc = await window.api.interactiveLogin(currentEditingAccount.platform, proxyVal, {
          existingAccountId: currentEditingAccount.id,
          existingProfileDir: currentEditingAccount.profileDir,
          cleanDevice: chkClean ? chkClean.checked : true
        });
        await loadAccounts();
        alert(`✅ Đã đồng bộ lại phiên Facebook thành công!\n\n• Tài khoản: ${updatedAcc?.displayName || currentEditingAccount.displayName}\n• Token EAAB: ${updatedAcc?.sessionHint || 'Đã làm mới'}\n• Cookie: Đã cập nhật`);
        closeModal();
      } catch (err) {
        alert('Lỗi đăng nhập: ' + err.message);
      } finally {
        btnReLogin.disabled = false;
        btnReLogin.innerHTML = `
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg> Mở trình duyệt & đăng nhập`;
      }
    });
  }

  // Save Cookie button
  if (btnSaveCookie) {
    btnSaveCookie.addEventListener('click', async () => {
      if (!currentEditingAccount) return;
      const raw = cookieInput ? cookieInput.value.trim() : '';
      if (!raw) {
        alert('Vui lòng nhập cookie hợp lệ!');
        return;
      }
      try {
        const proxyVal = inputProxy ? inputProxy.value.trim() : (currentEditingAccount.proxy || '');
        await window.api.importCookies(
          currentEditingAccount.platform,
          raw,
          proxyVal,
          currentEditingAccount.displayName,
          { cleanDevice: chkClean ? chkClean.checked : true }
        );
        await loadAccounts();
        alert('Đã cập nhật cookie thành công!');
        closeModal();
      } catch (err) {
        alert('Lỗi nạp cookie: ' + err.message);
      }
    });
  }

  // Clean device toggle
  if (chkClean) {
    chkClean.addEventListener('change', async () => {
      if (!currentEditingAccount) return;
      currentEditingAccount.fingerprintEnabled = chkClean.checked;
      await window.api.updateAccountSettings(currentEditingAccount.id, {
        fingerprintEnabled: chkClean.checked
      });
    });
  }

  // Proxy toggle
  if (chkProxy) {
    chkProxy.addEventListener('change', async () => {
      const on = chkProxy.checked;
      if (txtProxyState) txtProxyState.innerText = on ? 'On' : 'Off';
      if (proxyOffNotice) proxyOffNotice.style.display = on ? 'none' : 'block';
      if (proxyDetails) proxyDetails.style.display = on ? 'flex' : 'none';

      if (!on && currentEditingAccount) {
        currentEditingAccount.proxy = '';
        if (inputProxy) inputProxy.value = '';
        await window.api.updateAccountSettings(currentEditingAccount.id, { proxy: '' });
        await loadAccounts();
      }
    });
  }

  // Save Proxy button
  if (btnSaveProxy) {
    btnSaveProxy.addEventListener('click', async () => {
      if (!currentEditingAccount) return;
      const val = inputProxy ? inputProxy.value.trim() : '';
      if (proxyFeedback) {
        proxyFeedback.style.color = '#38bdf8';
        proxyFeedback.innerText = 'Đang lưu cấu hình proxy...';
      }
      try {
        await window.api.updateAccountSettings(currentEditingAccount.id, { proxy: val });
        currentEditingAccount.proxy = val;
        await loadAccounts();
        if (proxyFeedback) {
          proxyFeedback.style.color = '#34d399';
          proxyFeedback.innerText = 'Đã lưu proxy thành công!';
        }
      } catch (err) {
        if (proxyFeedback) {
          proxyFeedback.style.color = '#ef4444';
          proxyFeedback.innerText = 'Lỗi: ' + err.message;
        }
      }
    });
  }

  // Refresh Destinations (Fanpages & Profile)
  const btnRefreshDest = document.getElementById('btnRefreshDestinations');
  if (btnRefreshDest) {
    btnRefreshDest.addEventListener('click', async () => {
      if (!currentEditingAccount) return;
      btnRefreshDest.disabled = true;
      btnRefreshDest.innerHTML = `
        <svg width="13" height="13" class="spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg> Đang quét...`;
      try {
        await window.api.refreshDestinations(currentEditingAccount.id);
        await loadAccountDestinations(currentEditingAccount.id);
      } catch (err) {
        alert('Lỗi quét Fanpage: ' + err.message);
      } finally {
        btnRefreshDest.disabled = false;
        btnRefreshDest.innerHTML = `
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg> Làm mới Fanpage`;
      }
    });
  }
}

function filterAccounts() {
  const q = document.getElementById('searchChannelInput').value.toLowerCase();
  const p = document.getElementById('filterChannelPlatform').value.toLowerCase();

  const rows = document.querySelectorAll('#accountsTableBody > div');
  accountsList.forEach((acc, idx) => {
    const row = rows[idx];
    if (!row) return;

    const matchName = (acc.displayName || acc.username || '').toLowerCase().includes(q);
    const matchPlatform = p === 'all' || acc.platform.toLowerCase() === p;

    if (matchName && matchPlatform) {
      row.style.display = 'grid';
    } else {
      row.style.display = 'none';
    }
  });
}

// Modal Thêm Tài Khoản (2-Step Platform Picker & Credentials)
function initAddAccountModal() {
  const modal = document.getElementById('modalAddAccount');
  const btnOpen = document.getElementById('btnOpenAddAccountModal');
  const btnClose = document.getElementById('btnCloseAccountModal');
  const btnCloseConfig = document.getElementById('btnCloseConfigModal');
  const btnCancel = document.getElementById('btnCancelAccountModal');
  const btnBack = document.getElementById('btnBackToPlatformStep');
  const btnSubmit = document.getElementById('btnSubmitAddAccount');

  const stepSelect = document.getElementById('stepSelectPlatform');
  const stepConfig = document.getElementById('stepConfigureAccount');

  const platformCards = document.querySelectorAll('.platform-card');
  const selectedLabel = document.getElementById('selectedPlatformLabel');
  const selectedSub = document.getElementById('selectedPlatformSub');
  const selectedIcon = document.getElementById('selectedPlatformIcon');
  const selectedTitle = document.getElementById('selectedPlatformTitle');

  const btnTabCookie = document.getElementById('btnTabImportCookie');
  const btnTabBrowser = document.getElementById('btnTabInteractiveLogin');
  const secCookie = document.getElementById('sectionImportCookie');
  const secBrowser = document.getElementById('sectionInteractiveLogin');
  const statusFeedback = document.getElementById('loginStatusFeedback');

  let selectedPlatform = 'facebook';
  let activeMethod = 'cookie';

  const platformMeta = {
    facebook: {
      name: 'Facebook',
      sub: 'Hỗ trợ Profile cá nhân, Fanpage, Group Admin',
      color: '#1877f2',
      cookieHint: 'c_user=...; xs=... hoặc định dạng JSON'
    },
    tiktok: {
      name: 'TikTok',
      sub: 'Đăng tải trực tiếp qua TikTok Studio API',
      color: '#19c8ff',
      cookieHint: 'sessionid=... hoặc JSON mảng cookie TikTok'
    },
    youtube: {
      name: 'YouTube',
      sub: 'Quản lý nhiều kênh trên 1 tài khoản Gmail (Shorts & Long video)',
      color: '#ff4e72',
      cookieHint: 'SID=...; HSID=...; SSID=...; LOGIN_INFO=...'
    },
    instagram: {
      name: 'Instagram',
      sub: 'Tự động đồng bộ và đăng Reels Instagram',
      color: '#e1306c',
      cookieHint: 'sessionid=...; ds_user_id=...'
    },
    threads: {
      name: 'Threads',
      sub: 'Đăng video ngắn kèm bài viết trên Threads',
      color: '#ffffff',
      cookieHint: 'sessionid=...; csrftoken=...'
    },
    pinterest: {
      name: 'Pinterest',
      sub: 'Ghim ảnh/video (Pin) lên các Board Pinterest',
      color: '#e60023',
      cookieHint: 'csrftoken=...; _pinterest_sess=...; _auth=1'
    },
    zalo: {
      name: 'Zalo Video',
      sub: 'Đăng video lên kênh Zalo Video Creator (video.zalo.me)',
      color: '#0068ff',
      cookieHint: 'zpw_sek=...; _zlang=...'
    }
  };

  const showStep1 = () => {
    if (stepSelect) stepSelect.style.display = 'block';
    if (stepConfig) stepConfig.style.display = 'none';
  };

  const showStep2 = (platformKey) => {
    selectedPlatform = platformKey;
    const meta = platformMeta[platformKey] || platformMeta.facebook;
    
    if (selectedTitle) selectedTitle.innerText = 'Thêm tài khoản ' + meta.name;
    if (selectedLabel) selectedLabel.innerText = meta.name;
    if (selectedSub) selectedSub.innerText = meta.sub;

    const card = document.querySelector('.platform-card[data-platform="' + platformKey + '"]');
    if (card && selectedIcon) {
      const iconWrap = card.querySelector('.platform-icon-wrap');
      if (iconWrap) {
        selectedIcon.innerHTML = iconWrap.innerHTML;
        selectedIcon.style.background = iconWrap.style.background;
      }
    }

    const cookieInput = document.getElementById('accountModalCookieInput');
    if (cookieInput) cookieInput.placeholder = meta.cookieHint;
    
    if (stepSelect) stepSelect.style.display = 'none';
    if (stepConfig) stepConfig.style.display = 'block';
  };

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      modal.classList.add('active');
      if (statusFeedback) statusFeedback.innerText = '';
      showStep1();
    });
  }

  const closeModal = () => modal.classList.remove('active');
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCloseConfig) btnCloseConfig.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);
  if (btnBack) btnBack.addEventListener('click', showStep1);

  platformCards.forEach(card => {
    card.addEventListener('click', () => {
      const plat = card.getAttribute('data-platform');
      showStep2(plat);
    });
  });

  const btnTabExt = document.getElementById('btnTabExtensionCookie');
  const secExt = document.getElementById('sectionExtensionCookie');
  const extStatus = document.getElementById('extCookieStatusFeedback');
  const btnOpenExtCookie = document.getElementById('btnOpenExtensionCookie');

  // Chuyển qua lại 3 cách thêm cookie (1 Nhập · 2 Trực quan · 3 Extension)
  function setMethod(m) {
    activeMethod = m;
    const on = ['rgba(255,35,157,0.18)', 'var(--primary-accent)', '#fff'];
    const off = ['transparent', 'var(--border-color)', 'var(--text-muted)'];
    [[btnTabCookie, 'cookie'], [btnTabBrowser, 'browser'], [btnTabExt, 'extension']].forEach(function (pair) {
      var b = pair[0]; if (!b) return;
      var s = (pair[1] === m) ? on : off;
      b.style.background = s[0]; b.style.borderColor = s[1]; b.style.color = s[2];
    });
    if (secCookie) secCookie.style.display = (m === 'cookie') ? 'flex' : 'none';
    if (secBrowser) secBrowser.style.display = (m === 'browser') ? 'flex' : 'none';
    if (secExt) secExt.style.display = (m === 'extension') ? 'flex' : 'none';
  }

  if (btnTabCookie) btnTabCookie.addEventListener('click', () => setMethod('cookie'));
  if (btnTabBrowser) btnTabBrowser.addEventListener('click', () => setMethod('browser'));
  if (btnTabExt) btnTabExt.addEventListener('click', () => setMethod('extension'));

  // Option ③: mở browser kèm extension GetCookie → tự bắt cookie qua CDP → điền vào ô "Nhập Cookie" để duyệt.
  if (btnOpenExtCookie) {
    btnOpenExtCookie.addEventListener('click', async () => {
      if (!window.api || !window.api.grabCookieViaExtension) { alert('Chức năng chưa sẵn sàng — mở lại app.'); return; }
      const proxyEl = document.getElementById('accountModalProxy');
      const proxy = proxyEl ? proxyEl.value.trim() : '';
      btnOpenExtCookie.disabled = true;
      if (extStatus) { extStatus.style.color = 'var(--brand-cyan)'; extStatus.innerText = 'Đang mở trình duyệt + Extension — hãy đăng nhập nick trên cửa sổ mới...'; }
      try {
        const res = await window.api.grabCookieViaExtension(selectedPlatform, proxy);
        const cookieStr = (res && res.cookie) ? res.cookie : '';
        if (!cookieStr) throw new Error('Chưa lấy được cookie (có thể chưa đăng nhập xong).');
        const cookieInput = document.getElementById('accountModalCookieInput');
        if (cookieInput) cookieInput.value = cookieStr;
        setMethod('cookie');
        alert('Đã lấy cookie' + (res.displayName ? ' (' + res.displayName + ')' : '') + ' và điền vào ô. Kiểm tra rồi bấm "Xác nhận kết nối".');
      } catch (err) {
        if (extStatus) { extStatus.style.color = 'var(--danger-color)'; extStatus.innerText = 'Lỗi: ' + (err && err.message ? err.message : err); }
      } finally {
        btnOpenExtCookie.disabled = false;
      }
    });
  }


  // Live status log for modal
  if (window.api && window.api.onLog) {
    window.api.onLog((text) => {
      const fb = document.getElementById('loginStatusFeedback');
      if (fb && modal && modal.classList.contains('active')) {
        fb.innerText = text;
      }
    });
  }

  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      const proxyEl = document.getElementById('accountModalProxy');
      const proxy = proxyEl ? proxyEl.value.trim() : '';

      if (activeMethod === 'cookie' || activeMethod === 'extension') {
        const cookieInput = document.getElementById('accountModalCookieInput');
        const cookieData = cookieInput ? cookieInput.value.trim() : '';
        if (!cookieData) {
          alert(activeMethod === 'extension'
            ? 'Chưa có cookie — bấm "🧩 Mở trình duyệt + Extension để lấy cookie" trước, hoặc dán tay ở tab "1. Nhập Cookie".'
            : 'Vui lòng dán Cookie hợp lệ!');
          return;
        }
        btnSubmit.disabled = true;
        try {
          await window.api.importCookies(selectedPlatform, cookieData, proxy);
          closeModal();
          await loadAccounts();
          const platName = platformMeta[selectedPlatform] ? platformMeta[selectedPlatform].name : selectedPlatform;
          alert('Đã kết nối tài khoản ' + platName + ' thành công!');
        } catch (err) {
          alert('Lỗi kết nối: ' + err.message);
        } finally {
          btnSubmit.disabled = false;
        }
      } else {
        try {
          if (statusFeedback) statusFeedback.innerText = 'Đang khởi động trình duyệt độc lập, vui lòng thao tác trên cửa sổ mới...';
          btnSubmit.disabled = true;

          const newAcc = await window.api.interactiveLogin(selectedPlatform, proxy);
          closeModal();
          await loadAccounts();
          alert('Đăng nhập thành công tài khoản: ' + (newAcc.displayName || newAcc.username) + '!');
        } catch (err) {
          if (statusFeedback) statusFeedback.innerText = 'Lỗi: ' + err.message;
        } finally {
          btnSubmit.disabled = false;
        }
      }
    });
  }
}


function attachProxyCheckEvents() {
  document.querySelectorAll('.btn-check-single-proxy').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const accId = btn.getAttribute('data-id');
      const acc = accountsList.find(a => a.id === accId);
      if (!acc || !acc.proxy) return;
      const badge = document.getElementById(`proxyBadge_${accId}`);
      if (badge) badge.innerHTML = '<span style="font-size: 10px; color: #eab308;">Checking...</span>';
      btn.disabled = true;
      try {
        const res = await window.api.checkProxy(acc.proxy, 25000);
        acc.proxyHealth = res;
        if (badge) {
          if (res.ok) {
            badge.innerHTML = `<span style="font-size: 10px; color: #10b981; font-weight: 600;" title="${escHtml(res.message)}">✓ OK</span>`;
          } else {
            badge.innerHTML = `<span style="font-size: 10px; color: #ef4444; font-weight: 600;" title="${escHtml(res.message)}">✗ Dead</span>`;
          }
        }
      } catch (err) {
        if (badge) badge.innerHTML = `<span style="font-size: 10px; color: #ef4444; font-weight: 600;">✗ Lỗi</span>`;
      } finally {
        btn.disabled = false;
      }
    };
  });
}
