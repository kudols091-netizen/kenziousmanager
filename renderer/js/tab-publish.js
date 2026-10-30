// Tab 4: Batch Video Publishing & Auto-Poster Workspace Controller
// Clean-Room Implementation adhering 100% to Zoo Reup Studio UI Parity

let currentJob = {
  id: 'default_job',
  name: 'Chiến dịch xuất bản',
  clips: [],
  channels: [],
  settings: {
    videoOrderMode: 'sequential', // 'sequential' | 'random'
    intervalRandom: { min: 15, max: 20 },
    postTimeoutMin: 5,
    parallelThreads: 1,
    postVideoToAllChannels: true,
    skipDuplicateVideoPerChannel: true,
    aiRewriteCaption: false,
    aiCaptionLanguage: 'vi',
    showBrowser: false
  }
};

let allConnectedAccounts = [];
let editingClipId = null;
let setupDestAccountId = null;
let isPublishingRunning = false;
let isPublishPaused = false;          // Phiên hiện tại đã tạm dừng → nút chính sẽ Resume thay vì tạo phiên mới
let currentPublishSessionId = null;
let selectedAddChannelAccountIds = new Set();
let setupDestTempSelectedIds = new Set();

document.addEventListener('DOMContentLoaded', () => {
  initPublishTab();
});

let isPublishTabInitialized = false;

async function initPublishTab() {
  if (isPublishTabInitialized) return;
  isPublishTabInitialized = true;
  wireEventListeners();
  await loadAccountsData();
  await loadJobDraft();
  renderClipsList();
  renderChannelsList();
  renderSettings();
  updatePostMath();

  // Listen to real-time progress events from Main process
  if (window.api && window.api.onProgress) {
    window.api.onProgress((data) => {
      // Chỉ nhận sự kiện của publisher (main gắn type 'publish' hoặc session_*), bỏ qua progress render/download
      if (['publish', 'session_done', 'session_paused', 'session_error'].includes(data.type)) {
        handlePublishProgress(data);
      }
    });
  }
}

async function loadAccountsData() {
  try {
    if (window.api && window.api.getAccounts) {
      allConnectedAccounts = await window.api.getAccounts();
    }
  } catch (err) {
    console.warn('Failed to load accounts in Tab 4:', err.message);
  }
}

async function loadJobDraft() {
  try {
    if (window.api && window.api.getJobDraft) {
      const draft = await window.api.getJobDraft('default_job');
      if (draft) {
        currentJob.clips = draft.clips || [];
        currentJob.channels = draft.channels || [];
        currentJob.settings = { ...currentJob.settings, ...(draft.settings || {}) };
        
        // Asynchronously populate thumbnails for draft clips if missing
        if (currentJob.clips.length > 0 && window.api.getVideoThumbnail) {
          currentJob.clips.forEach(c => {
            if (!c.thumbnail && c.mediaPath) {
              window.api.getVideoThumbnail(c.mediaPath).then(th => {
                if (th) {
                  c.thumbnail = th;
                  renderClipsList();
                }
              }).catch(() => {});
            }
          });
        }
      }
    }
  } catch (err) {
    console.warn('Could not restore job draft:', err.message);
  }
}

function persistJobDraft() {
  if (window.api && window.api.saveJobDraft) {
    window.api.saveJobDraft(currentJob).catch(e => console.warn('Save draft failed:', e));
  }
}

function bindSingleClickListener(elementOrId, handler) {
  const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
  if (!el) return null;
  // Clone element to strip any rogue/duplicate listeners from other scripts
  const clean = el.cloneNode(true);
  el.replaceWith(clean);
  clean.dataset.bound = 'true';
  clean.addEventListener('click', handler);
  return clean;
}

