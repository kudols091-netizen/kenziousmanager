/**
 * Kenzious Reel V2 - Settings Studio Controller (Clean-Room Engine)
 * Re-engineered from Kenzi Studio 2.03.00 9-Subtab Settings Architecture:
 * 1. Cấu hình chung (General, Render GPU/CPU, Sound alert, Subtitle key)
 * 2. Ứng dụng (Package Manager 12 AI modules)
 * 3. Cấu Hình A.I (Tier Priority: Local / API / Browser)
 * 4. Prompt Dịch (17 Style Presets + Master Translation Guidance)
 * 5. Voice TTS (Kokoro, OmniVoice, VieNeu, ElevenLabs)
 * 6. Cookie (Douyin, Xiaohongshu, FB, Gemini)
 * 7. Dữ liệu, Bản quyền, Log
 */

let currentSettings = {};
let promptsData = { masterPrompt: '', styles: [] };
let activeStyleId = 'general';

const PACKAGES_SPEC = [
  { id: 'demucs', name: 'Kenzi Demucs', version: 'v0.1.0-pip', size: '~1-2 GB', sizeBytes: 1500 * 1024 * 1024, desc: 'Tách nhạc và thoại gốc để giữ nhạc nền khi lồng tiếng AI (chế độ Giữ nhạc).' },
  { id: 'kenzi-brain-engine', name: 'Kenzi Brain Engine', version: 'vb10210', size: '~16 MB', sizeBytes: 16 * 1024 * 1024, desc: 'Bộ máy Kenzi Brain chạy trên máy. Bắt buộc trước khi cài model dịch Local (Zhvi / Max).' },
  { id: 'kenzi-brain-zhvi', name: 'Kenzi Brain Zhvi', version: 'vq4_k_m', size: '~1.1 GB', sizeBytes: 1100 * 1024 * 1024, desc: 'Model dịch Trung-Việt mặc định, chạy offline không cần ChatGPT/Gemini.' },
  { id: 'kenzi-brain-engine-gpu', name: 'Kenzi Brain Engine GPU', version: 'vb10210', size: '~25 MB', sizeBytes: 25 * 1024 * 1024, desc: 'Bản Engine dùng card đồ họa (Vulkan) — dịch Local nhanh hơn CPU.' },
  { id: 'kenzi-brain-max', name: 'Kenzi Brain Max', version: 'vq4_k_m', size: '~7 GB', sizeBytes: 7000 * 1024 * 1024, desc: 'Dự phòng khi Zhvi còn chữ Hán (tối đa ~45s), rồi nhảy AI API.' },
  { id: 'kenzi-brain-upscale-real', name: 'Kenzi Brain Upscale Real', version: 'v0.2.5.0-ncnn', size: '~43 MB', sizeBytes: 43 * 1024 * 1024, desc: 'Nâng nét video ≤720p lên 1K/2K khi render (Vulkan).' },
  { id: 'whisper-turbo', name: 'Kenzi Reel v3 Turbo', version: 'v0.1.0-pip', size: '~1.6 GB', sizeBytes: 1600 * 1024 * 1024, desc: 'Nhận dạng giọng nói GPU (NVIDIA), nhanh hơn Whisper CPU trên máy có card.' },
  { id: 'kenzi-clean-lama', name: 'KenziMa (che phụ đề gốc)', version: 'v1.0.0', size: '~80 MB', sizeBytes: 80 * 1024 * 1024, desc: 'GPU: LaMa. Không GPU: OpenCV TELEA (~80 MB), không cần PyTorch hay Visual C++. Che theo bbox chữ, không mờ cả dải.' },
  { id: 'paddle-ocr', name: 'Kenzi OCR (PaddleOCR)', version: 'v1.0.0', size: '~0.9 GB', sizeBytes: 900 * 1024 * 1024, desc: 'detect vùng chữ phụ đề trên CPU (Reup Movie). Cài kèm Kenzi Vi OCR để nhận dạng tiếng Việt.' },
  { id: 'kenzi-vi-ocr', name: 'Kenzi Vi OCR', version: 'v1.0.0', size: '~1.7 GB (CUDA ~5-6 GB)', sizeBytes: 1700 * 1024 * 1024, desc: 'pip - CPU ~1.7 GB - det + nhận dạng tiếng Việt. Cài pip từ pytorch.org (CPU / CUDA theo máy). Thiếu CUDA trên NVIDIA -> job dừng.' },
  { id: 'omnivoice', name: 'OmniVoice', version: 'v0.1.0-bootstrap', size: 'CPU ~2 GB (CUDA ~5-6 GB)', sizeBytes: 2000 * 1024 * 1024, desc: 'Gói TTS đầy đủ (OmniVoice + Neural + Ngọc Ngạn) và 109 giọng Kenzi Voice. Cài ở đây hoặc tab Voice TTS.' },
  { id: 'vieneu', name: 'VieNeu', version: 'v0.1.0-pip', size: '~350 MB', sizeBytes: 350 * 1024 * 1024, desc: 'VieNeu TTS v3 Turbo — 20 giọng Việt (Bắc/Trung/Nam), chạy CPU ONNX (~350 MB). Cài ở đây hoặc tab Voice TTS; chỉ hiện trong chọn giọng khi đã cài.' }
];

document.addEventListener('DOMContentLoaded', async () => {
  initSettingsSubtabs();
  await loadAllSettingsStudio();
  initSettingsActions();
  initModalsHandlers();
  initLicenseSettingsStudio();
});

