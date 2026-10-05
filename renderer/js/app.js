// Global Application State & Tab Navigation
const state = {
  currentTab: 'tab-download',
  settings: {},
  presets: [],
  accounts: [],
  logs: []
};

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initLogConsole();
  await loadSettings();
  initEventListeners();
  await initLicenseGuard();
});

// Tab Switcher
function initTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('pageTitle');
  const pageDesc = document.getElementById('pageDesc');

  const titles = {
    'tab-download': { title: 'Download / Render', desc: 'Thêm link để bắt đầu tải & xử lý video ngắn đa nền tảng' },
    'tab-channels': { title: 'Quản lý kênh', desc: 'Tài khoản đã kết nối — login, avatar, trạng thái sống và proxy' },
    'tab-ai': { title: 'Chuyển ngữ & Lồng tiếng AI', desc: 'Dịch thuật kịch bản, Edge-TTS giọng Việt và tạo sub Karaoke ASS' },
    'tab-publish': { title: 'Lịch đăng & Xuất bản', desc: 'Phát hành video đa kênh tự động với giãn cách chống spam' },
    'tab-toolkit': { title: 'Kenzious Kit Tool', desc: 'Công cụ trích xuất Token EAAB, lọc UID và tiện ích mạng xã hội' },
    'tab-settings': { title: 'Cài đặt hệ thống', desc: 'Cấu hình đường dẫn FFmpeg, yt-dlp, Python và số luồng xử lý' }
  };

  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      if (!targetTab) return;

      navItems.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(targetTab);
      if (targetPane) targetPane.classList.add('active');

      if (titles[targetTab]) {
        pageTitle.innerText = titles[targetTab].title;
        pageDesc.innerText = titles[targetTab].desc;
      }
      state.currentTab = targetTab;

      if (targetTab === 'tab-publish') {
        if (typeof window.loadQueueEvents === 'function') {
          window.loadQueueEvents();
        } else if (typeof window.loadPublishQueue === 'function') {
          window.loadPublishQueue();
        }
      }
    });
  });
}

// Log Console
function initLogConsole() {
  const btnOpenLog = document.getElementById('btnOpenLog');
  const modalLog = document.getElementById('modalLogConsole');
  const btnCloseLog = document.getElementById('btnCloseLogModal');
  const btnCloseFooter = document.getElementById('btnCloseLogFooter');
  const btnClearLog = document.getElementById('btnClearLog');
  const logOutput = document.getElementById('logConsoleOutput');

  btnOpenLog.addEventListener('click', () => modalLog.classList.add('active'));
  btnCloseLog.addEventListener('click', () => modalLog.classList.remove('active'));
  btnCloseFooter.addEventListener('click', () => modalLog.classList.remove('active'));
  btnClearLog.addEventListener('click', () => {
    logOutput.innerText = '[Kenzious Studio v2] Log đã được làm sạch.';
  });

  if (window.api && window.api.onLog) {
    window.api.onLog((text) => {
      const time = new Date().toLocaleTimeString();
      logOutput.innerText += `\n[${time}] ${text}`;
      logOutput.scrollTop = logOutput.scrollHeight;
    });
  }
}