function wireEventListeners() {
  // --- COLUMN 1: VIDEO SELECTION ---
  const btnClearClips = document.getElementById('btnClearClips');
  const chkSelectAllClips = document.getElementById('chkSelectAllClips');
  let isFolderPickingActive = false;
  let isVideoPickingActive = false;

  // Support both canonical and legacy/alias button IDs
  const pickFolderBtn = document.getElementById('btnPickFolder') || document.getElementById('btnAddFolderJob');
  const pickVideosBtn = document.getElementById('btnPickVideos') || document.getElementById('btnAddVideos') || document.getElementById('btnSelectVideos');

  if (pickFolderBtn) {
    bindSingleClickListener(pickFolderBtn, async () => {
      if (isFolderPickingActive) return;
      isFolderPickingActive = true;
      try {
        const dir = await window.api.pickDirectory();
        if (!dir) return;
        const scannedClips = await window.api.scanFolderClips(dir);
        if (scannedClips && scannedClips.length > 0) {
          const existingPaths = new Set(currentJob.clips.map(c => c.mediaPath));
          let added = 0;
          for (const c of scannedClips) {
            if (!existingPaths.has(c.mediaPath)) {
              currentJob.clips.push(c);
              added++;
            }
          }
          renderClipsList();
          updatePostMath();
          persistJobDraft();
          alert(`Đã thêm ${added} video từ thư mục!`);
        } else {
          alert('Không tìm thấy file video hợp lệ (.mp4, .mov, .mkv, .avi) trong thư mục.');
        }
      } catch (err) {
        alert('Lỗi nạp thư mục: ' + err.message);
      } finally {
        setTimeout(() => { isFolderPickingActive = false; }, 400);
      }
    });
  }

  if (pickVideosBtn) {
    bindSingleClickListener(pickVideosBtn, async () => {
      if (isVideoPickingActive) return;
      isVideoPickingActive = true;
      try {
        const files = await window.api.pickFile([
          { name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }
        ]);
        if (!files) return;
        const fileList = Array.isArray(files) ? files : [files];
        const existingPaths = new Set(currentJob.clips.map(c => c.mediaPath));
        let added = 0;

        for (const f of fileList) {
          if (!existingPaths.has(f)) {
            const fileName = f.split(/[\\/]/).pop();
            const defaultTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
            const newClip = {
              itemId: 'clip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
              mediaPath: f,
              title: defaultTitle,
              caption: `${defaultTitle} #kenzious #reels #xuhuong #viral`,
              selected: true,
              thumbnail: null
            };
            currentJob.clips.push(newClip);
            if (window.api && window.api.getVideoThumbnail) {
              window.api.getVideoThumbnail(f).then(th => {
                if (th) {
                  newClip.thumbnail = th;
                  renderClipsList();
                  persistJobDraft();
                }
              }).catch(() => {});
            }
            added++;
          }
        }

        renderClipsList();
        updatePostMath();
        persistJobDraft();
      } catch (err) {
        alert('Lỗi chọn video: ' + err.message);
      } finally {
        setTimeout(() => { isVideoPickingActive = false; }, 400);
      }
    });
  }

  if (btnClearClips) {
    btnClearClips.addEventListener('click', () => {
      if (confirm('Bạn có chắc muốn xóa toàn bộ video khỏi danh sách?')) {
        currentJob.clips = [];
        renderClipsList();
        updatePostMath();
        persistJobDraft();
      }
    });
  }

  if (chkSelectAllClips) {
    chkSelectAllClips.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      currentJob.clips.forEach(c => c.selected = isChecked);
      renderClipsList();
      updatePostMath();
      persistJobDraft();
    });
  }

  // --- COLUMN 2: CHANNEL SELECTION ---
  const btnCheckChannels = document.getElementById('btnCheckChannels');
  const btnAddChannel = document.getElementById('btnAddChannel');
  const inputChannelQuery = document.getElementById('inputChannelQuery');
  const selectChannelPlatformFilter = document.getElementById('selectChannelPlatformFilter');

  if (btnCheckChannels) {
    btnCheckChannels.addEventListener('click', async () => {
      if (currentJob.channels.length === 0) {
        alert('Chưa có kênh nào trong chiến dịch để kiểm tra.');
        return;
      }
      const icon = document.getElementById('iconCheckChannels');
      if (icon) icon.classList.add('spin');
      btnCheckChannels.disabled = true;

      try {
        await loadAccountsData();
        for (const ch of currentJob.channels) {
          if (window.api.checkAccountStatus) {
            await window.api.checkAccountStatus(ch.accountId);
          }
        }
        await loadAccountsData();
        renderChannelsList();
      } catch (err) {
        console.warn('Check channels error:', err);
      } finally {
        if (icon) icon.classList.remove('spin');
        btnCheckChannels.disabled = false;
      }
    });
  }

  if (btnAddChannel) {
    btnAddChannel.addEventListener('click', () => {
      openAddChannelModal();
    });
  }

  if (inputChannelQuery) {
    inputChannelQuery.addEventListener('input', () => renderChannelsList());
  }

  if (selectChannelPlatformFilter) {
    selectChannelPlatformFilter.addEventListener('change', () => renderChannelsList());
  }

  // --- COLUMN 3: SETTINGS ---
  const btnOrderSequential = document.getElementById('btnOrderSequential');
  const btnOrderRandom = document.getElementById('btnOrderRandom');
  const inputJitterMin = document.getElementById('inputJitterMin');
  const inputJitterMax = document.getElementById('inputJitterMax');
  const inputPostTimeout = document.getElementById('inputPostTimeout');
  const inputParallelThreads = document.getElementById('inputParallelThreads');
  const chkPostToAllChannels = document.getElementById('chkPostToAllChannels');
  const chkSkipDuplicateVideo = document.getElementById('chkSkipDuplicateVideo');
  const chkAiRewriteCaption = document.getElementById('chkAiRewriteCaption');
  const selectAiCaptionLang = document.getElementById('selectAiCaptionLang');
  const boxAiCaptionLang = document.getElementById('boxAiCaptionLang');
  const btnStartPublishSession = document.getElementById('btnStartPublishSession');

  if (btnOrderSequential && btnOrderRandom) {
    btnOrderSequential.addEventListener('click', () => {
      currentJob.settings.videoOrderMode = 'sequential';
      btnOrderSequential.classList.add('active');
      btnOrderRandom.classList.remove('active');
      persistJobDraft();
    });

    btnOrderRandom.addEventListener('click', () => {
      currentJob.settings.videoOrderMode = 'random';
      btnOrderRandom.classList.add('active');
      btnOrderSequential.classList.remove('active');
      persistJobDraft();
    });
  }

  if (inputJitterMin && inputJitterMax) {
    const updateJitter = () => {
      const min = Math.max(5, parseInt(inputJitterMin.value, 10) || 15);
      const max = Math.max(min, parseInt(inputJitterMax.value, 10) || 20);
      currentJob.settings.intervalRandom = { min, max };
      persistJobDraft();
    };
    inputJitterMin.addEventListener('change', updateJitter);
    inputJitterMax.addEventListener('change', updateJitter);
  }

  if (inputPostTimeout) {
    inputPostTimeout.addEventListener('change', (e) => {
      currentJob.settings.postTimeoutMin = Math.max(1, parseInt(e.target.value, 10) || 5);
      persistJobDraft();
    });
  }

  if (inputParallelThreads) {
    inputParallelThreads.addEventListener('change', (e) => {
      currentJob.settings.parallelThreads = Math.max(1, parseInt(e.target.value, 10) || 1);
      persistJobDraft();
    });
  }

  if (chkPostToAllChannels) {
    chkPostToAllChannels.addEventListener('change', (e) => {
      currentJob.settings.postVideoToAllChannels = e.target.checked;
      updatePostMath();
      persistJobDraft();
    });
  }

  if (chkSkipDuplicateVideo) {
    chkSkipDuplicateVideo.addEventListener('change', (e) => {
      currentJob.settings.skipDuplicateVideoPerChannel = e.target.checked;
      persistJobDraft();
    });
  }

  if (chkAiRewriteCaption) {
    chkAiRewriteCaption.addEventListener('change', (e) => {
      currentJob.settings.aiRewriteCaption = e.target.checked;
      if (boxAiCaptionLang) {
        boxAiCaptionLang.style.display = e.target.checked ? 'block' : 'none';
      }
      persistJobDraft();
    });
  }

  if (selectAiCaptionLang) {
    selectAiCaptionLang.addEventListener('change', (e) => {
      currentJob.settings.aiCaptionLanguage = e.target.value;
      persistJobDraft();
    });
  }

  if (btnStartPublishSession) {
    btnStartPublishSession.addEventListener('click', async () => {
      await handleStartOrPauseSession();
    });
  }

  // --- MODAL 1: EDIT CLIP ---
  const modalEditClip = document.getElementById('modalEditClip');
  const btnCloseEditClipModal = document.getElementById('btnCloseEditClipModal');
  const btnCancelEditClip = document.getElementById('btnCancelEditClip');
  const btnSaveEditClip = document.getElementById('btnSaveEditClip');
  const modalClipTitle = document.getElementById('modalClipTitle');
  const modalClipCaption = document.getElementById('modalClipCaption');

  const closeEditModal = () => {
    if (modalEditClip) modalEditClip.classList.remove('active');
    editingClipId = null;
  };

  if (btnCloseEditClipModal) btnCloseEditClipModal.addEventListener('click', closeEditModal);
  if (btnCancelEditClip) btnCancelEditClip.addEventListener('click', closeEditModal);

  if (btnSaveEditClip) {
    btnSaveEditClip.addEventListener('click', () => {
      if (!editingClipId) return;
      const clip = currentJob.clips.find(c => c.itemId === editingClipId);
      if (clip) {
        clip.title = modalClipTitle.value.trim();
        clip.caption = modalClipCaption.value;
        renderClipsList();
        persistJobDraft();
      }
      closeEditModal();
    });
  }

  // --- MODAL 2: ADD CHANNEL ---
  const modalAddChannel = document.getElementById('modalAddChannel');
  const btnCloseAddChannelModal = document.getElementById('btnCloseAddChannelModal');
  const btnDismissAddChannelModal = document.getElementById('btnDismissAddChannelModal');
  const btnConfirmAddChannels = document.getElementById('btnConfirmAddChannels');
  const modalAddChannelSearch = document.getElementById('modalAddChannelSearch');
  const modalAddChannelPlatform = document.getElementById('modalAddChannelPlatform');
  const modalAddChannelSelectAll = document.getElementById('modalAddChannelSelectAll');

  const closeAddChannelModal = () => {
    if (modalAddChannel) modalAddChannel.classList.remove('active');
  };

  if (btnCloseAddChannelModal) btnCloseAddChannelModal.addEventListener('click', closeAddChannelModal);
  if (btnDismissAddChannelModal) btnDismissAddChannelModal.addEventListener('click', closeAddChannelModal);

  if (modalAddChannelSearch) {
    modalAddChannelSearch.addEventListener('input', () => renderAddChannelModalList());
  }

  if (modalAddChannelPlatform) {
    modalAddChannelPlatform.addEventListener('change', () => renderAddChannelModalList());
  }

  if (modalAddChannelSelectAll) {
    modalAddChannelSelectAll.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const checkboxes = document.querySelectorAll('.chk-modal-add-channel');
      checkboxes.forEach(cb => {
        cb.checked = isChecked;
        const accId = cb.getAttribute('data-acc-id');
        if (isChecked) selectedAddChannelAccountIds.add(accId);
        else selectedAddChannelAccountIds.delete(accId);
      });
      updateConfirmAddButton();
    });
  }

  if (btnConfirmAddChannels) {
    btnConfirmAddChannels.addEventListener('click', () => {
      const existingAccIds = new Set(currentJob.channels.map(c => c.accountId));
      for (const accId of selectedAddChannelAccountIds) {
        if (!existingAccIds.has(accId)) {
          const acc = allConnectedAccounts.find(a => a.id === accId);
          const initialDests = (acc?.destinations || []).map(d => d.id || d.target_id);
          currentJob.channels.push({
            accountId: accId,
            destinationIds: initialDests,
            disabled: false
          });
        }
      }
      renderChannelsList();
      updatePostMath();
      persistJobDraft();
      closeAddChannelModal();
    });
  }

  // --- MODAL 3: SETUP DEST ---
  const modalSetupDest = document.getElementById('modalSetupDest');
  const btnCloseSetupDestModal = document.getElementById('btnCloseSetupDestModal');
  const btnCancelSetupDest = document.getElementById('btnCancelSetupDest');
  const btnSaveSetupDest = document.getElementById('btnSaveSetupDest');
  const btnSelectAllDests = document.getElementById('btnSelectAllDests');
  const btnClearAllDests = document.getElementById('btnClearAllDests');

  const closeSetupDestModal = () => {
    if (modalSetupDest) modalSetupDest.classList.remove('active');
    setupDestAccountId = null;
  };

  if (btnCloseSetupDestModal) btnCloseSetupDestModal.addEventListener('click', closeSetupDestModal);
  if (btnCancelSetupDest) btnCancelSetupDest.addEventListener('click', closeSetupDestModal);

  if (btnSelectAllDests) {
    btnSelectAllDests.addEventListener('click', () => {
      document.querySelectorAll('.chk-modal-dest').forEach(cb => {
        cb.checked = true;
        setupDestTempSelectedIds.add(cb.getAttribute('data-dest-id'));
      });
      updateSetupDestCount();
    });
  }

  if (btnClearAllDests) {
    btnClearAllDests.addEventListener('click', () => {
      document.querySelectorAll('.chk-modal-dest').forEach(cb => {
        cb.checked = false;
        setupDestTempSelectedIds.delete(cb.getAttribute('data-dest-id'));
      });
      updateSetupDestCount();
    });
  }

  if (btnSaveSetupDest) {
    btnSaveSetupDest.addEventListener('click', () => {
      if (!setupDestAccountId) return;
      const ch = currentJob.channels.find(c => c.accountId === setupDestAccountId);
      if (ch) {
        ch.destinationIds = Array.from(setupDestTempSelectedIds);
        renderChannelsList();
        updatePostMath();
        persistJobDraft();
      }
      closeSetupDestModal();
    });
  }
}