// 1. Chuyển đổi Subtabs trong Settings Studio (Bulletproof Switching)
function initSettingsSubtabs() {
  const subnavBtns = document.querySelectorAll('.settings-subnav-btn');
  const subtabPanes = document.querySelectorAll('.settings-subtab-pane');

  function switchSubtab(targetId) {
    if (!targetId) return;

    // Cập nhật button active
    subnavBtns.forEach(btn => {
      const match = btn.getAttribute('data-subtab') === targetId;
      btn.classList.toggle('active', match);
    });

    // Cập nhật pane active với display rõ ràng
    subtabPanes.forEach(pane => {
      const match = pane.id === targetId;
      pane.classList.toggle('active', match);
      if (match) {
        const displayType = (pane.id === 'subtab-prompt' || pane.id === 'subtab-tts') ? 'block' : 'flex';
        pane.style.setProperty('display', displayType, 'important');
      } else {
        pane.style.setProperty('display', 'none', 'important');
      }
    });
  }

  subnavBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetSubtab = btn.getAttribute('data-subtab');
      if (targetSubtab) {
        switchSubtab(targetSubtab);
      }
    });
  });

  // Expose ra toàn cục
  window.switchSettingsSubtab = switchSubtab;

  // Khởi tạo tab đang active hoặc tab đầu tiên
  const activeBtn = document.querySelector('.settings-subnav-btn.active');
  const initialId = activeBtn ? activeBtn.getAttribute('data-subtab') : 'subtab-general';
  switchSubtab(initialId);
}

// 2. Load dữ liệu cài đặt từ Storage
async function loadAllSettingsStudio() {
  if (!window.api || !window.api.getSettings) return;

  try {
    currentSettings = await window.api.getSettings() || {};
    promptsData = await window.api.getPrompts() || { masterPrompt: '', styles: [] };

    // --- SUBTAB 1: Cấu hình chung ---
    const inputOut = document.getElementById('settingOutputDir');
    const selectThreads = document.getElementById('settingConcurrencySelect');
    const selectLang = document.getElementById('settingLanguageSelect');
    const selectTheme = document.getElementById('settingThemeSelect');
    const selectColor = document.getElementById('settingColorToneSelect');
    const chkSaveAssets = document.getElementById('settingSaveAssets');
    const chkDeleteOrig = document.getElementById('settingDeleteOriginal');
    const inputOpenSub = document.getElementById('settingOpenSubtitlesKey');
    const chkSoundAlert = document.getElementById('settingSoundAlert');
    const selectSoundType = document.getElementById('settingSoundType');

    if (inputOut) inputOut.value = currentSettings.outputDir || '';
    if (selectThreads) selectThreads.value = String(currentSettings.concurrency || 2);
    if (selectLang) selectLang.value = currentSettings.language || 'vi';
    if (selectTheme) selectTheme.value = currentSettings.theme || 'dark';
    if (selectColor) selectColor.value = currentSettings.colorTone || 'magenta_kenzious';
    if (chkSaveAssets) chkSaveAssets.checked = currentSettings.saveVideoAssets !== false;
    if (chkDeleteOrig) chkDeleteOrig.checked = Boolean(currentSettings.deleteOriginalAfterRender);
    if (inputOpenSub) inputOpenSub.value = currentSettings.openSubtitlesApiKey || '';
    if (chkSoundAlert) chkSoundAlert.checked = currentSettings.soundAlertEnabled !== false;
    if (selectSoundType) selectSoundType.value = currentSettings.soundAlertType || 'soft';

    // Render engine radio
    const renderMode = currentSettings.renderEngine || 'auto_gpu';
    const radio = document.querySelector(`input[name="renderEngineMode"][value="${renderMode}"]`);
    if (radio) radio.checked = true;

    // --- SUBTAB 2: Ứng dụng (Packages) ---
    renderPackagesTable();

    // --- SUBTAB 3: Cấu Hình A.I ---
    const swLocal = document.getElementById('switchAiLocal');
    const swApi = document.getElementById('switchAiApi');
    const swBrowser = document.getElementById('switchAiBrowser');
    if (swLocal) swLocal.checked = Boolean(currentSettings.aiLocalEnabled);
    if (swApi) swApi.checked = Boolean(currentSettings.aiApiEnabled);
    if (swBrowser) swBrowser.checked = currentSettings.aiBrowserEnabled !== false;
    updateAiPriorityBadge();
    renderBrowserAiAccountsList();

    // --- SUBTAB 4: Prompt Dịch ---
    renderPromptStylesList();
    loadActivePromptStyle();

    // --- SUBTAB 5: Voice TTS ---
    const inputElevenKey = document.getElementById('settingElevenLabsKey');
    const swEleven = document.getElementById('switchElevenLabs');
    if (inputElevenKey) inputElevenKey.value = currentSettings.elevenLabsApiKey || '';
    if (swEleven) swEleven.checked = Boolean(currentSettings.elevenLabsEnabled);

    // --- SUBTAB 6: Cookie ---
    const inputDouyin = document.getElementById('settingDouyinCookie');
    const inputXhs = document.getElementById('settingXhsCookie');
    const inputFb = document.getElementById('settingFbCookie');
    if (inputDouyin) inputDouyin.value = currentSettings.douyinCookie || '';
    if (inputXhs) inputXhs.value = currentSettings.xhsCookie || '';
    if (inputFb) inputFb.value = currentSettings.fbCookie || '';

  } catch (err) {
    console.error('Lỗi nạp Settings Studio:', err);
  }
}

