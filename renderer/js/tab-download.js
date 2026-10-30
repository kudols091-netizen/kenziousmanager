function hexToAssColor(hex) {
  if (!hex || typeof hex !== 'string') return '&H00FFFFFF';
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  if (clean.length !== 6) return '&H00FFFFFF';
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
}

// Tab 1: Download & Render Manager (Clean-Room High-Performance Controller)
let videoQueue = [];
let isBatchRunning = false;
let presetList = [];

// Built-in Presets Matrix (Synchronized with Kenzious Core Storage)
const DEFAULT_PRESET_CONFIGS = {
  tiktok_viral: {
    id: 'tiktok_viral',
    name: 'TikTok Viral (9:16 Vertical Blur + Karaoke Sub)',
    frameMode: 'vertical-blur',
    mirrorFlip: false,
    addNoise: true,
    tweakPitch: true,
    stripMetadata: true,
    watermarkText: '@KenziousReel',
    titleHookEnabled: true,
    titleHookText: 'BÍ MẬT KHÔNG THỂ BỎ LỠ ⚡',
    aiDubbing: false
  },
  youtube_shorts: {
    id: 'youtube_shorts',
    name: 'YouTube Shorts Clean (9:16 + Watermark)',
    frameMode: 'vertical-blur',
    mirrorFlip: false,
    addNoise: false,
    tweakPitch: false,
    stripMetadata: true,
    watermarkText: 'KENZIOUS SHORTS',
    titleHookEnabled: false,
    titleHookText: '',
    aiDubbing: false
  },
  anti_copyright_heavy: {
    id: 'anti_copyright_heavy',
    name: 'Lách Bản Quyền Cực Mạnh (Flip + Noise + Crop + Audio)',
    frameMode: 'vertical-blur',
    mirrorFlip: true,
    addNoise: true,
    tweakPitch: true,
    stripMetadata: true,
    watermarkText: '@KenziousPro',
    titleHookEnabled: true,
    titleHookText: 'XEM ĐẾN CUỐI ĐỂ BIẾT SỰ THẬT 🔥',
    aiDubbing: false
  },
  original_ratio: {
    id: 'original_ratio',
    name: 'Giữ Nguyên Tỉ Lệ Gốc (Chỉ Lồng Tiếng AI)',
    frameMode: 'keep',
    mirrorFlip: false,
    addNoise: false,
    tweakPitch: false,
    stripMetadata: true,
    watermarkText: '',
    titleHookEnabled: false,
    titleHookText: '',
    aiDubbing: true
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await initPresetsAndSettings();
  initDownloadTab();
  initAddVideoModal();
  initProgressTracker();
  initGuideModal();
  initDragAndDrop();
});

async function initPresetsAndSettings() {
  const inputOutputDir = document.getElementById('inputOutputDir');
  if (window.api && window.api.getSettings) {
    try {
      const s = await window.api.getSettings();
      if (s && s.outputDir && inputOutputDir) {
        inputOutputDir.value = s.outputDir;
      }
    } catch (e) {
      console.warn('Could not load settings:', e);
    }
  }

  if (window.api && window.api.getPresets) {
    try {
      const presets = await window.api.getPresets();
      if (Array.isArray(presets) && presets.length > 0) {
        presetList = presets;
      }
    } catch (e) {
      console.warn('Could not load presets from storage:', e);
    }
  }
}