// =============================================================
// RENDERERS
// =============================================================

const DEFAULT_AVATAR_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNCIgaGVpZ2h0PSIzNCI+PHJlY3QgZmlsbD0iIzNiODJmNiIgd2lkdGg9IjM0IiBoZWlnaHQ9IjM0Ii8+PC9zdmc+';

function renderClipsList() {
  const container = document.getElementById('clipsContainer');
  const btnClear = document.getElementById('btnClearClips');
  const chkSelectAll = document.getElementById('chkSelectAllClips');
  const txtSummary = document.getElementById('txtClipsCountSummary');

  if (!container) return;

  const total = currentJob.clips.length;
  const selectedCount = currentJob.clips.filter(c => c.selected !== false).length;

  if (btnClear) btnClear.style.display = total > 0 ? 'inline-flex' : 'none';
  if (chkSelectAll) chkSelectAll.checked = total > 0 && selectedCount === total;
  if (txtSummary) txtSummary.innerText = `Đã chọn ${selectedCount}/${total} video`;

  if (total === 0) {
    container.innerHTML = `
      <div style="padding: 40px 16px; text-align: center; color: var(--text-muted); border: 2px dashed rgba(255, 255, 255, 0.08); border-radius: var(--radius-md); margin: auto 0;" id="emptyClipsNotice">
        <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin: 0 auto 10px; color: var(--text-dim); display: block;"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
        <div style="font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">Thêm folder có import.xml hoặc chọn video lẻ</div>
        <div style="font-size: 11.5px;">Bấm nút phía trên để bắt đầu nạp video vào chiến dịch.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  currentJob.clips.forEach(clip => {
    const isSelected = clip.selected !== false;
    const fileName = clip.mediaPath ? clip.mediaPath.split(/[\\/]/).pop() : 'video.mp4';
    const card = document.createElement('div');
    card.className = `clip-card ${isSelected ? '' : 'dimmed'}`;

    let thumbHtml = '';
    if (clip.thumbnail) {
      thumbHtml = `
        <div class="clip-thumb-preview" style="width: 50px; height: 50px; border-radius: 6px; overflow: hidden; background: #000; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center;">
          <img src="${KZ.mediaSrc(clip.thumbnail)}" alt="Thumbnail" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
        </div>`;
    } else {
      thumbHtml = `
        <div class="clip-thumb-preview" style="width: 50px; height: 50px; border-radius: 6px; overflow: hidden; background: rgba(15, 13, 35, 0.9); flex-shrink: 0; border: 1px solid rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; color: var(--brand-cyan);">
          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
        </div>`;
    }

    card.innerHTML = `
      <input type="checkbox" class="chk-clip-select" data-id="${escHtml(clip.itemId)}" ${isSelected ? 'checked' : ''} style="accent-color: var(--primary-accent); cursor: pointer;" />
      
      ${thumbHtml}

      <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <div style="font-size: 12.5px; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(clip.title || fileName)}">
            ${clip.title ? escHtml(clip.title) : '<span style="font-style: italic; color: var(--text-muted);">Chưa có tiêu đề</span>'}
          </div>
        </div>
        <div style="font-size: 10.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(clip.mediaPath)}">
          ${escHtml(fileName)}
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
        <button type="button" class="btn btn-secondary btn-icon-only btn-edit-clip" data-id="${escHtml(clip.itemId)}" style="width: 28px; height: 28px; padding: 0;" title="Sửa tiêu đề / nội dung">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
        </button>
        <button type="button" class="btn btn-secondary btn-icon-only btn-delete-clip" data-id="${escHtml(clip.itemId)}" style="width: 28px; height: 28px; padding: 0; color: #f87171;" title="Xóa video khỏi list">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    `;

    // Asynchronously resolve real video thumbnail
    if (!clip.thumbnail && clip.mediaPath && window.api && window.api.getVideoThumbnail) {
      window.api.getVideoThumbnail(clip.mediaPath).then(thumb => {
        if (thumb) {
          clip.thumbnail = thumb;
          const box = card.querySelector('.clip-thumb-preview');
          if (box) {
            box.style.background = '#000';
            box.innerHTML = `<img src="${KZ.mediaSrc(thumb)}" alt="Thumbnail" style="width: 100%; height: 100%; object-fit: cover; display: block;" />`;
          }
          persistJobDraft();
        }
      }).catch(err => console.warn('Thumbnail err:', err));
    }

    // Wire item interactions
    const cb = card.querySelector('.chk-clip-select');
    cb.addEventListener('change', (e) => {
      clip.selected = e.target.checked;
      card.className = `clip-card ${clip.selected ? '' : 'dimmed'}`;
      updatePostMath();
      persistJobDraft();
    });

    const btnEdit = card.querySelector('.btn-edit-clip');
    btnEdit.addEventListener('click', () => openEditClipModal(clip));

    const btnDel = card.querySelector('.btn-delete-clip');
    btnDel.addEventListener('click', () => {
      currentJob.clips = currentJob.clips.filter(c => c.itemId !== clip.itemId);
      renderClipsList();
      updatePostMath();
      persistJobDraft();
    });

    container.appendChild(card);
  });
}

function openEditClipModal(clip) {
  editingClipId = clip.itemId;
  const modal = document.getElementById('modalEditClip');
  const titleInput = document.getElementById('modalClipTitle');
  const captionInput = document.getElementById('modalClipCaption');

  if (titleInput) titleInput.value = clip.title || '';
  if (captionInput) captionInput.value = clip.caption || '';
  if (modal) modal.classList.add('active');
}

function renderChannelsList() {
  const container = document.getElementById('channelsContainer');
  const query = (document.getElementById('inputChannelQuery')?.value || '').trim().toLowerCase();
  const platformFilter = document.getElementById('selectChannelPlatformFilter')?.value || 'all';

  if (!container) return;

  if (currentJob.channels.length === 0) {
    container.innerHTML = `
      <div style="padding: 40px 16px; text-align: center; color: var(--text-muted); border: 2px dashed rgba(255, 255, 255, 0.08); border-radius: var(--radius-md); margin: auto 0;" id="emptyChannelsNotice">
        <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin: 0 auto 10px; color: var(--text-dim); display: block;"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        <div style="font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">Thêm kênh đã kết nối (FB / TikTok / YouTube / IG / Zalo / Threads)</div>
        <div style="font-size: 11.5px;">Bấm nút "+ Add kênh" góc trên để chọn tài khoản cho job.</div>
      </div>
    `;
    return;
  }

  // Filter channels
  const filtered = currentJob.channels.filter(ch => {
    const acc = allConnectedAccounts.find(a => a.id === ch.accountId);
    if (!acc) return false;
    if (platformFilter !== 'all' && acc.platform !== platformFilter) return false;
    if (query && !(acc.displayName || '').toLowerCase().includes(query) && !(acc.platform || '').toLowerCase().includes(query)) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">Không có kênh khớp tìm kiếm.</div>`;
    return;
  }

  container.innerHTML = '';

  filtered.forEach(ch => {
    const acc = allConnectedAccounts.find(a => a.id === ch.accountId) || { id: ch.accountId, displayName: 'Kênh', platform: 'facebook' };
    const allDests = acc.destinations || [];
    const chosenDests = (ch.destinationIds && ch.destinationIds.length > 0)
      ? allDests.filter(d => ch.destinationIds.includes(d.id || d.target_id))
      : allDests;

    const isConnected = acc.status === 'connected' || acc.status === 'live';
    const isFb = acc.platform === 'facebook';

    const card = document.createElement('div');
    card.className = `channel-card ${ch.disabled ? 'disabled' : ''}`;

    const destCountText = isFb
      ? `${chosenDests.length} nơi đăng đã chọn`
      : '1 tài khoản = 1 kênh';

    card.innerHTML = `
      <!-- Top Row: Avatar + Name/UID + Quick Actions -->
      <div class="channel-card-top">
        <div class="channel-identity">
          <img src="${KZ.mediaSrc(acc.avatarPath) || DEFAULT_AVATAR_URI}" class="channel-avatar" data-img-fallback="src" data-fallback-src="${DEFAULT_AVATAR_URI}">
          <div class="channel-name-box">
            <div class="channel-title-row">
              <span class="channel-name" title="${escHtml(acc.displayName)}">${escHtml(acc.displayName)}</span>
              <span class="badge" style="font-size: 9.5px; text-transform: uppercase; background: rgba(59, 130, 246, 0.15); color: #3b82f6; flex-shrink: 0; padding: 1px 6px;">${escHtml(acc.platform)}</span>
            </div>
            <div class="channel-uid-row">
              <span>${escHtml(acc.uid ? 'UID: ' + acc.uid : acc.id)}</span>
            </div>
          </div>
        </div>

        <div class="channel-quick-actions">
          <label class="switch-wrapper" title="Bật/Tắt kênh">
            <input type="checkbox" class="chk-channel-toggle" data-id="${escHtml(ch.accountId)}" ${ch.disabled ? '' : 'checked'} />
            <span class="switch-slider"></span>
          </label>
          <button type="button" class="btn btn-secondary btn-icon-only btn-remove-channel" data-id="${escHtml(ch.accountId)}" style="width: 26px; height: 26px; padding: 0; color: #f87171;" title="Xóa kênh khỏi job">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>

      <!-- Bottom Row: Status dot + Destination summary + Setup button -->
      <div class="channel-card-bottom">
        <div class="channel-status-info">
          <span class="status-indicator-dot ${isConnected ? 'live' : 'error'}"></span>
          <span style="font-weight: 500; color: ${isConnected ? 'var(--text-secondary)' : '#ef4444'};">${isConnected ? 'Live' : 'Check login'}</span>
          <span>•</span>
          <span class="channel-dest-summary" title="${escHtml(destCountText)}">${escHtml(destCountText)}</span>
        </div>
        ${isFb ? `<button type="button" class="btn btn-setup-dest" data-id="${escHtml(ch.accountId)}">Setup nơi đăng</button>` : ''}
      </div>

      <!-- Sub-destinations nested tags preview -->
      ${isFb && chosenDests.length > 0 ? `
        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.04); max-height: 48px; overflow-y: auto;">
          ${chosenDests.map(d => `
            <span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; background: rgba(236, 72, 153, 0.12); color: var(--brand-pink); display: inline-flex; align-items: center; gap: 3px; max-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(d.name)}">
              <span>${d.type === 'profile' ? '👤' : '🚩'}</span>
              <span style="overflow: hidden; text-overflow: ellipsis;">${escHtml(d.name)}</span>
            </span>
          `).join('')}
        </div>
      ` : ''}
    `;

    // Wire actions
    const btnSetup = card.querySelector('.btn-setup-dest');
    if (btnSetup) {
      btnSetup.addEventListener('click', () => openSetupDestModal(ch.accountId));
    }

    const toggle = card.querySelector('.chk-channel-toggle');
    toggle.addEventListener('change', (e) => {
      ch.disabled = !e.target.checked;
      card.className = `channel-card ${ch.disabled ? 'disabled' : ''}`;
      updatePostMath();
      persistJobDraft();
    });

    const btnRemove = card.querySelector('.btn-remove-channel');
    btnRemove.addEventListener('click', () => {
      currentJob.channels = currentJob.channels.filter(c => c.accountId !== ch.accountId);
      renderChannelsList();
      updatePostMath();
      persistJobDraft();
    });

    container.appendChild(card);
  });
}