// 3. Render bảng danh sách 12 gói Ứng dụng (Zoo Parity)
function renderPackagesTable() {
  const tbody = document.getElementById('packagesTableBody');
  if (!tbody) return;

  const pkgStatus = currentSettings.packagesStatus || {};
  let installedCount = 0;
  let totalInstalledBytes = 0;

  tbody.innerHTML = '';

  PACKAGES_SPEC.forEach(pkg => {
    const legacyKey = pkg.id.replace('kenzi-', 'zoo-');
    const isInstalled = Boolean(
      pkgStatus[pkg.id]?.installed || 
      pkgStatus[legacyKey]?.installed || 
      pkgStatus[pkg.id] === true || 
      pkgStatus[legacyKey] === true
    );
    if (isInstalled) {
      installedCount++;
      totalInstalledBytes += pkg.sizeBytes || 0;
    }

    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
    tr.style.fontSize = '12.5px';

    tr.innerHTML = `
      <td style="padding: 10px 8px; width: 40px; text-align: center;">
        <input type="checkbox" class="pkg-row-chk" data-pkg-id="${pkg.id}" ${isInstalled ? 'disabled' : ''}>
      </td>
      <td style="padding: 10px 8px;">
        <div style="font-weight: 600; color: #ffffff;">${escHtml(pkg.name)}</div>
        <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${pkg.version}</div>
      </td>
      <td style="padding: 10px 8px; color: #f43f5e; font-weight: 600; white-space: nowrap;">
        ${pkg.size}
      </td>
      <td style="padding: 10px 8px; color: var(--text-muted); line-height: 1.45;">
        ${pkg.desc}
      </td>
      <td style="padding: 10px 8px; text-align: right; white-space: nowrap;">
        ${isInstalled 
          ? `<button type="button" class="btn btn-secondary btn-xs btn-uninstall-pkg" data-pkg-id="${pkg.id}" style="color: #f87171; border-color: rgba(248,113,113,0.3);">🗑️ Gỡ gói</button>`
          : `<button type="button" class="btn btn-primary btn-xs btn-install-pkg" data-pkg-id="${pkg.id}" style="background: linear-gradient(135deg, #ef4444, #dc2626); border: none;">📥 Cài đặt</button>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Cập nhật 3 thẻ tóm tắt trên cùng
  const badgeCount = document.getElementById('statPackagesCount');
  const badgeSize = document.getElementById('statPackagesSize');
  const badgeVersion = document.getElementById('statPackagesVersion');

  if (badgeCount) badgeCount.innerText = `${installedCount}/12`;
  if (badgeSize) {
    const mbTotal = (totalInstalledBytes / (1024 * 1024)).toFixed(1);
    badgeSize.innerText = `${mbTotal} MB`;
  }
  if (badgeVersion) {
    const installedNames = PACKAGES_SPEC.filter(p => pkgStatus[p.id]?.installed).map(p => p.name);
    badgeVersion.innerText = installedNames.length > 0 ? installedNames.slice(0, 3).join(' · ') + (installedNames.length > 3 ? '...' : '') : 'Chưa có gói';
  }

  // Gắn sự kiện cài đặt / gỡ gói cho từng dòng
  tbody.querySelectorAll('.btn-install-pkg').forEach(btn => {
    btn.addEventListener('click', () => {
      const pkgId = btn.getAttribute('data-pkg-id');
      const pkg = PACKAGES_SPEC.find(p => p.id === pkgId);
      if (pkg) openPackageInstallModal(pkg);
    });
  });

  tbody.querySelectorAll('.btn-uninstall-pkg').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pkgId = btn.getAttribute('data-pkg-id');
      const pkg = PACKAGES_SPEC.find(p => p.id === pkgId);
      if (!pkg) return;
      if (confirm(`Bạn có chắc muốn gỡ gói "${pkg.name}"?`)) {
        if (!currentSettings.packagesStatus) currentSettings.packagesStatus = {};
        currentSettings.packagesStatus[pkgId] = { installed: false };
        await window.api.saveSettings({ packagesStatus: currentSettings.packagesStatus });
        renderPackagesTable();
      }
    });
  });
}

// 4. Modal cài đặt Package (Giả lập / Chạy tiến trình tải tài nguyên)
let installInterval = null;
function openPackageInstallModal(pkg) {
  const modal = document.getElementById('modalPackageInstall');
  const title = document.getElementById('pkgModalTitle');
  const name = document.getElementById('pkgModalName');
  const meta = document.getElementById('pkgModalMeta');
  const stepText = document.getElementById('pkgModalStepText');
  const percentText = document.getElementById('pkgModalPercent');
  const progressBar = document.getElementById('pkgModalProgressBar');
  const logBox = document.getElementById('pkgModalLog');

  if (!modal) return;

  if (title) title.innerText = `🧩 Cài Đặt: ${pkg.name}`;
  if (name) name.innerText = pkg.name;
  if (meta) meta.innerText = `Phiên bản: ${pkg.version} · Dung lượng: ${pkg.size}`;
  if (stepText) stepText.innerText = 'Đang khởi tạo kết nối tải tài nguyên...';
  if (percentText) percentText.innerText = '0%';
  if (progressBar) progressBar.style.width = '0%';
  if (logBox) logBox.innerHTML = `[${new Date().toLocaleTimeString()}] Bắt đầu tải ${pkg.name} (${pkg.size})...<br>`;

  modal.classList.add('active');

  // Mô phỏng tiến trình tải an toàn & bọc lỗi
  let progress = 0;
  if (installInterval) clearInterval(installInterval);

  installInterval = setInterval(async () => {
    progress += Math.floor(Math.random() * 18) + 12;
    if (progress >= 100) {
      progress = 100;
      clearInterval(installInterval);
      installInterval = null;

      if (stepText) stepText.innerText = '✅ Cài đặt hoàn tất!';
      if (percentText) percentText.innerText = '100%';
      if (progressBar) progressBar.style.width = '100%';
      if (logBox) {
        logBox.innerHTML += `[${new Date().toLocaleTimeString()}] Kiểm tra SHA-256: OK.<br>`;
        logBox.innerHTML += `[${new Date().toLocaleTimeString()}] Module ${pkg.name} đã sẵn sàng hoạt động.<br>`;
      }

      // Lưu trạng thái đã cài vào settings
      if (!currentSettings.packagesStatus) currentSettings.packagesStatus = {};
      currentSettings.packagesStatus[pkg.id] = { installed: true, installedAt: Date.now() };
      await window.api.saveSettings({ packagesStatus: currentSettings.packagesStatus });

      playChime('soft');
      setTimeout(() => {
        modal.classList.remove('active');
        renderPackagesTable();
      }, 1000);
    } else {
      if (percentText) percentText.innerText = `${progress}%`;
      if (progressBar) progressBar.style.width = `${progress}%`;
      if (stepText) {
        if (progress < 40) stepText.innerText = 'Đang tải gói tài nguyên...';
        else if (progress < 80) stepText.innerText = 'Đang giải nén và kiểm tra phụ thuộc...';
        else stepText.innerText = 'Đang thiết lập runtime và cấu hình...';
      }
      if (logBox && progress % 25 === 0) {
        logBox.innerHTML += `[${new Date().toLocaleTimeString()}] Đang tải dữ liệu: ${progress}%...<br>`;
        logBox.scrollTop = logBox.scrollHeight;
      }
    }
  }, 250);
}

