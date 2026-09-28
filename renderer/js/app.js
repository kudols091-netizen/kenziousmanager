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