function openAddChannelModal() {
  selectedAddChannelAccountIds = new Set(currentJob.channels.map(c => c.accountId));
  const modal = document.getElementById('modalAddChannel');
  renderAddChannelModalList();
  if (modal) modal.classList.add('active');
}

function renderAddChannelModalList() {
  const container = document.getElementById('modalAddChannelList');
  const countLabel = document.getElementById('modalAddChannelFoundCount');
  const search = (document.getElementById('modalAddChannelSearch')?.value || '').trim().toLowerCase();
  const platform = document.getElementById('modalAddChannelPlatform')?.value || 'all';

  if (!container) return;

  const filtered = allConnectedAccounts.filter(acc => {
    if (platform !== 'all' && acc.platform !== platform) return false;
    if (search && !(acc.displayName || '').toLowerCase().includes(search) && !(acc.platform || '').toLowerCase().includes(search)) return false;
    return true;
  });

  if (countLabel) countLabel.innerText = `${filtered.length} tài khoản có sẵn`;

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 13px;">Không có tài khoản nào. Vui lòng thêm tài khoản ở Tab "Quản lý kênh".</div>`;
    updateConfirmAddButton();
    return;
  }

  container.innerHTML = '';

  filtered.forEach(acc => {
    const isChecked = selectedAddChannelAccountIds.has(acc.id);
    const row = document.createElement('div');
    row.style = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: var(--radius-md); cursor: pointer;';

    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
        <input type="checkbox" class="chk-modal-add-channel" data-acc-id="${escHtml(acc.id)}" ${isChecked ? 'checked' : ''} style="accent-color: var(--primary-accent); cursor: pointer; flex-shrink: 0;" />
        <img src="${KZ.mediaSrc(acc.avatarPath) || DEFAULT_AVATAR_URI}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" data-img-fallback="src" data-fallback-src="${DEFAULT_AVATAR_URI}">
        <div style="display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
          <div style="font-size: 13px; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(acc.displayName)}">${escHtml(acc.displayName)}</div>
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escHtml(acc.platform)} ${acc.uid ? '• UID: ' + escHtml(acc.uid) : ''}</div>
        </div>
      </div>
      <div style="flex-shrink: 0;">
        <span class="badge" style="font-size: 11px; background: ${acc.status === 'connected' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${acc.status === 'connected' ? '#10b981' : '#f87171'};">
          ${acc.status === 'connected' ? 'Live' : 'Check login'}
        </span>
      </div>
    `;

    const cb = row.querySelector('.chk-modal-add-channel');
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      if (e.target.checked) selectedAddChannelAccountIds.add(acc.id);
      else selectedAddChannelAccountIds.delete(acc.id);
      updateConfirmAddButton();
    });

    row.addEventListener('click', (e) => {
      if (e.target !== cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      }
    });

    container.appendChild(row);
  });

  updateConfirmAddButton();
}

function updateConfirmAddButton() {
  const btn = document.getElementById('btnConfirmAddChannels');
  if (btn) {
    btn.innerText = `+ Thêm ${selectedAddChannelAccountIds.size} kênh`;
  }
}

async function openSetupDestModal(accountId) {
  setupDestAccountId = accountId;
  const modal = document.getElementById('modalSetupDest');
  const listContainer = document.getElementById('modalSetupDestList');
  const acc = allConnectedAccounts.find(a => a.id === accountId);
  const ch = currentJob.channels.find(c => c.accountId === accountId);

  if (!modal || !listContainer || !acc) return;

  // Sync or fetch destinations
  let dests = acc.destinations || [];
  if (window.api && window.api.getDestinations) {
    try {
      dests = await window.api.getDestinations(accountId);
      acc.destinations = dests;
    } catch (e) {}
  }

  setupDestTempSelectedIds = new Set(ch?.destinationIds || dests.map(d => d.id || d.target_id));

  listContainer.innerHTML = '';
  dests.forEach(d => {
    const destId = d.id || d.target_id;
    const isChecked = setupDestTempSelectedIds.has(destId);
    const row = document.createElement('div');
    row.style = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-md); cursor: pointer;';

    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <input type="checkbox" class="chk-modal-dest" data-dest-id="${escHtml(destId)}" ${isChecked ? 'checked' : ''} style="accent-color: var(--primary-accent); cursor: pointer;" />
        <span style="font-size: 16px;">${d.type === 'profile' ? '👤' : '🚩'}</span>
        <div>
          <div style="font-size: 13px; font-weight: 600; color: var(--text-main);">${escHtml(d.name)}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${d.type === 'profile' ? 'Trang cá nhân' : 'Fanpage'} ${d.category ? '• ' + escHtml(d.category) : ''}</div>
        </div>
      </div>
    `;

    const cb = row.querySelector('.chk-modal-dest');
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      if (e.target.checked) setupDestTempSelectedIds.add(destId);
      else setupDestTempSelectedIds.delete(destId);
      updateSetupDestCount();
    });

    row.addEventListener('click', (e) => {
      if (e.target !== cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      }
    });

    listContainer.appendChild(row);
  });

  updateSetupDestCount();
  modal.classList.add('active');
}