function initDownloadTab() {
  const toggleAi = document.getElementById('toggleAiDubbing');
  const aiCollapse = document.getElementById('aiOptionsCollapse');
  const toggleRender = document.getElementById('toggleRenderConfig');
  const renderCollapse = document.getElementById('renderOptionsCollapse');
  const renderDesc = document.getElementById('renderConfigDesc');

  const selectPreset = document.getElementById('selectPreset');
  const chkMirrorFlip = document.getElementById('chkMirrorFlip');
  const chkAddNoise = document.getElementById('chkAddNoise');
  const chkTweakPitch = document.getElementById('chkTweakPitch');
  const chkStripMeta = document.getElementById('chkStripMeta');
  const inputWatermark = document.getElementById('inputWatermark');
  const inputTitleHook = document.getElementById('inputTitleHook');

  // Toggle Handlers
  if (toggleAi && aiCollapse) {
    toggleAi.addEventListener('change', () => {
      aiCollapse.style.display = toggleAi.checked ? 'flex' : 'none';
    });
  }

  if (toggleRender && renderCollapse && renderDesc) {
    toggleRender.addEventListener('change', () => {
      renderCollapse.style.display = toggleRender.checked ? 'flex' : 'none';
      renderDesc.innerText = toggleRender.checked 
        ? 'Đang bật — Tự động căn chỉnh dọc 9:16 vertical blur và áp dụng bộ lọc lách bản quyền.'
        : 'Đang tắt — Video giữ nguyên tỉ lệ và định dạng mặc định.';
    });
  }

  // Preset Switcher Logic
  function applyPreset(presetKey) {
    let p = (presetList && presetList.find(x => x.id === presetKey)) || DEFAULT_PRESET_CONFIGS[presetKey];
    if (!p) return;

    if (toggleRender && renderCollapse && renderDesc) {
      const isVertical = p.frameMode === 'vertical-blur';
      toggleRender.checked = isVertical;
      renderCollapse.style.display = isVertical ? 'flex' : 'none';
      renderDesc.innerText = isVertical 
        ? 'Đang bật — Tự động căn chỉnh dọc 9:16 vertical blur và áp dụng bộ lọc lách bản quyền.'
        : 'Đang tắt — Video giữ nguyên tỉ lệ và định dạng mặc định.';
    }

    if (chkMirrorFlip) chkMirrorFlip.checked = !!p.mirrorFlip;
    if (chkAddNoise) chkAddNoise.checked = !!p.addNoise;
    if (chkTweakPitch) chkTweakPitch.checked = !!p.tweakPitch;
    if (chkStripMeta) chkStripMeta.checked = !!p.stripMetadata;
    if (inputWatermark) inputWatermark.value = p.watermarkText || '';
    if (inputTitleHook) inputTitleHook.value = p.titleHookEnabled ? (p.titleHookText || '') : '';

    if (p.aiDubbing !== undefined && toggleAi && aiCollapse) {
      toggleAi.checked = !!p.aiDubbing;
      aiCollapse.style.display = toggleAi.checked ? 'flex' : 'none';
    }
  }

  if (selectPreset) {
    selectPreset.addEventListener('change', () => {
      applyPreset(selectPreset.value);
    });
    // Sync initial state
    applyPreset(selectPreset.value);
  }

  // Output Directory Pick & Open
  const btnBrowseOutputDir = document.getElementById('btnBrowseOutputDir');
  const btnOpenOutputDir = document.getElementById('btnOpenOutputDir');
  const inputOutputDir = document.getElementById('inputOutputDir');

  if (btnBrowseOutputDir) {
    btnBrowseOutputDir.addEventListener('click', async () => {
      if (!window.api || !window.api.pickDirectory) return;
      const dir = await window.api.pickDirectory();
      if (dir) {
        inputOutputDir.value = dir;
        await window.api.saveSettings({ outputDir: dir });
      }
    });
  }

  if (btnOpenOutputDir) {
    btnOpenOutputDir.addEventListener('click', async () => {
      const dir = inputOutputDir ? inputOutputDir.value : '';
      if (dir && window.api && window.api.openDirectory) {
        await window.api.openDirectory(dir);
      }
    });
  }

  // Select all checkbox
  const chkSelectAll = document.getElementById('chkSelectAllVideos');
  if (chkSelectAll) {
    chkSelectAll.addEventListener('change', () => {
      const checked = chkSelectAll.checked;
      videoQueue.forEach(v => v.selected = checked);
      renderQueueTable();
    });
  }

  // Delete selected
  const btnDeleteSelected = document.getElementById('btnDeleteSelectedVideos');
  if (btnDeleteSelected) {
    btnDeleteSelected.addEventListener('click', () => {
      videoQueue = videoQueue.filter(v => !v.selected);
      renderQueueTable();
    });
  }

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
  if (btnBatchExecute) {
    btnBatchExecute.addEventListener('click', () => {
      if (isBatchRunning) {
        alert('Tiến trình đang chạy!');
        return;
      }
      startBatchExecution(false);
    });
  }

  // Test Render 15s
  const btnTestRender = document.getElementById('btnTestRender15s');
  if (btnTestRender) {
    btnTestRender.addEventListener('click', () => {
      if (isBatchRunning) {
        alert('Tiến trình đang chạy!');
        return;
      }
      startBatchExecution(true);
    });
  }
}

