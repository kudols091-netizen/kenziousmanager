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

// Modal Thêm Tài Khoản
function initAddAccountModal() {
  const modal = document.getElementById('modalAddAccount');
  const btnOpen = document.getElementById('btnOpenAddAccountModal');
  const btnClose = document.getElementById('btnCloseAccountModal');
  const btnCancel = document.getElementById('btnCancelAccountModal');
  const btnSubmit = document.getElementById('btnSubmitAddAccount');

  const btnTabCookie = document.getElementById('btnTabImportCookie');
  const btnTabBrowser = document.getElementById('btnTabInteractiveLogin');
  const secCookie = document.getElementById('sectionImportCookie');
  const secBrowser = document.getElementById('sectionInteractiveLogin');
  const statusFeedback = document.getElementById('loginStatusFeedback');

  let activeMethod = 'cookie'; // 'cookie' | 'browser'

  btnOpen.addEventListener('click', () => {
    modal.classList.add('active');
    statusFeedback.innerText = '';
  });

  const closeModal = () => modal.classList.remove('active');
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  btnTabCookie.addEventListener('click', () => {
    activeMethod = 'cookie';
    btnTabCookie.style.background = 'rgba(236,72,153,0.2)';
    btnTabCookie.style.borderColor = 'var(--brand-magenta)';
    btnTabBrowser.style.background = 'transparent';
    btnTabBrowser.style.borderColor = 'var(--border-color)';
    secCookie.style.display = 'flex';
    secBrowser.style.display = 'none';
  });

  btnTabBrowser.addEventListener('click', () => {
    activeMethod = 'browser';
    btnTabBrowser.style.background = 'rgba(236,72,153,0.2)';
    btnTabBrowser.style.borderColor = 'var(--brand-magenta)';
    btnTabCookie.style.background = 'transparent';
    btnTabCookie.style.borderColor = 'var(--border-color)';
    secBrowser.style.display = 'flex';
    secCookie.style.display = 'none';
  });

  btnSubmit.addEventListener('click', async () => {
    const platform = document.getElementById('accountModalPlatform').value;
    const proxy = document.getElementById('accountModalProxy').value;

    if (activeMethod === 'cookie') {
      const cookieData = document.getElementById('accountModalCookieInput').value;
      if (!cookieData.trim()) {
        alert('Vui lòng dán Cookie hợp lệ!');
        return;
      }
      try {
        await window.api.importCookies(platform, cookieData, proxy);
        closeModal();
        await loadAccounts();
        alert('Đã kết nối tài khoản qua Cookie thành công!');
      } catch (err) {
        alert(`Lỗi: ${err.message}`);
      }
    } else {
      // Interactive login via Puppeteer
      try {
        statusFeedback.innerText = 'Đang khởi động Chrome, vui lòng thao tác trên cửa sổ mới...';
        btnSubmit.disabled = true;

        const newAcc = await window.api.interactiveLogin(platform, proxy);
        closeModal();
        await loadAccounts();
        alert(`Đăng nhập thành công tài khoản: ${newAcc.displayName}!`);
      } catch (err) {
        statusFeedback.innerText = `Lỗi: ${err.message}`;
      } finally {
        btnSubmit.disabled = false;
      }
    }
  });
}