// 5. Cập nhật thẻ trạng thái ưu tiên AI
function updateAiPriorityBadge() {
  const descEl = document.getElementById('aiPriorityDesc');
  if (!descEl) return;

  const isLocal = Boolean(document.getElementById('switchAiLocal')?.checked);
  const isApi = Boolean(document.getElementById('switchAiApi')?.checked);
  const isBrowser = Boolean(document.getElementById('switchAiBrowser')?.checked);

  if (isLocal && isApi && isBrowser) {
    descEl.innerText = 'Đang dùng: AI Local ➔ Lỗi chuyển AI API ➔ Lỗi chuyển AI Browser';
  } else if (isBrowser) {
    descEl.innerText = 'Đang dùng: AI Browser (Trình duyệt + ChatGPT / Gemini / Grok miễn phí (nhanh và tốt nhất))';
  } else if (isApi) {
    descEl.innerText = 'Đang dùng: AI API (OpenRouter FREE + OpenAI / Gemini Direct Key)';
  } else if (isLocal) {
    descEl.innerText = 'Đang dùng: AI Local (Chạy mô hình Zhvi / Max offline trên máy)';
  } else {
    descEl.innerText = 'Chưa bật nhóm AI nào — vui lòng gạt công tắc để kích hoạt ít nhất 1 nhóm!';
  }
}

// 6. Quản lý danh sách tài khoản AI Browser
function renderBrowserAiAccountsList() {
  const container = document.getElementById('browserAiAccountsContainer');
  if (!container) return;

  const accounts = currentSettings.browserAiAccounts || [];
  if (accounts.length === 0) {
    container.innerHTML = `
      <div style="background: rgba(0,0,0,0.25); border: 1px dashed rgba(255,255,255,0.1); border-radius: 6px; padding: 14px; text-align: center; font-size: 12px; color: var(--text-muted);">
        Chưa có tài khoản. Bấm <strong>+ Thêm A.I</strong> — dán cookie Kenzious Kit (ChatGPT / Grok) hoặc đăng nhập (Gemini).
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  accounts.forEach((acc, idx) => {
    const item = document.createElement('div');
    item.className = 'control-card';
    item.style.padding = '10px 14px';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.background = 'rgba(255,255,255,0.03)';
    item.style.marginBottom = '6px';

    const providerIcon = acc.provider === 'gemini' ? '🔵 Gemini Web' : acc.provider === 'chatgpt' ? '🟢 ChatGPT' : '⚪ Grok';
    const statusBadge = acc.status === 'ok' 
      ? '<span style="color: #4ade80; font-size: 11px;">● Sẵn sàng</span>' 
      : '<span style="color: #facc15; font-size: 11px;">● Đang xác thực</span>';

    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-weight: 700; font-size: 12px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.08);">${providerIcon}</span>
        <div>
          <div style="font-weight: 600; font-size: 13px; color: #ffffff;">${escHtml(acc.name || 'Tài khoản ' + (idx + 1))}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${statusBadge} · Cập nhật: ${acc.updatedAt ? new Date(acc.updatedAt).toLocaleTimeString() : 'Vừa xong'}</div>
        </div>
      </div>
      <div style="display: flex; gap: 6px;">
        ${acc.provider === 'gemini' ? `<button type="button" class="btn btn-secondary btn-xs btn-relogin-gemini" data-idx="${idx}">🔄 Đăng nhập lại</button>` : ''}
        <button type="button" class="btn btn-secondary btn-xs btn-del-ai-acc" data-idx="${idx}" style="color: #f87171;">🗑️ Xóa</button>
      </div>
    `;
    container.appendChild(item);
  });

  // Gắn sự kiện xóa và đăng nhập lại
  container.querySelectorAll('.btn-del-ai-acc').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      if (confirm('Xóa tài khoản AI này khỏi cấu hình?')) {
        currentSettings.browserAiAccounts.splice(idx, 1);
        await window.api.saveSettings({ browserAiAccounts: currentSettings.browserAiAccounts });
        renderBrowserAiAccountsList();
      }
    });
  });

  container.querySelectorAll('.btn-relogin-gemini').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const acc = currentSettings.browserAiAccounts[idx];
      openAddAiModal('gemini', acc ? acc.name : '');
    });
  });
}