// Modal Thêm Video / Kênh
function initAddVideoModal() {
  const modal = document.getElementById('modalAddVideo');
  const btnOpen = document.getElementById('btnOpenAddModal');
  const btnClose = document.getElementById('btnCloseAddModal');
  const btnCancel = document.getElementById('btnCancelAddModal');
  const btnConfirm = document.getElementById('btnConfirmAddVideos');
  const textarea = document.getElementById('textareaVideoUrls');
  const countLabel = document.getElementById('detectedUrlsCount');

  const btnPickLocalFiles = document.getElementById('btnPickLocalFiles');
  const btnPickLocalFolder = document.getElementById('btnPickLocalFolder');

  if (btnOpen && modal) {
    btnOpen.addEventListener('click', () => {
      modal.classList.add('active');
      if (textarea) textarea.value = '';
      if (countLabel) countLabel.innerText = 'Đã nhận diện: 0 liên kết';
      if (textarea) textarea.focus();
    });
  }

  const closeModal = () => {
    if (modal) modal.classList.remove('active');
  };

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  if (textarea && countLabel) {
    textarea.addEventListener('input', () => {
      const urls = parseUrls(textarea.value);
      const channelUrls = urls.filter(u => isExplicitChannelLink(u));

      let redirectNote = document.getElementById('channelRedirectAlert');
      if (channelUrls.length > 0) {
        if (!redirectNote) {
          redirectNote = document.createElement('div');
          redirectNote.id = 'channelRedirectAlert';
          redirectNote.style = 'margin-top: 10px; margin-bottom: 8px; padding: 10px 14px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; font-size: 12px; color: #f59e0b; display: flex; align-items: center; justify-content: space-between; gap: 8px;';
          textarea.parentNode.insertBefore(redirectNote, countLabel);
        }
        redirectNote.innerHTML = `
          <span>⚠️ Phát hiện ${channelUrls.length} link kênh / danh sách (${channelUrls[0]}). Hệ thống hỗ trợ chuyển sang Tab 2 (Quét Kênh).</span>
          <button type="button" id="btnSwitchToChannelTab" style="background: #f59e0b; color: #000; border: none; padding: 5px 12px; border-radius: 5px; font-weight: 700; cursor: pointer; white-space: nowrap; font-size: 11px;">Chuyển Quét Kênh</button>
        `;
        redirectNote.style.display = 'flex';

        const btnSwitch = document.getElementById('btnSwitchToChannelTab');
        if (btnSwitch) {
          btnSwitch.onclick = () => {
            closeModal();
            const tabBtn = document.querySelector('[data-tab="tab-channels"]');
            if (tabBtn) tabBtn.click();
            const chInput = document.getElementById('inputChannelUrl') || document.querySelector('#tab-channels input[type="text"]');
            if (chInput) {
              chInput.value = channelUrls[0];
              chInput.focus();
            }
          };
        }
      } else if (redirectNote) {
        redirectNote.style.display = 'none';
      }

      countLabel.innerText = `Đã nhận diện: ${urls.length} liên kết` + (channelUrls.length > 0 ? ` (${channelUrls.length} link kênh)` : '');
    });
  }

  // Chọn video từ máy
  if (btnPickLocalFiles) {
    btnPickLocalFiles.addEventListener('click', async () => {
      if (!window.api || !window.api.pickFile) return;
      try {
        const files = await window.api.pickFile([
          { name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'flv'] }
        ]);
        if (files && files.length > 0) {
          closeModal();
          addLocalFilesToQueue(files);
        }
      } catch (err) {
        console.error('Lỗi chọn file cục bộ:', err);
      }
    });
  }

  // Chọn cả thư mục video
  if (btnPickLocalFolder) {
    btnPickLocalFolder.addEventListener('click', async () => {
      if (!window.api || !window.api.pickDirectory) return;
      try {
        const dir = await window.api.pickDirectory();
        if (dir) {
          closeModal();
          let clips = [];
          if (window.api.scanFolderClips) {
            clips = await window.api.scanFolderClips(dir);
          }
          if (clips && clips.length > 0) {
            addLocalClipsToQueue(clips);
          } else {
            alert('Không tìm thấy tệp video (.mp4, .mov, .mkv) trong thư mục đã chọn!');
          }
        }
      } catch (err) {
        console.error('Lỗi quét thư mục:', err);
      }
    });
  }

  if (btnConfirm && textarea) {
    btnConfirm.addEventListener('click', async () => {
      const urls = parseUrls(textarea.value);
      if (urls.length === 0) {
        alert('Vui lòng dán ít nhất 1 liên kết video hoặc kênh hợp lệ!');
        return;
      }

      closeModal();
      addUrlsToQueue(urls);
    });
  }
}

