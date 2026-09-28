// Tab 1: Download & Render Manager
let videoQueue = [];
let isBatchRunning = false;

document.addEventListener('DOMContentLoaded', () => {
  initDownloadTab();
  initAddVideoModal();
  initProgressTracker();
  initGuideModal();
});

function initDownloadTab() {
  const toggleAi = document.getElementById('toggleAiDubbing');
  const aiCollapse = document.getElementById('aiOptionsCollapse');
  const toggleRender = document.getElementById('toggleRenderConfig');
  const renderCollapse = document.getElementById('renderOptionsCollapse');
  const renderDesc = document.getElementById('renderConfigDesc');

  toggleAi.addEventListener('change', () => {
    aiCollapse.style.display = toggleAi.checked ? 'flex' : 'none';
  });

  toggleRender.addEventListener('change', () => {
    renderCollapse.style.display = toggleRender.checked ? 'flex' : 'none';
    renderDesc.innerText = toggleRender.checked 
      ? 'Đang bật — Tự động căn chỉnh dọc 9:16 vertical blur và áp dụng bộ lọc lách bản quyền.'
      : 'Đang tắt — Video giữ nguyên tỉ lệ và định dạng mặc định.';
  });

  // Output Directory Pick & Open
  const btnBrowseOutputDir = document.getElementById('btnBrowseOutputDir');
  const btnOpenOutputDir = document.getElementById('btnOpenOutputDir');
  const inputOutputDir = document.getElementById('inputOutputDir');

  btnBrowseOutputDir.addEventListener('click', async () => {
    const dir = await window.api.pickDirectory();
    if (dir) {
      inputOutputDir.value = dir;
      await window.api.saveSettings({ outputDir: dir });
    }
  });

  btnOpenOutputDir.addEventListener('click', async () => {
    const dir = inputOutputDir.value;
    if (dir) await window.api.openDirectory(dir);
  });

  // Select all checkbox
  const chkSelectAll = document.getElementById('chkSelectAllVideos');
  chkSelectAll.addEventListener('change', () => {
    const checked = chkSelectAll.checked;
    videoQueue.forEach(v => v.selected = checked);
    renderQueueTable();
  });

  // Delete selected
  const btnDeleteSelected = document.getElementById('btnDeleteSelectedVideos');
  btnDeleteSelected.addEventListener('click', () => {
    videoQueue = videoQueue.filter(v => !v.selected);
    renderQueueTable();
  });

  // Platform chips filter
  const platformChips = document.querySelectorAll('.platform-chip');
  platformChips.forEach(chip => {
    chip.addEventListener('click', () => {
      platformChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const platform = chip.getAttribute('data-platform');
      filterQueueByPlatform(platform);
    });
  });

  // Batch Execute
  const btnBatchExecute = document.getElementById('btnBatchExecute');
  btnBatchExecute.addEventListener('click', () => {
    if (isBatchRunning) {
      alert('Tiến trình đang chạy!');
      return;
    }
    startBatchExecution(false);
  });

  // Test Render 15s
  const btnTestRender = document.getElementById('btnTestRender15s');
  btnTestRender.addEventListener('click', () => {
    if (isBatchRunning) {
      alert('Tiến trình đang chạy!');
      return;
    }
    startBatchExecution(true);
  });
}

// Modal Thêm Video
function initAddVideoModal() {
  const modal = document.getElementById('modalAddVideo');
  const btnOpen = document.getElementById('btnOpenAddModal');
  const btnClose = document.getElementById('btnCloseAddModal');
  const btnCancel = document.getElementById('btnCancelAddModal');
  const btnConfirm = document.getElementById('btnConfirmAddVideos');
  const textarea = document.getElementById('textareaVideoUrls');
  const countLabel = document.getElementById('detectedUrlsCount');

  btnOpen.addEventListener('click', () => {
    modal.classList.add('active');
    textarea.value = '';
    countLabel.innerText = 'Đã nhận diện: 0 liên kết';
    textarea.focus();
  });

  const closeModal = () => modal.classList.remove('active');
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  textarea.addEventListener('input', () => {
    const urls = parseUrls(textarea.value);
    countLabel.innerText = `Đã nhận diện: ${urls.length} liên kết`;
  });

  btnConfirm.addEventListener('click', async () => {
    const urls = parseUrls(textarea.value);
    if (urls.length === 0) {
      alert('Vui lòng dán ít nhất 1 liên kết video hợp lệ!');
      return;
    }

    closeModal();
    addUrlsToQueue(urls);
  });
}