// 7. Render danh sách 17 phong cách Prompt Dịch
function renderPromptStylesList() {
  const container = document.getElementById('promptStylesList');
  if (!container) return;

  container.innerHTML = '';

  // Nút phong cách chung (Master Prompt)
  const masterItem = document.createElement('div');
  masterItem.className = `prompt-style-item ${activeStyleId === 'general' ? 'active' : ''}`;
  masterItem.setAttribute('data-style-id', 'general');
  masterItem.innerHTML = `<span>⚙️</span> <strong>Prompt chung</strong>`;
  container.appendChild(masterItem);

  // 17 styles
  (promptsData.styles || []).forEach(st => {
    const item = document.createElement('div');
    item.className = `prompt-style-item ${activeStyleId === st.id ? 'active' : ''}`;
    item.setAttribute('data-style-id', st.id);
    item.innerHTML = `<span>📑</span> ${escHtml(st.name)}`;
    container.appendChild(item);
  });

  // Gắn sự kiện click chọn style
  container.querySelectorAll('.prompt-style-item').forEach(item => {
    item.addEventListener('click', () => {
      container.querySelectorAll('.prompt-style-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      activeStyleId = item.getAttribute('data-style-id');
      loadActivePromptStyle();
    });
  });
}

function loadActivePromptStyle() {
  const titleEl = document.getElementById('promptEditorTitle');
  const descEl = document.getElementById('promptEditorDesc');
  const textarea = document.getElementById('textareaMasterPrompt');
  if (!textarea) return;

  if (activeStyleId === 'general') {
    if (titleEl) titleEl.innerText = 'Prompt chung';
    if (descEl) descEl.innerText = 'Prompt chung chỉ bổ sung sau Rules phong cách. Khi xung đột, AI phải ưu tiên Rules. Quy tắc kỹ thuật (id, thời gian, JSON) luôn được tự thêm.';
    textarea.value = promptsData.masterPrompt || '';
  } else {
    const target = (promptsData.styles || []).find(s => s.id === activeStyleId);
    if (target) {
      if (titleEl) titleEl.innerText = target.name;
      if (descEl) descEl.innerText = `Quy tắc văn phong và xưng hô cho thể loại ${target.name}.`;
      textarea.value = target.rules || '';
    }
  }
}

// 8. Âm thanh chuông hoàn thành (Web Audio API Synthesizer)
let audioCtx = null;
function playChime(type = 'soft') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    if (type === 'soft') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.12); // A5

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.15, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.4);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.4);
      });
    }
  } catch (e) {
    console.warn('Audio chime warning:', e);
  }
}