function updateSetupDestCount() {
  const lbl = document.getElementById('txtSetupDestSelectedCount');
  const total = document.querySelectorAll('.chk-modal-dest').length;
  if (lbl) lbl.innerText = `Đã chọn ${setupDestTempSelectedIds.size}/${total}`;
}

function renderSettings() {
  const btnSeq = document.getElementById('btnOrderSequential');
  const btnRnd = document.getElementById('btnOrderRandom');
  const inputJMin = document.getElementById('inputJitterMin');
  const inputJMax = document.getElementById('inputJitterMax');
  const inputTimeout = document.getElementById('inputPostTimeout');
  const inputThreads = document.getElementById('inputParallelThreads');
  const chkPostAll = document.getElementById('chkPostToAllChannels');
  const chkSkipDup = document.getElementById('chkSkipDuplicateVideo');
  const chkAi = document.getElementById('chkAiRewriteCaption');
  const boxAiLang = document.getElementById('boxAiCaptionLang');
  const selAiLang = document.getElementById('selectAiCaptionLang');

  if (btnSeq && btnRnd) {
    if (currentJob.settings.videoOrderMode === 'random') {
      btnRnd.classList.add('active');
      btnSeq.classList.remove('active');
    } else {
      btnSeq.classList.add('active');
      btnRnd.classList.remove('active');
    }
  }

  if (inputJMin) inputJMin.value = currentJob.settings.intervalRandom?.min || 15;
  if (inputJMax) inputJMax.value = currentJob.settings.intervalRandom?.max || 20;
  if (inputTimeout) inputTimeout.value = currentJob.settings.postTimeoutMin || 5;
  if (inputThreads) inputThreads.value = currentJob.settings.parallelThreads || 1;
  if (chkPostAll) chkPostAll.checked = currentJob.settings.postVideoToAllChannels !== false;
  if (chkSkipDup) chkSkipDup.checked = currentJob.settings.skipDuplicateVideoPerChannel !== false;
  if (chkAi) {
    chkAi.checked = !!currentJob.settings.aiRewriteCaption;
    if (boxAiLang) boxAiLang.style.display = chkAi.checked ? 'block' : 'none';
  }
  if (selAiLang) selAiLang.value = currentJob.settings.aiCaptionLanguage || 'vi';
}