function initDragAndDrop() {
  const dropZone = document.getElementById('tab-download');
  if (!dropZone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.border = '2px dashed var(--brand-magenta)';
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.border = '';
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;

    const filePaths = Array.from(dt.files)
      .map(f => f.path)
      .filter(p => p && /\.(mp4|mov|mkv|webm|avi|flv)$/i.test(p));

    if (filePaths.length > 0) {
      addLocalFilesToQueue(filePaths);
    }
  });
}

function parseUrls(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const results = [];
  const httpRegex = /https?:\/\/[^\s]+/i;
  const magnetRegex = /magnet:\?[^\s]+/i;

  for (const line of lines) {
    const magnetMatch = line.match(magnetRegex);
    const httpMatch = line.match(httpRegex);
    if (magnetMatch && magnetMatch[0]) {
      results.push(magnetMatch[0].trim());
    } else if (httpMatch && httpMatch[0]) {
      results.push(httpMatch[0].trim());
    }
  }
  return results;
}

function detectPlatform(url) {
  if (!url) return 'Video';
  const u = url.toLowerCase();
  if (u.startsWith('magnet:') || u.endsWith('.torrent')) return 'WebTorrent';
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'Facebook';
  if (u.includes('instagram.com')) return 'Instagram';
  if (u.includes('douyin.com')) return 'Douyin';
  if (u.includes('bilibili.com')) return 'Bilibili';
  if (u.includes('xiaohongshu.com') || u.includes('xhslink.com')) return 'Red Note';
  return 'Video';
}

function isExplicitChannelLink(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const url = raw.trim();
  try {
    const u2 = new URL(url);
    const host = u2.hostname.replace(/^www\./, '').toLowerCase();
    const path = u2.pathname;
    const parts = path.split('/').filter(Boolean);

    // YouTube: /@channel, /channel/..., /c/..., /user/..., /playlist?list=...
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      return /^\/@[^/]+/.test(path) || /^\/(channel|c|user)\/[^/]+/.test(path) || (path.startsWith('/playlist') && u2.searchParams.has('list'));
    }
    // TikTok: /@username
    if (host.endsWith('tiktok.com')) {
      return /^\/@[^/]+\/?$/.test(path);
    }
    // Douyin: /user/...
    if (host.endsWith('douyin.com')) {
      return /^\/user\/[^/]+/.test(path) && !/\/video\//.test(path);
    }
    // Xiaohongshu / RedNote: /user/profile/...
    if (host.includes('xiaohongshu.com') || host.includes('rednote.com')) {
      return /^\/user\/profile\/[^/]+/.test(path);
    }
    // Bilibili: /space/...
    if (host.startsWith('space.bilibili.com')) return /^\/\d+/.test(path);
    if (host.endsWith('bilibili.com')) return /^\/space\/\d+/.test(path);

    // Facebook Page / Profile
    if (host.endsWith('facebook.com')) {
      if (path.startsWith('/profile.php')) return u2.searchParams.has('id') && !u2.searchParams.has('v');
      const FB_NON_PROFILE_ROOTS = new Set(['watch', 'reel', 'reels', 'videos', 'stories', 'photo', 'share', 'groups']);
      if (!parts.length || FB_NON_PROFILE_ROOTS.has(parts[0].toLowerCase())) return false;
      if (parts.length === 1) return true;
      return parts.length === 2 && ['reels', 'videos'].includes(parts[1].toLowerCase());
    }
    if (host.endsWith('instagram.com')) {
      const IG_NON_PROFILE = new Set(['p', 'reel', 'reels', 'stories', 'direct', 'explore']);
      if (!parts.length || IG_NON_PROFILE.has(parts[0].toLowerCase())) return false;
      return parts.length === 1;
    }
  } catch {}
  return false;
}

function isChannelUrl(url) {
  return isExplicitChannelLink(url);
}