// Settings loader
async function loadSettings() {
  if (!window.api) return;
  try {
    state.settings = await window.api.getSettings();
    state.presets = await window.api.getPresets();
    
    // Bind output directory
    const inputOutputDir = document.getElementById('inputOutputDir');
    if (inputOutputDir) inputOutputDir.value = state.settings.outputDir || '';

    // Bind settings tab
    const sFfmpeg = document.getElementById('settingFfmpegPath');
    const sYtdlp = document.getElementById('settingYtdlpPath');
    const sPython = document.getElementById('settingPythonPath');
    const sConcurrency = document.getElementById('settingConcurrency');
    const sConcurrencyVal = document.getElementById('settingConcurrencyVal');
    const sApiKey = document.getElementById('inputAiApiKey');
    const sProvider = document.getElementById('selectAiProvider');

    if (sFfmpeg) sFfmpeg.value = state.settings.ffmpegPath || '';
    if (sYtdlp) sYtdlp.value = state.settings.ytdlpPath || '';
    if (sPython) sPython.value = state.settings.pythonPath || 'python';
    if (sConcurrency) {
      sConcurrency.value = state.settings.concurrency || 2;
      sConcurrencyVal.innerText = state.settings.concurrency || 2;
    }
    if (sApiKey) sApiKey.value = state.settings.apiKey || '';
    if (sProvider) sProvider.value = state.settings.aiProvider || 'gemini';
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

function initEventListeners() {
  // Quick Settings button in topbar
  const btnQuickSettings = document.getElementById('btnQuickSettings');
  if (btnQuickSettings) {
    btnQuickSettings.addEventListener('click', () => {
      const settingsNav = document.querySelector('[data-tab="tab-settings"]');
      if (settingsNav) settingsNav.click();
    });
  }

  // Concurrency slider
  const sConcurrency = document.getElementById('settingConcurrency');
  const sConcurrencyVal = document.getElementById('settingConcurrencyVal');
  if (sConcurrency && sConcurrencyVal) {
    sConcurrency.addEventListener('input', (e) => {
      sConcurrencyVal.innerText = e.target.value;
    });
  }

  // Save Settings
  const btnSaveAllSettings = document.getElementById('btnSaveAllSettings');
  if (btnSaveAllSettings) {
    btnSaveAllSettings.addEventListener('click', async () => {
      const pythonPath = document.getElementById('settingPythonPath').value;
      const concurrency = parseInt(document.getElementById('settingConcurrency').value, 10);
      const updated = await window.api.saveSettings({ pythonPath, concurrency });
      state.settings = updated;
      alert('Đã lưu cấu hình hệ thống thành công!');
    });
  }
}

// ------------------- License Guard & Activation Lock Screen -------------------
async function initLicenseGuard() {
  if (!window.api || !window.api.licenseGetStatus) return;

  const modalLicense = document.getElementById('modalLicenseLock');
  const hwidInput = document.getElementById('licDisplayHwid');
  const btnCopyHwid = document.getElementById('btnCopyHwid');
  const keyInput = document.getElementById('licInputKey');
  const btnSubmit = document.getElementById('btnSubmitLicense');
  const statusMsg = document.getElementById('licStatusMsg');
  const cancelWrap = document.getElementById('licCancelWrap');
  const btnCancel = document.getElementById('btnCancelLicenseModal');

  if (!modalLicense) return;

  let currentHwid = '';
  // Mở app khi chưa kích hoạt → main chặn IPC nên các tab khởi tạo với dữ liệu rỗng; kích hoạt xong phải nạp lại trang
  let startedLocked = false;
  try {
    currentHwid = await window.api.licenseGetHWID();
    if (hwidInput) hwidInput.value = currentHwid;
  } catch (_) {}

  async function checkLicenseStatus(initial = false) {
    try {
      const status = await window.api.licenseGetStatus();
      if (status && status.activated) {
        modalLicense.style.display = 'none';
        if (cancelWrap) cancelWrap.style.display = 'block';
        if (window.loadLicenseSettingsStudio) {
          window.loadLicenseSettingsStudio();
        }
        return true;
      } else {
        startedLocked = true;
        modalLicense.style.display = 'flex';
        modalLicense.style.opacity = '1';
        if (cancelWrap) cancelWrap.style.display = 'none';

        if (statusMsg) {
          statusMsg.style.display = 'block';
          if (status && status.message && status.message.includes('hết hạn')) {
            statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
            statusMsg.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            statusMsg.style.color = '#fca5a5';
            statusMsg.innerHTML = `⚠️ <strong>Hết hạn:</strong> ${escHtml(status.message)}<br>Vui lòng liên hệ Admin Boss Kudo để gia hạn bản quyền.`;
          } else {
            statusMsg.style.background = 'rgba(14, 165, 233, 0.1)';
            statusMsg.style.border = '1px solid rgba(14, 165, 233, 0.25)';
            statusMsg.style.color = '#7dd3fc';
            statusMsg.innerHTML = `💡 Hãy bấm <strong>Sao Chép</strong> mã máy HWID ở trên và gửi cho Admin Boss Kudo để nhận Key kích hoạt.`;
          }
        }
        return false;
      }
    } catch (err) {
      console.error('License check error:', err);
      modalLicense.style.display = 'flex';
      return false;
    }
  }

  // Bind Copy HWID
  if (btnCopyHwid) {
    btnCopyHwid.onclick = () => {
      const hwid = hwidInput ? hwidInput.value : currentHwid;
      if (hwid) {
        navigator.clipboard.writeText(hwid);
        const oldHtml = btnCopyHwid.innerHTML;
        btnCopyHwid.innerHTML = '✅ Đã Chép!';
        btnCopyHwid.style.color = '#10b981';
        btnCopyHwid.style.borderColor = 'rgba(16, 185, 129, 0.5)';
        setTimeout(() => {
          btnCopyHwid.innerHTML = oldHtml;
          btnCopyHwid.style.color = '#38bdf8';
          btnCopyHwid.style.borderColor = 'rgba(56, 189, 248, 0.4)';
        }, 2000);
      }
    };
  }

  // Bind Submit Key
  if (btnSubmit) {
    btnSubmit.onclick = async () => {
      const key = (keyInput ? keyInput.value : '').trim().toUpperCase();
      if (!key) {
        if (statusMsg) {
          statusMsg.style.display = 'block';
          statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
          statusMsg.style.border = '1px solid rgba(239, 68, 68, 0.4)';
          statusMsg.style.color = '#fca5a5';
          statusMsg.innerHTML = '⚠️ Vui lòng nhập hoặc dán Mã kích hoạt (Key) vào ô trên!';
        }
        if (keyInput) keyInput.focus();
        return;
      }

      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span>⏳ Đang kiểm tra mã bản quyền...</span>';

      try {
        const res = await window.api.licenseActivate(key);
        if (res && res.success) {
          if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.background = 'rgba(16, 185, 129, 0.15)';
            statusMsg.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            statusMsg.style.color = '#6ee7b7';
            statusMsg.innerHTML = `🎉 <strong>${escHtml(res.message || 'Kích hoạt bản quyền thành công!')}</strong><br>Đang mở khóa toàn bộ tính năng Studio...`;
          }

          btnSubmit.innerHTML = '<span>✅ Kích Hoạt Thành Công!</span>';
          btnSubmit.style.background = 'linear-gradient(135deg, #10b981, #059669)';

          if (window.loadLicenseSettingsStudio) {
            await window.loadLicenseSettingsStudio();
          }

          if (startedLocked) {
            setTimeout(() => location.reload(), 1200);
            return;
          }

          setTimeout(() => {
            modalLicense.style.transition = 'opacity 0.4s ease';
            modalLicense.style.opacity = '0';
            setTimeout(() => {
              modalLicense.style.display = 'none';
              modalLicense.style.opacity = '1';
              btnSubmit.disabled = false;
              btnSubmit.innerHTML = '<span>⚡ Kích Hoạt Bản Quyền Ngay</span>';
              btnSubmit.style.background = 'linear-gradient(135deg, #0284c7, #db2777)';
            }, 400);
          }, 1200);

        } else {
          if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
            statusMsg.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            statusMsg.style.color = '#fca5a5';
            statusMsg.innerHTML = `❌ <strong>Không thể kích hoạt:</strong> ${escHtml(res.message || 'Mã kích hoạt không đúng!')}`;
          }
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<span>⚡ Kích Hoạt Bản Quyền Ngay</span>';
        }
      } catch (err) {
        if (statusMsg) {
          statusMsg.style.display = 'block';
          statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
          statusMsg.style.color = '#fca5a5';
          statusMsg.innerHTML = `❌ Lỗi: ${escHtml(err.message)}`;
        }
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span>⚡ Kích Hoạt Bản Quyền Ngay</span>';
      }
    };
  }

  // Enter to submit
  if (keyInput) {
    keyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (btnSubmit) btnSubmit.click();
      }
    });
  }

  // Cancel / Close if allowed
  if (btnCancel) {
    btnCancel.onclick = () => {
      modalLicense.style.display = 'none';
    };
  }

  // Check on startup
  await checkLicenseStatus(true);
}

window.initLicenseGuard = initLicenseGuard;