function updatePostMath() {
  const bar = document.getElementById('txtPostMathSummary');
  if (!bar) return;

  const activeClipsCount = currentJob.clips.filter(c => c.selected !== false).length;
  let totalDestsCount = 0;

  for (const ch of currentJob.channels) {
    if (ch.disabled) continue;
    const acc = allConnectedAccounts.find(a => a.id === ch.accountId);
    if (!acc) continue;
    const allDests = acc.destinations || [];
    const chosen = (ch.destinationIds && ch.destinationIds.length > 0)
      ? allDests.filter(d => ch.destinationIds.includes(d.id || d.target_id))
      : allDests;
    totalDestsCount += Math.max(1, chosen.length);
  }

  const postToAll = currentJob.settings.postVideoToAllChannels !== false;
  let totalTasks = 0;

  if (postToAll) {
    totalTasks = activeClipsCount * totalDestsCount;
    bar.innerText = `${activeClipsCount} video × ${totalDestsCount} đích = ${totalTasks} lượt đăng`;
  } else {
    totalTasks = activeClipsCount;
    bar.innerText = `${activeClipsCount} video ➔ ${totalTasks} lượt đăng (phân phối round-robin)`;
  }
}

// =============================================================
// JOB EXECUTION & REAL-TIME MONITORING
// =============================================================