function addLocalFilesToQueue(files) {
  files.forEach(filePath => {
    const parts = filePath.split(/[\\/]/);
    const fileName = parts[parts.length - 1];
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    const id = `vid_local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const item = {
      id,
      url: filePath,
      title: baseName,
      platform: 'Local',
      uploader: 'Tệp từ máy',
      thumbnail: '',
      duration: '0:00',
      status: 'pending',
      progress: 0,
      speed: '',
      eta: '',
      selected: true,
      isLocal: true,
      downloadedFile: filePath,
      renderedFile: null
    };

    videoQueue.push(item);

    // Background duration probe
    if (window.api && window.api.getVideoMetadata) {
      window.api.getVideoMetadata(filePath).then(meta => {
        if (meta && meta.duration) {
          const dur = Math.round(meta.duration);
          item.duration = `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`;
          renderQueueTable();
        }
      }).catch(() => {});
    }

    // Background thumbnail probe
    if (window.api && window.api.getVideoThumbnail) {
      window.api.getVideoThumbnail(filePath).then(thumb => {
        if (thumb) {
          item.thumbnail = thumb;
          renderQueueTable();
        }
      }).catch(() => {});
    }
  });

  renderQueueTable();
}

function addLocalClipsToQueue(clips) {
  clips.forEach(clip => {
    const filePath = typeof clip === 'string' ? clip : (clip.filePath || clip.mediaPath || '');
    if (!filePath) return;
    const parts = filePath.split(/[\\/]/);
    const fileName = parts[parts.length - 1];
    const title = (clip && clip.title) || fileName.replace(/\.[^/.]+$/, '');
    const id = `vid_local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const item = {
      id,
      url: filePath,
      title: title,
      platform: 'Local',
      uploader: 'Thư mục máy',
      thumbnail: (clip && clip.thumbnail) || '',
      duration: (clip && clip.duration) || '0:00',
      status: 'pending',
      progress: 0,
      speed: '',
      eta: '',
      selected: true,
      isLocal: true,
      downloadedFile: filePath,
      renderedFile: null
    };

    videoQueue.push(item);
  });

  renderQueueTable();
}

