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

  if (searchInput) searchInput.addEventListener('input', () => filterAccounts());
  if (platformFilter) platformFilter.addEventListener('change', () => filterAccounts());

  if (btnCheckAll) {
    btnCheckAll.addEventListener('click', async () => {
      btnCheckAll.disabled = true;
      btnCheckAll.innerHTML = `
        <svg width="15" height="15" class="spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg> Đang kiểm tra...`;
      for (const acc of accountsList) {
        await window.api.checkAccountStatus(acc.id);
      }
      await loadAccounts();
      btnCheckAll.disabled = false;
      btnCheckAll.innerHTML = `
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg> Check hàng loạt`;
      alert('Đã kiểm tra xong trạng thái tất cả tài khoản!');
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
      <div><input type="checkbox" class="chk-account-item" data-id="${acc.id}"></div>
      
      <!-- TÀI KHOẢN -->
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
        <div style="position: relative; width: 34px; height: 34px; flex-shrink: 0;">
          ${acc.avatar ? `
            <img src="${acc.avatar}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.15);" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div style="display: none; width: 34px; height: 34px; border-radius: 50%; background: rgba(236,72,153,0.2); align-items: center; justify-content: center; font-weight: 700; color: var(--brand-magenta);">
              ${initial}
            </div>
          ` : `
            <div style="width: 34px; height: 34px; border-radius: 50%; background: rgba(236,72,153,0.2); display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--brand-magenta);">
              ${initial}
            </div>
          `}
        </div>
        <div style="display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
          <span style="font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${acc.displayName || acc.username}">
            ${acc.displayName || acc.username}
          </span>
          <span style="font-size: 11px; color: var(--text-sub); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${acc.token || subtitle}">
            ${subtitle}
          </span>
        </div>
      </div>

      <!-- NỀN TẢNG -->
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 500; font-size: 12.5px; text-transform: capitalize; color: var(--brand-cyan);">
          ${getPlatformIcon(acc.platform)}
          ${acc.platform}
        </span>
      </div>

      <!-- TRẠNG THÁI -->
      <div>
        <span class="badge ${isLive ? 'badge-success' : 'badge-danger'}" style="font-size: 11px; padding: 3px 8px;">
          ${isLive ? '● Đã kết nối' : '● Mất kết nối'}
        </span>
      </div>

      <!-- PROXY -->
      <div style="font-size: 11.5px; color: var(--text-muted); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${acc.proxy || 'ip local'}">
        ${acc.proxy || 'ip local'}
      </div>

      <!-- CHECK GẦN NHẤT -->
      <div style="font-size: 11.5px; color: var(--text-sub); white-space: nowrap;">
        ${timeStr}
      </div>

      <!-- THAO TÁC (4 NÚT ZOO-REUP PARITY) -->
      <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
        <!-- Nút Cài đặt -->
        <button class="btn-action-sm" onclick="openAccountSettings('${acc.id}')" title="Cài đặt & Đăng nhập lại">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Cài đặt
        </button>

        <!-- Nút Check lại -->
        <button class="btn-action-sm btn-icon-only" id="btnCheckAcc_${acc.id}" onclick="refreshAccountStatus('${acc.id}')" title="Check lại trạng thái & token">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>

        <!-- Nút Mở Profile -->
        <button class="btn-action-sm" onclick="openAccountBrowser('${acc.id}')" title="Mở trình duyệt Profile">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          Mở
        </button>

        <!-- Nút Xóa -->
        <button class="btn-action-sm btn-icon-only btn-danger-action" onclick="deleteAccountItem('${acc.id}')" title="Xóa tài khoản">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    tableBody.appendChild(row);
  });
}

function getPlatformIcon(platform) {
  if (platform === 'facebook') {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;
  }
  if (platform === 'tiktok') {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="#19c8ff"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.86 4.43V12.9a8.16 8.16 0 0 0 5.73 2.27v-3.44a4.85 4.85 0 0 1-3.77-1.35z"/></svg>`;
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
  if (btn) btn.classList.add('spin');
  try {
    await window.api.checkAccountStatus(id);
    await loadAccounts();
  } catch (err) {
    alert('Lỗi kiểm tra: ' + err.message);
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
  if (badge) badge.innerHTML = `${getPlatformIcon(acc.platform)} ${acc.platform}`;
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
      btnReLogin.disabled = true;
      btnReLogin.innerHTML = 'Đang mở trình duyệt...';
      try {
        const proxyVal = inputProxy ? inputProxy.value.trim() : (currentEditingAccount.proxy || '');
        await window.api.interactiveLogin(currentEditingAccount.platform, proxyVal, {
          existingAccountId: currentEditingAccount.id,
          existingProfileDir: currentEditingAccount.profileDir,
          cleanDevice: chkClean ? chkClean.checked : true
        });
        await loadAccounts();
        alert('Đăng nhập lại thành công!');
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

  if (btnTabCookie) {
    btnTabCookie.addEventListener('click', () => {
      activeMethod = 'cookie';
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

  if (btnTabBrowser) {
    btnTabBrowser.addEventListener('click', () => {
      activeMethod = 'browser';
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

  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      const proxyEl = document.getElementById('accountModalProxy');
      const proxy = proxyEl ? proxyEl.value.trim() : '';

      if (activeMethod === 'cookie') {
        const cookieInput = document.getElementById('accountModalCookieInput');
        const cookieData = cookieInput ? cookieInput.value.trim() : '';
        if (!cookieData) {
          alert('Vui lòng dán Cookie hợp lệ!');
          return;
        }
        try {
          await window.api.importCookies(selectedPlatform, cookieData, proxy);
          closeModal();
          await loadAccounts();
          const platName = platformMeta[selectedPlatform] ? platformMeta[selectedPlatform].name : selectedPlatform;
          alert('Đã kết nối tài khoản ' + platName + ' thành công!');
        } catch (err) {
          alert('Lỗi kết nối: ' + err.message);
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