async function handleStartOrPauseSession() {
  const btn = document.getElementById('btnStartPublishSession');
  const monitor = document.getElementById('publishLiveMonitor');

  // If already Done, clicking resets back to ready for next run
  if (btn && btn.classList.contains('btn-done-publish')) {
    currentPublishSessionId = null;
    isPublishPaused = false;
    setPublishBtnIdle(btn);
    return;
  }

  if (isPublishingRunning) {
    if (window.api && window.api.publisherPauseSession) {
      await window.api.publisherPauseSession();
    }
    isPublishingRunning = false;
    isPublishPaused = true;
    setPublishBtnResume(btn);
    const msgEl = document.getElementById('monLaneMsg');
    if (msgEl) msgEl.innerText = 'Đang tạm dừng... Video đang đăng dở (nếu có) sẽ chạy nốt rồi mới dừng hẳn.';
    return;
  }

  // Resume đúng phiên đã tạm dừng — KHÔNG tạo phiên mới (tránh đăng lại các video đã lên)
  if (isPublishPaused && currentPublishSessionId) {
    try {
      const res = await window.api.publisherStartSession(currentPublishSessionId);
      isPublishPaused = false;
      isPublishingRunning = true;
      setPublishBtnRunning(btn);
      const msgEl = document.getElementById('monLaneMsg');
      if (msgEl) msgEl.innerText = `Tiếp tục phiên đăng: còn ${res?.remaining ?? '?'} lượt chưa đăng...`;
    } catch (err) {
      alert('Không thể tiếp tục: ' + err.message);
    }
    return;
  }

  // 1. Sync selections from Column 1 DOM checkboxes
  document.querySelectorAll('.chk-clip-select').forEach(cb => {
    const cid = cb.dataset.id;
    const clip = currentJob.clips.find(c => c.itemId === cid);
    if (clip) clip.selected = cb.checked;
  });

  // 2. Sync toggles from Column 2 DOM checkboxes
  document.querySelectorAll('.chk-channel-toggle').forEach(cb => {
    const aid = cb.dataset.id;
    const ch = currentJob.channels.find(c => c.accountId === aid);
    if (ch) ch.disabled = !cb.checked;
  });

  // 3. Ensure clips list is not empty and has selected items
  let activeClips = currentJob.clips.filter(c => c.selected !== false);
  if (activeClips.length === 0 && currentJob.clips.length > 0) {
    currentJob.clips.forEach(c => c.selected = true);
    activeClips = currentJob.clips;
    renderClipsList();
    updatePostMath();
  }

  if (activeClips.length === 0) {
    alert('Vui lòng chọn ít nhất 1 video ở Cột 1!');
    return;
  }

  // 4. Ensure channels list is not empty, auto-populate from connected accounts if needed
  let activeChannels = currentJob.channels.filter(ch => !ch.disabled);
  if (activeChannels.length === 0) {
    if (allConnectedAccounts && allConnectedAccounts.length > 0) {
      currentJob.channels = allConnectedAccounts.map(acc => ({
        accountId: acc.id,
        destinationIds: (acc.destinations || []).map(d => d.id || d.target_id),
        disabled: false
      }));
      activeChannels = currentJob.channels;
      renderChannelsList();
      updatePostMath();
      persistJobDraft();
    }
  }

  if (activeChannels.length === 0) {
    alert('Vui lòng kết nối hoặc chọn ít nhất 1 kênh đăng ở Cột 2!');
    return;
  }

  // 5. Sync settings from Column 3 DOM inputs
  const inputJMin = document.getElementById('inputJitterMin');
  const inputJMax = document.getElementById('inputJitterMax');
  const inputTimeout = document.getElementById('inputPostTimeout');
  const inputThreads = document.getElementById('inputParallelThreads');
  const chkPostAll = document.getElementById('chkPostToAllChannels');
  const chkSkipDup = document.getElementById('chkSkipDuplicateVideo');

  if (inputJMin && inputJMax) {
    currentJob.settings.intervalRandom = {
      min: Math.max(5, parseInt(inputJMin.value, 10) || 15),
      max: Math.max(Math.max(5, parseInt(inputJMin.value, 10) || 15), parseInt(inputJMax.value, 10) || 20)
    };
  }
  if (inputTimeout) currentJob.settings.postTimeoutMin = Math.max(1, parseInt(inputTimeout.value, 10) || 5);
  if (inputThreads) currentJob.settings.parallelThreads = Math.max(1, parseInt(inputThreads.value, 10) || 1);
  if (chkPostAll) currentJob.settings.postVideoToAllChannels = chkPostAll.checked;
  if (chkSkipDup) currentJob.settings.skipDuplicateVideoPerChannel = chkSkipDup.checked;

  isPublishingRunning = true;
  setPublishBtnRunning(btn);

  if (monitor) monitor.style.display = 'block';

  try {
    // Chống trùng do checkbox "Không đăng trùng video lên 1 kênh" quyết định (không ép forceDispatch)
    const res = await window.api.publisherStartJob({
      clips: currentJob.clips,
      channels: currentJob.channels,
      settings: { ...currentJob.settings }
    });

    const sessionName = res?.session?.name || 'Chiến dịch xuất bản';
    const total = res.eventsCount || res.events?.length || 0;
    currentPublishSessionId = res?.session?.id || null;
    isPublishPaused = false;

    if (total === 0) {
      throw new Error('Không có bài đăng nào được sinh ra trong hàng đợi. Vui lòng kiểm tra lại video ở Cột 1 và kênh ở Cột 2.');
    }

    const sessionEl = document.getElementById('monSessionName');
    const msgEl = document.getElementById('monLaneMsg');
    const progEl = document.getElementById('monProgressCounts');
    const badge = document.getElementById('monStatusBadge');

    if (sessionEl) sessionEl.innerText = sessionName;
    const skippedInfo = res.skippedDuplicates ? ` (bỏ qua ${res.skippedDuplicates} lượt đã đăng trước đó)` : '';
    if (msgEl) msgEl.innerText = `Đã lên lịch ${total} bài đăng vào hàng đợi${skippedInfo}. Đang kích hoạt Playwright...`;
    if (progEl) progEl.innerText = `0 / ${total} hoàn tất (0%)`;
    const startBar = document.getElementById('monProgressBar');
    if (startBar) {
      startBar.style.width = '0%';
      startBar.classList.remove('done');
    }
    if (badge) {
      badge.className = 'badge badge-primary';
      badge.innerText = `Chờ xuất bản (${total} bài)`;
    }
  } catch (err) {
    alert('Lỗi khởi động chiến dịch: ' + err.message);
    isPublishingRunning = false;
    setPublishBtnIdle(btn);
  }
}