function addUrlsToQueue(urls) {
  urls.forEach(url => {
    const isChannel = isChannelUrl(url);

    // Khi người dùng dán liên kết kênh / playlist
    if (isChannel && window.api && window.api.scanChannel) {
      const tempId = `ch_scan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const platform = detectPlatform(url);

      const scanItem = {
        id: tempId,
        url,
        title: `Đang quét kênh ${platform}...`,
        platform,
        uploader: 'Đang trích xuất danh sách video...',
        thumbnail: '',
        duration: '--:--',
        status: 'pending',
        progress: 0,
        speed: 'Scanning',
        eta: '',
        selected: false,
        isLocal: false,
        downloadedFile: null,
        renderedFile: null
      };

      videoQueue.push(scanItem);
      renderQueueTable();

      window.api.scanChannel(url, 20).then(res => {
        videoQueue = videoQueue.filter(v => v.id !== tempId);
        if (res && res.entries && res.entries.length > 0) {
          res.entries.forEach(entry => {
            const id = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const dur = Math.round(entry.duration || 0);
            videoQueue.push({
              id,
              url: entry.url,
              title: entry.title || `${platform} Video`,
              platform: entry.platform || platform,
              uploader: entry.uploader || res.uploader || 'Creator',
              thumbnail: entry.thumbnail || '',
              duration: dur > 0 ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : '0:00',
              status: 'pending',
              progress: 0,
              speed: '',
              eta: '',
              selected: true,
              isLocal: false,
              downloadedFile: null,
              renderedFile: null
            });
          });
        }
        renderQueueTable();
      }).catch(err => {
        scanItem.title = `Lỗi quét kênh: ${url}`;
        scanItem.uploader = err.message || 'Lỗi yt-dlp';
        scanItem.status = 'failed';
        renderQueueTable();
      });

      return;
    }

    // Video đơn lẻ
    const platform = detectPlatform(url);
    const id = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const item = {
      id,
      url,
      title: `${platform} Video [${id.slice(-4)}]`,
      platform,
      uploader: 'Đang chờ quét...',
      thumbnail: '',
      duration: '0:00',
      status: 'pending',
      progress: 0,
      speed: '',
      eta: '',
      selected: true,
      isLocal: false,
      downloadedFile: null,
      renderedFile: null
    };

    videoQueue.push(item);

    // Tự động quét thông tin video ở background
    if (window.api && window.api.getVideoInfo) {
      window.api.getVideoInfo(url).then(info => {
        const it = videoQueue.find(v => v.id === id);
        if (it && info) {
          it.title = info.title || it.title;
          it.uploader = info.uploader || it.uploader;
          it.thumbnail = info.thumbnail || it.thumbnail;
          const dur = Math.round(info.duration || 0);
          if (dur > 0) {
            it.duration = `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`;
          }
          renderQueueTable();
        }
      }).catch(() => {});
    }
  });

  renderQueueTable();
}

function renderQueueTable() {
  const emptyState = document.getElementById('emptyQueueState');
  const queueWrapper = document.getElementById('videoQueueWrapper');
  const queueList = document.getElementById('videoQueueList');
  const selectedCountText = document.getElementById('selectedCountText');

  const selectedCount = videoQueue.filter(v => v.selected).length;
  if (selectedCountText) selectedCountText.innerText = selectedCount;

  if (videoQueue.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    if (queueWrapper) queueWrapper.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (queueWrapper) queueWrapper.style.display = 'flex';
  if (!queueList) return;

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

    let thumbSrc = '';
    if (item.thumbnail) {
      if (item.thumbnail.startsWith('data:') || item.thumbnail.startsWith('http')) {
        thumbSrc = item.thumbnail;
      } else {
        thumbSrc = 'file:///' + item.thumbnail.replace(/\\/g, '/');
      }
    }

    row.innerHTML = `
      <div><input type="checkbox" class="chk-video-item" data-id="${escHtml(item.id)}" ${item.selected ? 'checked' : ''}></div>
      <div>
        <div class="thumb-preview">
          ${KZ.safeUrl(thumbSrc) ? `<img src="${KZ.safeUrl(thumbSrc)}" alt="Thumbnail" data-img-fallback="text" data-fallback-text="🎬">` : '🎬'}
        </div>
      </div>
      <div class="video-info-cell">
        <span class="video-title" title="${escHtml(item.title)}">${escHtml(item.title)}</span>
        <span class="video-uploader">${escHtml(item.uploader)} • ${escHtml(item.duration)}</span>
        ${(item.status === 'downloading' || item.status === 'rendering') ? `
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${item.progress}%;"></div>
          </div>
          <span style="font-size: 10.5px; color: var(--text-muted);">${escHtml(item.speed)} ${item.eta ? '• ETA: ' + escHtml(item.eta) : ''}</span>
        ` : ''}
      </div>
      <div>
        <span style="font-size: 12.5px; font-weight: 600; color: var(--brand-magenta);">${escHtml(item.platform)}</span>
      </div>
      <div>${statusBadge}</div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        ${item.renderedFile ? `
          <button class="btn btn-secondary btn-sm" data-action="openFileInFolder" data-path="${escHtml(item.renderedFile)}" title="Mở file video đã xuất">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          </button>
        ` : ''}
        <button class="btn btn-secondary btn-sm" data-action="deleteQueueItem" data-id="${escHtml(item.id)}" title="Xóa">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    `;

    const chk = row.querySelector('.chk-video-item');
    if (chk) {
      chk.addEventListener('change', () => {
        item.selected = chk.checked;
        if (selectedCountText) {
          selectedCountText.innerText = videoQueue.filter(v => v.selected).length;
        }
      });
    }

    queueList.appendChild(row);
  });
}

KZ.action('deleteQueueItem', (el) => window.deleteQueueItem(el.dataset.id));
KZ.action('openFileInFolder', (el) => window.openFileInFolder(el.dataset.path));

window.deleteQueueItem = (id) => {
  videoQueue = videoQueue.filter(v => v.id !== id);
  renderQueueTable();
};

window.openFileInFolder = async (filePath) => {
  if (filePath && window.api && window.api.openDirectory) {
    await window.api.openDirectory(filePath);
  }
};

function filterQueueByPlatform(platform) {
  const normTarget = (platform || 'all').toLowerCase().replace(/[\s_-]+/g, '');
  const rows = document.querySelectorAll('.table-row');
  rows.forEach(r => {
    const id = r.id.replace('row_', '');
    const item = videoQueue.find(v => v.id === id);
    if (!item) return;

    const normItem = (item.platform || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (normTarget === 'all' || normItem === normTarget) {
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
  const originalText = btnBatch ? btnBatch.innerHTML : '⚡ XỬ LÝ HÀNG LOẠT';
  if (btnBatch) btnBatch.innerHTML = `<span>⏳ ĐANG XỬ LÝ...</span>`;

  const inputOutputDir = document.getElementById('inputOutputDir');
  // Ô trống → dùng thư mục output trong settings (main tự chọn mặc định theo máy, không hard-code ổ D:)
  const outputDir = (inputOutputDir && inputOutputDir.value)
    ? inputOutputDir.value
    : ((await window.api.getSettings().catch(() => null)) || {}).outputDir;
  if (!outputDir) {
    alert('Chưa có Thư mục xuất. Vào Cài đặt → Thư mục xuất (hoặc nhập ô "Thư mục xuất" bên dưới) rồi thử lại.');
    isBatchRunning = false;
    if (btnBatch) btnBatch.innerHTML = originalText;
    return;
  }
  const isAiDubbing = document.getElementById('toggleAiDubbing') ? document.getElementById('toggleAiDubbing').checked : false;
  const selectVoice = document.getElementById('selectVoice');
  const selectedVoice = selectVoice ? selectVoice.value : 'vi-VN-HoaiMyNeural';
  const isRenderConfig = document.getElementById('toggleRenderConfig') ? document.getElementById('toggleRenderConfig').checked : true;
  const mirrorFlip = document.getElementById('chkMirrorFlip') ? document.getElementById('chkMirrorFlip').checked : false;
  const addNoise = document.getElementById('chkAddNoise') ? document.getElementById('chkAddNoise').checked : true;
  const tweakPitch = document.getElementById('chkTweakPitch') ? document.getElementById('chkTweakPitch').checked : true;
  const stripMetadata = document.getElementById('chkStripMeta') ? document.getElementById('chkStripMeta').checked : true;
  const inputWatermark = document.getElementById('inputWatermark');
  const watermarkText = inputWatermark ? inputWatermark.value : '';
  const inputTitleHook = document.getElementById('inputTitleHook');
  const titleHookText = inputTitleHook ? inputTitleHook.value : '';

  for (const item of selectedItems) {
    try {
      // 1. Tải video (Nếu là file cục bộ thì bỏ qua bước tải)
      if (item.isLocal && item.downloadedFile) {
        item.status = 'downloading';
        item.progress = 100;
        item.speed = 'Local File';
        renderQueueTable();
      } else {
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
      }

      let audioForRender = null;
      let assSubtitlePath = null;

      // 2. Chuyển ngữ & Lồng tiếng AI (Nếu bật)
      if (isAiDubbing && window.api.synthesizeVoice) {
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
        if (window.api.generateAss) {
          let subCfg = {};
          if (window.api.getSettings) {
            try {
              const s = await window.api.getSettings();
              subCfg = s?.subtitleConfig || {};
            } catch (e) {}
          }
          assSubtitlePath = await window.api.generateAss(ttsRes.cues || [], subAss, {
            fontName: subCfg.fontName || 'Roboto',
            fontSize: subCfg.fontSize || 38,
            primaryColor: subCfg.primaryColor ? hexToAssColor(subCfg.primaryColor) : '&H00FFFFFF',
            secondaryColor: subCfg.highlightColor ? hexToAssColor(subCfg.highlightColor) : '&H005E3FF4'
          });
        }

        // Hòa trộn Sidechain Ducking Audio (-14dB BGM)
        if (window.api.mixAudioDucking) {
          audioForRender = await window.api.mixAudioDucking(item.downloadedFile, voiceMp3, mixedAudio, { bgVolume: 0.18 });
        }
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
      item.progress = 100;
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
  if (btnBatch) btnBatch.innerHTML = originalText;
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

KZ.action('copyContactInfo', (el) => window.copyContactInfo(el.dataset.copy));

window.copyContactInfo = (info) => {
  navigator.clipboard.writeText(info).then(() => {
    alert(`Đã sao chép vào bộ nhớ tạm:\n${info}`);
  }).catch(() => {
    prompt('Sao chép thông tin liên hệ:', info);
  });
};