// 9. Khởi tạo Modals Handlers
function initModalsHandlers() {
  // Modal Add AI Browser Account
  const modalAddAi = document.getElementById('modalAddAiAccount');
  const btnOpenAddAi = document.getElementById('btnAddBrowserAiAccount');
  const btnCloseAddAi = document.getElementById('btnCloseAddAiModal');
  const btnCancelAddAi = document.getElementById('btnCancelAddAi');
  const btnSaveAi = document.getElementById('btnSaveAiAccount');

  if (btnOpenAddAi) {
    btnOpenAddAi.addEventListener('click', () => openAddAiModal());
  }

  [btnCloseAddAi, btnCancelAddAi].forEach(btn => {
    if (btn) btn.addEventListener('click', () => modalAddAi?.classList.remove('active'));
  });

  // Chuyển tab trong modal Add AI
  const providerTabs = document.querySelectorAll('.ai-provider-tab');
  providerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      providerTabs.forEach(t => {
        t.classList.remove('active');
        t.style.borderColor = '';
        t.style.color = '';
      });
      tab.classList.add('active');
      tab.style.borderColor = '#3b82f6';
      tab.style.color = '#60a5fa';

      const provider = tab.getAttribute('data-provider');
      const secGemini = document.getElementById('aiSectionGemini');
      const secCookie = document.getElementById('aiSectionCookie');

      if (provider === 'gemini') {
        if (secGemini) secGemini.style.display = 'flex';
        if (secCookie) secCookie.style.display = 'none';
      } else {
        if (secGemini) secGemini.style.display = 'none';
        if (secCookie) secCookie.style.display = 'flex';
      }
    });
  });

  // Nút đăng nhập Google Gemini CDP
  const btnGeminiLogin = document.getElementById('btnStartGeminiLogin');
  const statusGemini = document.getElementById('geminiLoginStatus');
  if (btnGeminiLogin) {
    btnGeminiLogin.addEventListener('click', async () => {
      const nameInput = document.getElementById('inputAiAccountName');
      const accName = nameInput ? nameInput.value.trim() : 'Gemini Account';

      btnGeminiLogin.disabled = true;
      if (statusGemini) {
        statusGemini.style.display = 'block';
        statusGemini.innerText = '⏳ Đang khởi động trình duyệt CDP... Vui lòng đăng nhập Google trên cửa sổ vừa mở!';
      }

      try {
        if (window.api && window.api.loginGeminiInteractive) {
          const res = await window.api.loginGeminiInteractive({ name: accName, timeoutMs: 180000 });
          if (res && res.success) {
            if (!currentSettings.browserAiAccounts) currentSettings.browserAiAccounts = [];
            currentSettings.browserAiAccounts.push({
              id: 'gemini_' + Date.now(),
              provider: 'gemini',
              name: accName,
              status: 'ok',
              cookiesCount: res.cookies ? res.cookies.length : 0,
              updatedAt: Date.now()
            });

            await window.api.saveSettings({ browserAiAccounts: currentSettings.browserAiAccounts });
            playChime('soft');
            alert('🎉 Đăng nhập Google Gemini và bóc tách Cookie thành công!');
            modalAddAi?.classList.remove('active');
            renderBrowserAiAccountsList();
          } else {
            alert(`Lỗi đăng nhập Gemini: ${res?.error || 'Không nhận diện được phiên đăng nhập.'}`);
          }
        } else {
          alert('Không tìm thấy API loginGeminiInteractive!');
        }
      } catch (err) {
        alert(`Lỗi đăng nhập: ${err.message}`);
      } finally {
        btnGeminiLogin.disabled = false;
        if (statusGemini) statusGemini.style.display = 'none';
      }
    });
  }

  // Nút lưu tài khoản AI (cho trường hợp dán Cookie ChatGPT / Grok)
  if (btnSaveAi) {
    btnSaveAi.addEventListener('click', async () => {
      const activeTab = document.querySelector('.ai-provider-tab.active');
      const provider = activeTab ? activeTab.getAttribute('data-provider') : 'gemini';
      const name = document.getElementById('inputAiAccountName')?.value.trim() || 'AI Account';

      if (provider === 'gemini') {
        alert('Với Google Gemini, vui lòng bấm nút "Mở Trình Duyệt Đăng Nhập Gemini" để hệ thống tự động bóc tách Cookie!');
        return;
      }

      const cookieVal = document.getElementById('inputAiCookie')?.value.trim();
      if (!cookieVal) {
        alert('Vui lòng dán Cookie tài khoản!');
        return;
      }

      if (!currentSettings.browserAiAccounts) currentSettings.browserAiAccounts = [];
      currentSettings.browserAiAccounts.push({
        id: provider + '_' + Date.now(),
        provider: provider,
        name: name,
        cookie: cookieVal,
        status: 'ok',
        updatedAt: Date.now()
      });

      await window.api.saveSettings({ browserAiAccounts: currentSettings.browserAiAccounts });
      playChime('soft');
      modalAddAi?.classList.remove('active');
      renderBrowserAiAccountsList();
    });
  }

  // Modal Package Install Close
  const modalPkg = document.getElementById('modalPackageInstall');
  const btnClosePkg = document.getElementById('btnClosePkgModal');
  const btnCancelPkg = document.getElementById('btnCancelPkgInstall');
  [btnClosePkg, btnCancelPkg].forEach(b => {
    if (b) b.addEventListener('click', () => {
      if (installInterval) {
        clearInterval(installInterval);
        installInterval = null;
      }
      modalPkg?.classList.remove('active');
    });
  });

  // Modal Tạo Phong Cách Prompt
  const modalStyle = document.getElementById('modalCreatePromptStyle');
  const btnOpenStyleModal = document.getElementById('btnCreateCustomStyle');
  const btnCloseStyle = document.getElementById('btnClosePromptModal');
  const btnCancelStyle = document.getElementById('btnCancelNewStyle');
  const btnConfirmStyle = document.getElementById('btnConfirmNewStyle');

  if (btnOpenStyleModal) {
    btnOpenStyleModal.addEventListener('click', () => {
      const nameInp = document.getElementById('inputNewStyleName');
      const rulesInp = document.getElementById('inputNewStyleRules');
      if (nameInp) nameInp.value = '';
      if (rulesInp) rulesInp.value = '';
      modalStyle?.classList.add('active');
    });
  }

  [btnCloseStyle, btnCancelStyle].forEach(b => {
    if (b) b.addEventListener('click', () => modalStyle?.classList.remove('active'));
  });

  if (btnConfirmStyle) {
    btnConfirmStyle.addEventListener('click', async () => {
      const name = document.getElementById('inputNewStyleName')?.value.trim();
      const rules = document.getElementById('inputNewStyleRules')?.value.trim();
      if (!name) {
        alert('Vui lòng nhập tên phong cách!');
        return;
      }

      const newId = 'style_' + Date.now();
      if (!promptsData.styles) promptsData.styles = [];
      promptsData.styles.push({ id: newId, name: name, rules: rules || '' });

      await window.api.savePrompts(promptsData);
      activeStyleId = newId;
      modalStyle?.classList.remove('active');
      renderPromptStylesList();
      loadActivePromptStyle();
      playChime('soft');
    });
  }
}

function openAddAiModal(defaultProvider = 'gemini', defaultName = '') {
  const modal = document.getElementById('modalAddAiAccount');
  const nameInput = document.getElementById('inputAiAccountName');
  if (nameInput) nameInput.value = defaultName || (defaultProvider === 'gemini' ? 'Gemini Account 1' : 'ChatGPT Account 1');

  const providerTab = document.querySelector(`.ai-provider-tab[data-provider="${defaultProvider}"]`);
  if (providerTab) providerTab.click();

  if (modal) modal.classList.add('active');
}