function parseUrls(text) {
  const lines = text.split('\n');
  const results = [];
  const regex = /https?:\/\/[^\s]+/i;

  for (const line of lines) {
    const match = line.match(regex);
    if (match && match[0]) {
      results.push(match[0].trim());
    }
  }
  return results;
}

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'Facebook';
  if (u.includes('instagram.com')) return 'Instagram';
  if (u.includes('douyin.com')) return 'Douyin';
  if (u.includes('bilibili.com')) return 'Bilibili';
  if (u.includes('xiaohongshu.com') || u.includes('xhslink.com')) return 'Red Note';
  return 'Video';
}

function addUrlsToQueue(urls) {
  urls.forEach(url => {
    const platform = detectPlatform(url);
    const id = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    videoQueue.push({
      id,
      url,
      title: `${platform} Video [${id.slice(-4)}]`,
      platform,
      uploader: 'Đang chờ quét...',
      thumbnail: '',
      duration: '0:00',
      status: 'pending', // 'pending' | 'downloading' | 'dubbing' | 'rendering' | 'completed' | 'failed'
      progress: 0,
      speed: '',
      eta: '',
      selected: true,
      downloadedFile: null,
      renderedFile: null
    });
  });

  renderQueueTable();

  // Tự động quét thông tin video ở background
  urls.forEach(url => {
    window.api.getVideoInfo(url).then(info => {
      const item = videoQueue.find(v => v.url === url);
      if (item) {
        item.title = info.title;
        item.uploader = info.uploader;
        item.thumbnail = info.thumbnail;
        const dur = Math.round(info.duration || 0);
        item.duration = `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`;
        renderQueueTable();
      }
    }).catch(() => {});
  });
}

