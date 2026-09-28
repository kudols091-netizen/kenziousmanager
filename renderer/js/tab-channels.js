// Tab 2: Channel Manager Controller
let accountsList = [];

document.addEventListener('DOMContentLoaded', () => {
  initChannelsTab();
  initAddAccountModal();
  loadAccounts();
});

function initChannelsTab() {
  const searchInput = document.getElementById('searchChannelInput');
  const platformFilter = document.getElementById('filterChannelPlatform');
  const btnCheckAll = document.getElementById('btnCheckAllChannels');

  searchInput.addEventListener('input', () => filterAccounts());
  platformFilter.addEventListener('change', () => filterAccounts());

  btnCheckAll.addEventListener('click', async () => {
    btnCheckAll.disabled = true;
    btnCheckAll.innerText = 'Đang kiểm tra...';
    for (const acc of accountsList) {
      await window.api.checkAccountStatus(acc.id);
    }
    await loadAccounts();
    btnCheckAll.disabled = false;
    btnCheckAll.innerText = 'Check hàng loạt';
    alert('Đã kiểm tra xong trạng thái tất cả tài khoản!');
  });
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

function renderAccountsTable() {
  const tableBody = document.getElementById('accountsTableBody');
  const emptyNotice = document.getElementById('emptyAccountsNotice');

  if (accountsList.length === 0) {
    tableBody.innerHTML = '';
    tableBody.appendChild(emptyNotice);
    emptyNotice.style.display = 'block';
    return;
  }

  emptyNotice.style.display = 'none';
  tableBody.innerHTML = '';

  accountsList.forEach(acc => {
    const row = document.createElement('div');
    row.style = 'display: grid; grid-template-columns: 40px 1.5fr 1fr 1fr 1.2fr 1fr 140px; padding: 12px 16px; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.04); font-size: 13px;';
    
    const timeStr = acc.lastCheck ? new Date(acc.lastCheck).toLocaleDateString('vi-VN') : 'Mới tạo';
    const isLive = acc.status === 'connected';

    row.innerHTML = `
      <div><input type="checkbox" class="chk-account-item" data-id="${acc.id}"></div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(236,72,153,0.2); display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--brand-magenta);">
          ${acc.displayName ? acc.displayName.charAt(0).toUpperCase() : 'A'}
        </div>
        <div style="display: flex; flex-direction: column;">
          <span style="font-weight: 600; color: var(--text-main);">${acc.displayName || acc.username}</span>
          <span style="font-size: 11px; color: var(--text-sub);">${acc.id}</span>
        </div>
      </div>
      <div>
        <span style="text-transform: capitalize; font-weight: 500; color: var(--brand-cyan);">${acc.platform}</span>
      </div>
      <div>
        <span class="badge ${isLive ? 'badge-success' : 'badge-danger'}">
          ${isLive ? '● Live' : '● Die / Expired'}
        </span>
      </div>
      <div style="font-size: 11.5px; color: var(--text-muted); font-family: monospace;">
        ${acc.proxy || 'Trực tiếp (Direct)'}
      </div>
      <div style="font-size: 12px; color: var(--text-sub);">
        ${timeStr}
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="btn btn-danger btn-sm" onclick="deleteAccountItem('${acc.id}')" title="Xóa tài khoản">
          Xóa
        </button>
      </div>
    `;

    tableBody.appendChild(row);
  });
}

window.deleteAccountItem = async (id) => {
  if (confirm('Bạn có chắc chắn muốn xóa tài khoản này?')) {
    accountsList = await window.api.deleteAccount(id);
    renderAccountsTable();
  }
};

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
  let activeMethod = 'cookie'; // 'cookie' | 'browser'

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
          alert('Đăng nhập thành công tài khoản: ' + (newAcc.displayName || newAcc.name) + '!');
        } catch (err) {
          if (statusFeedback) statusFeedback.innerText = 'Lỗi: ' + err.message;
        } finally {
          btnSubmit.disabled = false;
        }
      }
    });
  }
}