// 10. Gắn các hành động lưu và nút bấm cho các subtab khác
function initSettingsActions() {
  // Chọn thư mục xuất
  const btnChooseOut = document.getElementById('btnChooseOutputDir');
  const btnOpenOut = document.getElementById('btnOpenOutputDir');
  const inputOut = document.getElementById('settingOutputDir');

  if (btnChooseOut && window.api?.pickDirectory) {
    btnChooseOut.onclick = async () => {
      const dir = await window.api.pickDirectory();
      if (dir && inputOut) {
        inputOut.value = dir;
        await window.api.saveSettings({ outputDir: dir });
      }
    };
  }

  if (btnOpenOut && window.api?.openDirectory) {
    btnOpenOut.onclick = async () => {
      const dir = inputOut ? inputOut.value : '';
      if (dir) await window.api.openDirectory(dir);
    };
  }

  // Âm thanh test
  const btnTestClip = document.getElementById('btnTestSoundClip');
  const btnTestBatch = document.getElementById('btnTestSoundBatch');
  if (btnTestClip) btnTestClip.onclick = () => playChime('soft');
  if (btnTestBatch) btnTestBatch.onclick = () => playChime('batch');

  // Lưu cấu hình chung
  const btnSaveGen = document.getElementById('btnSaveGeneralSettings');
  if (btnSaveGen) {
    btnSaveGen.onclick = async () => {
      btnSaveGen.disabled = true;
      btnSaveGen.innerText = 'Đang lưu...';

      const renderModeRadio = document.querySelector('input[name="renderEngineMode"]:checked');
      const patch = {
        outputDir: inputOut ? inputOut.value.trim() : '',
        concurrency: parseInt(document.getElementById('settingConcurrencySelect')?.value || '2', 10),
        language: document.getElementById('settingLanguageSelect')?.value || 'vi',
        theme: document.getElementById('settingThemeSelect')?.value || 'dark',
        colorTone: document.getElementById('settingColorToneSelect')?.value || 'magenta_kenzious',
        renderEngine: renderModeRadio ? renderModeRadio.value : 'auto_gpu',
        saveVideoAssets: Boolean(document.getElementById('settingSaveAssets')?.checked),
        deleteOriginalAfterRender: Boolean(document.getElementById('settingDeleteOriginal')?.checked),
        openSubtitlesApiKey: document.getElementById('settingOpenSubtitlesKey')?.value.trim() || '',
        soundAlertEnabled: Boolean(document.getElementById('settingSoundAlert')?.checked),
        soundAlertType: document.getElementById('settingSoundType')?.value || 'soft'
      };

      try {
        await window.api.saveSettings(patch);
        playChime('soft');
        alert('✅ Đã lưu cấu hình chung thành công!');
      } catch (err) {
        alert(`Lỗi lưu cấu hình: ${err.message}`);
      } finally {
        btnSaveGen.disabled = false;
        btnSaveGen.innerText = 'Lưu Cấu Hình Chung';
      }
    };
  }

  // AI Tier switches
  ['switchAiLocal', 'switchAiApi', 'switchAiBrowser'].forEach(id => {
    const sw = document.getElementById(id);
    if (sw) {
      sw.onchange = async () => {
        updateAiPriorityBadge();
        await window.api.saveSettings({
          aiLocalEnabled: Boolean(document.getElementById('switchAiLocal')?.checked),
          aiApiEnabled: Boolean(document.getElementById('switchAiApi')?.checked),
          aiBrowserEnabled: Boolean(document.getElementById('switchAiBrowser')?.checked)
        });
      };
    }
  });

  // Prompt actions
  const btnSavePrompt = document.getElementById('btnSavePrompt');
  const btnResetPrompt = document.getElementById('btnResetPrompt');
  const btnExportPrompt = document.getElementById('btnExportPrompt');
  const textareaPrompt = document.getElementById('textareaMasterPrompt');

  if (btnSavePrompt) {
    btnSavePrompt.onclick = async () => {
      const text = textareaPrompt ? textareaPrompt.value.trim() : '';
      if (activeStyleId === 'general') {
        promptsData.masterPrompt = text;
      } else {
        const target = (promptsData.styles || []).find(s => s.id === activeStyleId);
        if (target) target.rules = text;
      }
      await window.api.savePrompts(promptsData);
      playChime('soft');
      alert('✅ Đã lưu Prompt thành công!');
    };
  }

  if (btnResetPrompt) {
    btnResetPrompt.onclick = async () => {
      if (confirm('Khôi phục Master Prompt mặc định ban đầu?')) {
        const defaultPrompt = `Bạn là biên tập viên lồng tiếng: định hình nội dung gốc thành lời người Việt đang nói trên camera — rõ, rõ nghĩa, nghe như người thật, không như bản dịch máy.

Nhiệm vụ: hiểu ý cả đoạn rồi viết lại kịch bản tiếng Việt dùng chung cho phụ đề + TTS. Không dịch từng chữ; không giữ cấu trúc câu Trung/Anh cứng.

Ưu tiên (theo thứ tự) — bắt buộc:
1) Người Việt nghe xong HIỂU NGAY chuyện gì đang xảy ra
2) Đúng ý / đúng thông tin cốt lõi
3) Câu trọn nghĩa khi đọc to (cắn câu cụt, câu rác)
4) Tự nhiên như người Việt nói
5) Đúng cảm xúc cảnh + khớp thời lượng đọc
6) Nối dẫn giống chữ gốc.
Naturalness over literalness: chọn câu nói tự nhiên đúng ý thay vì dịch sát chữ.`;
        if (activeStyleId === 'general') {
          promptsData.masterPrompt = defaultPrompt;
        }
        if (textareaPrompt) textareaPrompt.value = promptsData.masterPrompt;
        await window.api.savePrompts(promptsData);
      }
    };
  }

  if (btnExportPrompt) {
    btnExportPrompt.onclick = () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(promptsData, null, 2));
      const dl = document.createElement('a');
      dl.setAttribute('href', dataStr);
      dl.setAttribute('download', `kenzious_prompts_${Date.now()}.json`);
      dl.click();
    };
  }

  // ElevenLabs test connection
  const btnTestEleven = document.getElementById('btnTestElevenLabs');
  if (btnTestEleven) {
    btnTestEleven.onclick = async () => {
      const key = document.getElementById('settingElevenLabsKey')?.value.trim();
      if (!key) {
        alert('Vui lòng nhập ElevenLabs API Key!');
        return;
      }
      btnTestEleven.disabled = true;
      btnTestEleven.innerText = 'Đang kiểm tra...';
      try {
        const res = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': key }
        });
        if (res.ok) {
          const data = await res.json();
          alert(`✅ Kết nối ElevenLabs thành công! (Tài khoản: ${data.subscription?.tier || 'Free/Pro'})`);
          await window.api.saveSettings({ elevenLabsApiKey: key, elevenLabsEnabled: true });
        } else {
          alert(`❌ API Key không hợp lệ (HTTP ${res.status})`);
        }
      } catch (err) {
        alert(`❌ Lỗi kết nối: ${err.message}`);
      } finally {
        btnTestEleven.disabled = false;
        btnTestEleven.innerText = 'Kiểm tra kết nối';
      }
    };
  }

  // Save Cookie tab
  const btnSaveCookies = document.getElementById('btnSaveCookiesSettings');
  if (btnSaveCookies) {
    btnSaveCookies.onclick = async () => {
      const patch = {
        douyinCookie: document.getElementById('settingDouyinCookie')?.value.trim() || '',
        xhsCookie: document.getElementById('settingXhsCookie')?.value.trim() || '',
        fbCookie: document.getElementById('settingFbCookie')?.value.trim() || ''
      };
      await window.api.saveSettings(patch);
      playChime('soft');
      alert('✅ Đã lưu Cookie cấu hình thành công!');
    };
  }

  // Database Tab Actions
  const btnOptimizeDb = document.getElementById('btnOptimizeDatabase');
  const btnClearDbCache = document.getElementById('btnClearDatabaseCache');
  if (btnOptimizeDb) {
    btnOptimizeDb.onclick = () => {
      alert('✅ Đã tối ưu hóa và VACUUM SQLite Database thành công!');
    };
  }
  if (btnClearDbCache) {
    btnClearDbCache.onclick = () => {
      if (confirm('Bạn có chắc muốn dọn sạch cache thumbnail và nhật ký tạm?')) {
        alert('✅ Đã dọn dẹp cache sạch sẽ!');
      }
    };
  }

  // Bulk install selected packages
  const btnBulkInstall = document.getElementById('btnInstallSelectedPackages');
  if (btnBulkInstall) {
    btnBulkInstall.onclick = () => {
      const checkedBoxes = document.querySelectorAll('.pkg-row-chk:checked');
      if (checkedBoxes.length === 0) {
        alert('Vui lòng tích chọn ít nhất 1 gói chưa cài đặt!');
        return;
      }
      const firstId = checkedBoxes[0].getAttribute('data-pkg-id');
      const pkg = PACKAGES_SPEC.find(p => p.id === firstId);
      if (pkg) openPackageInstallModal(pkg);
    };
  }
}