function setPublishBtnIdle(btn) {
  if (!btn) return;
  btn.className = 'btn btn-crimson-publish btn-block';
  btn.innerHTML = `<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> <span>Bắt đầu đăng</span>`;
}

function setPublishBtnResume(btn) {
  if (!btn) return;
  btn.className = 'btn btn-crimson-publish btn-block';
  btn.innerHTML = `<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> <span>Tiếp tục đăng</span>`;
}

function setPublishBtnRunning(btn) {
  if (!btn) return;
  btn.className = 'btn btn-warning btn-block';
  btn.innerHTML = `<svg width="18" height="18" class="spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M4 12a8 8 0 018-8"></path></svg> <span>Tạm dừng hàng đợi</span>`;
}

function handlePublishProgress(data) {
  const monitor = document.getElementById('publishLiveMonitor');
  if (monitor) monitor.style.display = 'block';

  const msgEl = document.getElementById('monLaneMsg');
  const countLabel = document.getElementById('monCountdownLabel');
  const badge = document.getElementById('monStatusBadge');
  const bar = document.getElementById('monProgressBar');
  const progCounts = document.getElementById('monProgressCounts');
  const btn = document.getElementById('btnStartPublishSession');

  if (data.message && msgEl) {
    msgEl.innerText = data.message;
  }

  // 1. Calculate percentage and smoothly drag progress bar
  const completed = data.completedCount !== undefined ? data.completedCount : 0;
  const failed = data.failedCount !== undefined ? data.failedCount : 0;
  const review = data.reviewCount !== undefined ? data.reviewCount : 0; // unverified + draft: cần kiểm tra tay
  const total = data.totalCount !== undefined ? data.totalCount : 0;
  const done = completed + failed + review;

  if (data.type === 'session_paused' || data.type === 'session_error') {
    isPublishingRunning = false;
    const paused = data.type === 'session_paused';
    isPublishPaused = paused;
    if (paused) setPublishBtnResume(btn); else setPublishBtnIdle(btn);
    if (badge) {
      badge.className = paused ? 'badge badge-warning' : 'badge badge-danger';
      badge.innerText = paused ? 'Đã tạm dừng' : 'Lỗi phiên đăng';
    }
    if (countLabel) countLabel.innerText = '';
    return;
  }

  const isFinished = data.type === 'session_done' || (total > 0 && done >= total);

  if (total > 0) {
    const pct = isFinished ? 100 : Math.min(99, Math.round((done / total) * 100));

    if (bar) {
      bar.style.width = `${pct}%`;
      if (pct >= 100) {
        bar.classList.add('done');
      } else {
        bar.classList.remove('done');
      }
    }

    if (progCounts) {
      const reviewInfo = review > 0 ? ` · ${review} cần kiểm tra tay` : '';
      progCounts.innerText = `${completed} / ${total} hoàn tất (${pct}%)${reviewInfo}`;
    }
  }

  if (data.remainingSec && countLabel) {
    countLabel.innerText = `⏳ Chờ: ${data.remainingSec}s`;
  } else if (countLabel) {
    countLabel.innerText = '';
  }

  // 2. Status Badge Styling
  if (data.status && badge && !isFinished) {
    if (data.status === 'success') {
      badge.className = 'badge badge-success';
      badge.innerText = 'Đăng thành công';
    } else if (data.status === 'failed') {
      badge.className = 'badge badge-danger';
      badge.innerText = 'Lỗi bài đăng';
    } else if (data.status === 'unverified') {
      badge.className = 'badge badge-warning';
      badge.innerText = 'Chưa xác nhận — kiểm tra tay';
    } else if (data.status === 'draft') {
      badge.className = 'badge badge-warning';
      badge.innerText = 'Chỉ lưu bản nháp';
    } else if (data.status === 'waiting_cooldown') {
      badge.className = 'badge badge-warning';
      badge.innerText = 'Cooldown';
    } else if (data.status === 'jitter_delay') {
      badge.className = 'badge badge-warning';
      badge.innerText = 'Giãn cách Jitter';
    } else {
      badge.className = 'badge badge-primary';
      badge.innerText = 'Đang xử lý';
    }
  }

  // 3. Complete Session: Switch button to DONE and highlight progress
  if (isFinished) {
    isPublishingRunning = false;
    isPublishPaused = false;
    currentPublishSessionId = null;

    if (bar) {
      bar.style.width = '100%';
      bar.classList.add('done');
    }

    if (badge) {
      badge.className = 'badge badge-success';
      badge.innerText = 'Hoàn tất';
    }

    if (btn) {
      btn.className = 'btn btn-done-publish btn-block';
      btn.innerHTML = `
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
        <span style="letter-spacing: 0.5px;">Done — Hoàn tất (${done}/${total})</span>
      `;
    }

    if (data.message && msgEl) {
      msgEl.innerText = data.message;
    }
  }
}

// Backwards compatibility for external tab reload triggers
async function loadQueueEvents() {
  await loadAccountsData();
  await loadJobDraft();
  renderClipsList();
  renderChannelsList();
  renderSettings();
  updatePostMath();
}

const loadPublishQueue = loadQueueEvents;
window.loadQueueEvents = loadQueueEvents;
window.loadPublishQueue = loadPublishQueue;