function renderQueueTable() {
  const emptyState = document.getElementById('emptyQueueState');
  const queueWrapper = document.getElementById('videoQueueWrapper');
  const queueList = document.getElementById('videoQueueList');
  const selectedCountText = document.getElementById('selectedCountText');

  const selectedCount = videoQueue.filter(v => v.selected).length;
  selectedCountText.innerText = selectedCount;

  if (videoQueue.length === 0) {
    emptyState.style.display = 'flex';
    queueWrapper.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  queueWrapper.style.display = 'flex';
  queueList.innerHTML = '';

  videoQueue.forEach(item => {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.id = `row_${item.id}`;

    let statusBadge = '<span class="badge badge-pending">Chờ xử lý</span>';
    if (item.status === 'downloading') {
      statusBadge = `<span class="badge badge-downloading">Đang tải (${item.progress}%)</span>`;
    } else if (item.status === 'dubbing') {
      statusBadge = `<span class="badge badge-rendering">Lồng tiếng AI...</span>`;
    } else if (item.status === 'rendering') {
      statusBadge = `<span class="badge badge-rendering">Đang render (${item.progress}%)</span>`;
    } else if (item.status === 'completed') {
      statusBadge = '<span class="badge badge-success">✓ Hoàn tất</span>';
    } else if (item.status === 'failed') {
      statusBadge = '<span class="badge badge-danger">Lỗi</span>';
    }

    row.innerHTML = `
      <div><input type="checkbox" class="chk-video-item" data-id="${item.id}" ${item.selected ? 'checked' : ''}></div>
      <div>
        <div class="thumb-preview">
          ${item.thumbnail ? `<img src="${item.thumbnail}" alt="Thumbnail">` : '🎬'}
        </div>
      </div>
      <div class="video-info-cell">
        <span class="video-title" title="${item.title}">${item.title}</span>
        <span class="video-uploader">${item.uploader} • ${item.duration}</span>
        ${(item.status === 'downloading' || item.status === 'rendering') ? `
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${item.progress}%;"></div>
          </div>
          <span style="font-size: 10.5px; color: var(--text-muted);">${item.speed} ${item.eta ? '• ETA: ' + item.eta : ''}</span>
        ` : ''}
      </div>
      <div>
        <span style="font-size: 12.5px; font-weight: 500; color: var(--brand-magenta);">${item.platform}</span>
      </div>
      <div>${statusBadge}</div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        ${item.renderedFile ? `
          <button class="btn btn-secondary btn-sm" onclick="openFileInFolder('${item.renderedFile.replace(/\\/g, '\\\\')}')" title="Mở file video đã xuất">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          </button>
        ` : ''}
        <button class="btn btn-secondary btn-sm" onclick="deleteQueueItem('${item.id}')" title="Xóa">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    `;

    const chk = row.querySelector('.chk-video-item');
    chk.addEventListener('change', () => {
      item.selected = chk.checked;
      selectedCountText.innerText = videoQueue.filter(v => v.selected).length;
    });

    queueList.appendChild(row);
  });
}

window.deleteQueueItem = (id) => {
  videoQueue = videoQueue.filter(v => v.id !== id);
  renderQueueTable();
};

window.openFileInFolder = async (filePath) => {
  if (filePath && window.api) {
    await window.api.openDirectory(filePath);
  }
};

function filterQueueByPlatform(platform) {
  const rows = document.querySelectorAll('.table-row');
  rows.forEach(r => {
    const id = r.id.replace('row_', '');
    const item = videoQueue.find(v => v.id === id);
    if (!item) return;

    if (platform === 'all' || item.platform.toLowerCase() === platform.toLowerCase()) {
      r.style.display = 'grid';
    } else {
      r.style.display = 'none';
    }
  });
}

// Lắng nghe tiến trình thời gian thực
function initProgressTracker() {
  if (!window.api || !window.api.onProgress) return;

  window.api.onProgress((data) => {
    const item = videoQueue.find(v => v.id === data.taskId);
    if (!item) return;

    if (data.type === 'download') {
      item.status = 'downloading';
      item.progress = Math.round(data.percent || 0);
      item.speed = data.speed || '';
      item.eta = data.eta || '';
    } else if (data.type === 'render') {
      item.status = 'rendering';
      item.progress = Math.round(data.percent || 0);
      item.speed = data.speed || '';
    }
    renderQueueTable();
  });
}

// Bắt đầu xử lý hàng loạt
async function startBatchExecution(isTest15s = false) {
  const selectedItems = videoQueue.filter(v => v.selected && v.status !== 'completed');
  if (selectedItems.length === 0) {
    alert('Vui lòng chọn ít nhất 1 video để xử lý!');
    return;
  }

  isBatchRunning = true;
  const btnBatch = document.getElementById('btnBatchExecute');
  const originalText = btnBatch.innerHTML;
  btnBatch.innerHTML = `<span>⏳ ĐANG XỬ LÝ...</span>`;

  const outputDir = document.getElementById('inputOutputDir').value;
  const isAiDubbing = document.getElementById('toggleAiDubbing').checked;
  const selectedVoice = document.getElementById('selectVoice').value;
  const isRenderConfig = document.getElementById('toggleRenderConfig').checked;
  const mirrorFlip = document.getElementById('chkMirrorFlip').checked;
  const addNoise = document.getElementById('chkAddNoise').checked;
  const tweakPitch = document.getElementById('chkTweakPitch').checked;
  const stripMetadata = document.getElementById('chkStripMeta').checked;
  const watermarkText = document.getElementById('inputWatermark').value;
  const titleHookText = document.getElementById('inputTitleHook').value;

  for (const item of selectedItems) {
    try {
      // 1. Tải video
      item.status = 'downloading';
      renderQueueTable();

      const dlResult = await window.api.downloadVideo(item.url, {
        taskId: item.id,
        outputDir
      });

      item.downloadedFile = dlResult.filePath;
      if (!item.downloadedFile) {
        throw new Error('Không tìm thấy file tải về.');
      }

      let audioForRender = null;
      let assSubtitlePath = null;

      // 2. Chuyển ngữ & Lồng tiếng AI (Nếu bật)
      if (isAiDubbing) {
        item.status = 'dubbing';
        renderQueueTable();

        const baseName = item.id;
        const voiceMp3 = `${outputDir}\\${baseName}_voice.mp3`;
        const subAss = `${outputDir}\\${baseName}_sub.ass`;
        const mixedAudio = `${outputDir}\\${baseName}_mixed.aac`;

        // Lồng tiếng bằng Edge-TTS
        const speechText = `${item.title}. Khám phá ngay video này để biết thêm chi tiết thú vị!`;
        const ttsRes = await window.api.synthesizeVoice(speechText, selectedVoice, voiceMp3);

        // Tạo phụ đề Karaoke ASS
        assSubtitlePath = await window.api.generateAss(ttsRes.cues || [], subAss, {
          fontName: 'Roboto',
          fontSize: 38
        });

        // Hòa trộn Ducking Audio
        audioForRender = await window.api.mixAudioDucking(item.downloadedFile, voiceMp3, mixedAudio, 0.18);
      }

      // 3. Render video qua FFmpeg
      item.status = 'rendering';
      renderQueueTable();

      const renderedFile = `${outputDir}\\Kenzious_${item.id}_${isTest15s ? 'preview' : 'final'}.mp4`;

      const renderOpts = {
        taskId: item.id,
        testRender: isTest15s,
        frameMode: isRenderConfig ? 'vertical-blur' : 'keep',
        mirrorFlip,
        addNoise,
        cropPercent: 1.5,
        tweakPitch,
        stripMetadata,
        watermarkText: watermarkText || '',
        watermarkPos: 'bottom-right',
        titleHookEnabled: !!titleHookText,
        titleHookText: titleHookText || '',
        externalAudioPath: audioForRender,
        assSubtitlePath
      };

      const rndResult = await window.api.renderVideo(item.downloadedFile, renderedFile, renderOpts);
      item.renderedFile = rndResult.outputPath;
      item.status = 'completed';
      renderQueueTable();

      // Nếu chỉ test 15s thì dừng sau video đầu tiên
      if (isTest15s) break;

    } catch (err) {
      console.error(`Error processing ${item.id}:`, err);
      item.status = 'failed';
      renderQueueTable();
    }
  }

  isBatchRunning = false;
  btnBatch.innerHTML = originalText;
  alert(isTest15s ? 'Đã hoàn thành Render thử 15 giây đầu!' : 'Đã hoàn tất xử lý danh sách video!');
}

function initGuideModal() {
  const modalGuide = document.getElementById('modalGuide');
  const btnCloseGuide = document.getElementById('btnCloseGuideModal');
  const btnCloseFooter = document.getElementById('btnCloseGuideFooter');

  const cardRender = document.getElementById('cardGuideRender');
  const cardMulti = document.getElementById('cardGuideMulti');
  const cardAI = document.getElementById('cardGuideAI');
  const cardSupport = document.getElementById('cardGuideSupport');

  const guideTabs = document.querySelectorAll('.guide-tab-btn');
  const guideSections = document.querySelectorAll('.guide-section');

  function openGuideSection(targetId) {
    if (!modalGuide) return;
    modalGuide.classList.add('active');
    guideTabs.forEach(t => {
      if (t.getAttribute('data-target') === targetId) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
    guideSections.forEach(s => {
      if (s.id === targetId) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });
  }

  if (cardRender) cardRender.addEventListener('click', () => openGuideSection('guide-sec-render'));
  if (cardMulti) cardMulti.addEventListener('click', () => openGuideSection('guide-sec-multi'));
  if (cardAI) cardAI.addEventListener('click', () => openGuideSection('guide-sec-ai'));
  if (cardSupport) cardSupport.addEventListener('click', () => openGuideSection('guide-sec-support'));

  guideTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      openGuideSection(target);
    });
  });

  const closeGuide = () => {
    if (modalGuide) modalGuide.classList.remove('active');
  };
  if (btnCloseGuide) btnCloseGuide.addEventListener('click', closeGuide);
  if (btnCloseFooter) btnCloseFooter.addEventListener('click', closeGuide);
}

window.copyContactInfo = (info) => {
  navigator.clipboard.writeText(info).then(() => {
    alert(`Đã sao chép vào bộ nhớ tạm:\n${info}`);
  }).catch(() => {
    prompt('Sao chép thông tin liên hệ:', info);
  });
};