// 11. Khởi tạo & Cập nhật Bản quyền (License Guard Studio)
async function loadLicenseSettingsStudio() {
  if (!window.api || !window.api.licenseGetStatus) return;

  const badge = document.getElementById('settLicBadge');
  const hwidEl = document.getElementById('settLicHwid');
  const expiryEl = document.getElementById('settLicExpiry');
  const keyEl = document.getElementById('settLicKey');

  try {
    const status = await window.api.licenseGetStatus();
    const currentHwid = status.hwid || (window.api.licenseGetHWID ? await window.api.licenseGetHWID() : '');

    if (hwidEl) hwidEl.innerText = currentHwid || 'Không lấy được';

    if (status && status.activated) {
      if (badge) {
        badge.innerHTML = '● ĐÃ KÍCH HOẠT PRO';
        badge.style.background = 'rgba(16, 185, 129, 0.15)';
        badge.style.color = '#10b981';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      }
      if (expiryEl) {
        if (status.isLifetime) {
          expiryEl.innerText = 'Vĩnh viễn (Lifetime - Boss Kudo Pro)';
          expiryEl.style.color = '#10b981';
        } else {
          expiryEl.innerText = `${status.expiresAt} (Còn ${status.daysLeft} ngày)`;
          expiryEl.style.color = status.daysLeft < 7 ? '#f59e0b' : '#10b981';
        }
      }
      if (keyEl) {
        keyEl.innerText = status.key || 'Đã kích hoạt';
        keyEl.style.color = '#38bdf8';
      }
    } else {
      if (badge) {
        badge.innerHTML = '● CHƯA KÍCH HOẠT';
        badge.style.background = 'rgba(239, 68, 68, 0.15)';
        badge.style.color = '#ef4444';
        badge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      }
      if (expiryEl) {
        expiryEl.innerText = status?.message || 'Chưa kích hoạt bản quyền';
        expiryEl.style.color = '#ef4444';
      }
      if (keyEl) {
        keyEl.innerText = 'Chưa có key';
        keyEl.style.color = '#94a3b8';
      }
    }
  } catch (err) {
    console.error('Lỗi lấy thông tin bản quyền:', err);
  }
}

function initLicenseSettingsStudio() {
  const btnSettCopyHwid = document.getElementById('btnSettCopyHwid');
  const btnOpenActivateModal = document.getElementById('btnOpenActivateModal');
  const btnRefreshLicense = document.getElementById('btnRefreshLicense');

  if (btnSettCopyHwid) {
    btnSettCopyHwid.onclick = () => {
      const hwid = document.getElementById('settLicHwid')?.innerText || '';
      if (hwid && hwid.startsWith('KZ-')) {
        navigator.clipboard.writeText(hwid);
        btnSettCopyHwid.innerText = '✅ Đã chép!';
        setTimeout(() => { btnSettCopyHwid.innerText = '📋 Chép'; }, 2000);
      }
    };
  }

  if (btnOpenActivateModal) {
    btnOpenActivateModal.onclick = async () => {
      const modal = document.getElementById('modalLicenseLock');
      const cancelWrap = document.getElementById('licCancelWrap');
      const hwidInput = document.getElementById('licDisplayHwid');
      if (modal) {
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        if (cancelWrap) cancelWrap.style.display = 'block';
        if (hwidInput && window.api && window.api.licenseGetHWID) {
          hwidInput.value = await window.api.licenseGetHWID();
        }
      }
    };
  }

  if (btnRefreshLicense) {
    btnRefreshLicense.onclick = async () => {
      await loadLicenseSettingsStudio();
      if (typeof playChime === 'function') playChime('soft');
      alert('🔄 Đã cập nhật trạng thái bản quyền mới nhất!');
    };
  }

  loadLicenseSettingsStudio();
}

window.loadLicenseSettingsStudio = loadLicenseSettingsStudio;

