// Tab 5: Kenzious Kit Tool (Facebook EAAB, UID Batch Resolver, Stem Audio Isolation)

document.addEventListener('DOMContentLoaded', () => {
  initToolkit();
});

// Also re-check accounts when tab is clicked
document.querySelectorAll('.nav-item').forEach(item => {
  if (item.getAttribute('data-tab') === 'tab-toolkit') {
    item.addEventListener('click', () => {
      refreshToolkitFacebookStatus();
    });
  }
});

let currentExtractedToken = '';
let currentStemResult = null;

async function refreshToolkitFacebookStatus() {
  const hintEl = document.getElementById('eaabAccountHint');
  const badgeEl = document.getElementById('badgeTokenStatus');
  const txtToken = document.getElementById('txtEaabTokenResult');
  if (!hintEl || !window.api || !window.api.getAccounts) return;

  try {
    const accounts = await window.api.getAccounts();
    const fbAcc = accounts.find(a => a.platform === 'facebook');

    if (!fbAcc) {
      hintEl.innerHTML = '<span style="color: var(--text-muted);">⚠️ Chưa kết nối tài khoản Facebook. Vào tab <strong>"Quản lý kênh"</strong> để kết nối hoặc dán Cookie.</span>';
      if (badgeEl) badgeEl.style.display = 'none';
      return;
    }

    // Danh sách tài khoản không chứa token/cookie thật — token chỉ lấy khi cần hiển thị cho người dùng
    const hasToken = !!fbAcc.hasToken;
    const hasCookies = !!fbAcc.hasCookies;

    let statusText = `Tài khoản: <strong>${escHtml(fbAcc.displayName || 'Facebook')}</strong> (UID: ${escHtml(fbAcc.uid || 'N/A')})`;
    if (hasToken) {
      statusText += ` • <span style="color: #34d399; font-weight: 600;">✓ Có Token EAAB</span>`;
      if (badgeEl) {
        badgeEl.style.display = 'inline-block';
        badgeEl.innerText = 'TOKEN LIVE';
        badgeEl.className = 'badge badge-success';
      }
      if (txtToken && (!txtToken.value || txtToken.value.startsWith('EAAB')) && window.api.getAccountToken) {
        const tok = await window.api.getAccountToken(fbAcc.id).catch(() => '');
        if (tok) {
          txtToken.value = tok;
          currentExtractedToken = tok;
        }
      }
    } else if (hasCookies) {
      statusText += ` • <span style="color: #38bdf8;">Đã lưu Cookie (sẵn sàng bóc tách)</span>`;
      if (badgeEl) {
        badgeEl.style.display = 'inline-block';
        badgeEl.innerText = 'COOKIE READY';
        badgeEl.className = 'badge badge-info';
      }
    } else {
      statusText += ` • <span style="color: #f59e0b;">Chưa có Cookie/Token</span>`;
      if (badgeEl) badgeEl.style.display = 'none';
    }

    hintEl.innerHTML = statusText;
  } catch (err) {
    console.warn('[tab-toolkit] refreshToolkitFacebookStatus err:', err);
  }
}

function initToolkit() {
  refreshToolkitFacebookStatus();

  // ---------------------------------------------------------
  // 1. TOOL 1: Lấy Token EAAB Facebook
  // ---------------------------------------------------------
  const btnExtractToken = document.getElementById('btnExtractEaabToken');
  const btnForceRefresh = document.getElementById('btnForceRefreshEaabToken');
  const btnCopyToken = document.getElementById('btnCopyEaabToken');
  const txtTokenResult = document.getElementById('txtEaabTokenResult');
  const badgeToken = document.getElementById('badgeTokenStatus');
  const hintEl = document.getElementById('eaabAccountHint');

  const executeTokenExtraction = async (forceRefresh = false) => {
    if (!btnExtractToken || !window.api || !window.api.extractEaabToken) return;

    btnExtractToken.disabled = true;
    const origHtml = btnExtractToken.innerHTML;
    btnExtractToken.innerHTML = `
      <div class="spinner" style="display: inline-block; width: 14px; height: 14px; vertical-align: middle; margin-right: 6px;"></div>
      Đang bóc tách Token từ Ads Manager...
    `;

    try {
      const res = await window.api.extractEaabToken({ forceRefresh });
      if (res.success && res.token) {
        txtTokenResult.value = res.token;
        currentExtractedToken = res.token;

        if (badgeToken) {
          badgeToken.style.display = 'inline-block';
          badgeToken.innerText = res.method.includes('browser') ? 'BROWSER LIVE' : 'ADS LIVE';
          badgeToken.className = 'badge badge-success';
        }

        if (hintEl) {
          hintEl.innerHTML = `<span style="color: #34d399; font-weight: 600;">✓ Bóc tách thành công cho: ${escHtml(res.name || 'Facebook')} (UID: ${escHtml(res.uid || 'N/A')})</span>`;
        }

        // Quick alert / toast
        if (btnCopyToken) btnCopyToken.style.display = 'inline-block';
      } else {
        alert(res.message || 'Không thể bóc tách Token. Hãy chắc chắn tài khoản Facebook đang đăng nhập hoặc có quyền Ads Manager.');
      }
    } catch (err) {
      alert('Lỗi bóc tách token: ' + err.message);
    } finally {
      btnExtractToken.disabled = false;
      btnExtractToken.innerHTML = origHtml;
    }
  };

  if (btnExtractToken) {
    btnExtractToken.addEventListener('click', () => executeTokenExtraction(false));
  }

  if (btnForceRefresh) {
    btnForceRefresh.addEventListener('click', () => executeTokenExtraction(true));
  }

  if (btnCopyToken && txtTokenResult) {
    btnCopyToken.addEventListener('click', async () => {
      const token = txtTokenResult.value.trim();
      if (!token) {
        alert('Chưa có token để sao chép!');
        return;
      }
      try {
        await navigator.clipboard.writeText(token);
        const origText = btnCopyToken.innerHTML;
        btnCopyToken.innerHTML = '✓ Đã sao chép!';
        setTimeout(() => { btnCopyToken.innerHTML = origText; }, 2000);
      } catch (e) {
        txtTokenResult.select();
        document.execCommand('copy');
        alert('Đã sao chép Token vào clipboard!');
      }
    });
  }

  // ---------------------------------------------------------
  // 2. TOOL 2: Convert Link Facebook sang UID (Batch & Single)
  // ---------------------------------------------------------
  const btnConvertUid = document.getElementById('btnConvertUidList');
  const btnClearUid = document.getElementById('btnClearUidList');
  const btnCopyUid = document.getElementById('btnCopyUidResults');
  const txtUrls = document.getElementById('txtUrlsToConvert');
  const chkOnlyUid = document.getElementById('chkOnlyUidList');
  const progressBadge = document.getElementById('uidConvertProgress');

  if (btnClearUid && txtUrls) {
    btnClearUid.addEventListener('click', () => {
      txtUrls.value = '';
      if (btnCopyUid) btnCopyUid.style.display = 'none';
      if (progressBadge) progressBadge.style.display = 'none';
    });
  }

  if (btnCopyUid && txtUrls) {
    btnCopyUid.addEventListener('click', async () => {
      if (!txtUrls.value.trim()) return;
      try {
        await navigator.clipboard.writeText(txtUrls.value.trim());
        const orig = btnCopyUid.innerHTML;
        btnCopyUid.innerHTML = '✓ Đã sao chép danh sách!';
        setTimeout(() => { btnCopyUid.innerHTML = orig; }, 2000);
      } catch (e) {
        txtUrls.select();
        document.execCommand('copy');
      }
    });
  }

  if (btnConvertUid && txtUrls) {
    btnConvertUid.addEventListener('click', async () => {
      const rawText = txtUrls.value.trim();
      if (!rawText) {
        alert('Vui lòng dán danh sách URL Facebook (mỗi liên kết 1 dòng)!');
        return;
      }

      const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      btnConvertUid.disabled = true;
      const origBtnText = btnConvertUid.innerHTML;
      btnConvertUid.innerHTML = `
        <div class="spinner" style="display: inline-block; width: 14px; height: 14px; vertical-align: middle; margin-right: 6px;"></div>
        Đang phân giải UID...
      `;

      if (progressBadge) {
        progressBadge.style.display = 'inline-block';
        progressBadge.innerText = `0/${lines.length}`;
      }

      if (window.api && window.api.onUidProgress) {
        window.api.onUidProgress((p) => {
          if (progressBadge) progressBadge.innerText = `${p.current}/${p.total}`;
        });
      }

      try {
        const results = await window.api.convertUrlsToUid(lines);
        const onlyUid = chkOnlyUid ? chkOnlyUid.checked : false;

        let outputLines = [];
        if (onlyUid) {
          outputLines = results.map(r => r.uid ? r.uid : `# Lỗi: ${r.url}`);
        } else {
          outputLines = results.map(r => {
            if (r.uid) {
              const nameInfo = r.name ? ` (${r.name})` : '';
              return `${r.url} -> UID: ${r.uid}${nameInfo}`;
            } else {
              return `${r.url} -> ⚠️ Không nhận diện được UID`;
            }
          });
        }

        txtUrls.value = outputLines.join('\n');
        if (btnCopyUid) btnCopyUid.style.display = 'block';
        if (progressBadge) progressBadge.innerText = `Xong (${results.filter(r => r.uid).length}/${lines.length})`;
      } catch (err) {
        alert('Lỗi chuyển đổi UID: ' + err.message);
      } finally {
        btnConvertUid.disabled = false;
        btnConvertUid.innerHTML = origBtnText;
      }
    });
  }

  // ---------------------------------------------------------
  // 3. TOOL 3: Tách Nhạc Nền (Demucs / Audio Isolation)
  // ---------------------------------------------------------
  const btnSeparate = document.getElementById('btnSeparateAudioDemucs');
  const feedback = document.getElementById('demucsSeparationFeedback');

  if (btnSeparate) {
    btnSeparate.addEventListener('click', async () => {
      if (!window.api || !window.api.pickFile || !window.api.separateAudio) return;

      const file = await window.api.pickFile([
        { name: 'Video & Audio Files', extensions: ['mp4', 'mov', 'mkv', 'avi', 'mp3', 'wav', 'm4a', 'aac'] }
      ]);
      if (!file) return;

      const targetFile = Array.isArray(file) ? file[0] : file;
      btnSeparate.disabled = true;
      const origBtnText = btnSeparate.innerHTML;
      btnSeparate.innerHTML = `
        <div class="spinner" style="display: inline-block; width: 14px; height: 14px; vertical-align: middle; margin-right: 6px;"></div>
        Đang tách kênh Stem...
      `;

      if (feedback) {
        feedback.innerHTML = `
          <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 8px; padding: 10px; margin-top: 8px;">
            <div style="color: #38bdf8; font-weight: 600; display: flex; align-items: center; gap: 8px;">
              <div class="spinner" style="width: 14px; height: 14px;"></div>
              Đang phân tích và tách kênh Vocal & Nhạc nền...
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">
              Tệp: ${targetFile.split(/[\\/]/).pop()}
            </div>
          </div>
        `;
      }

      try {
        const settings = await window.api.getSettings();
        const baseOutDir = settings.outputDir || 'D:\\KOAL\\Kenzious Reel V2\\output';
        const stemDir = `${baseOutDir}\\stems_${Date.now()}`;

        const res = await window.api.separateAudio(targetFile, stemDir);
        currentStemResult = { ...res, stemDir };

        if (feedback) {
          const methodLabel = res.method.includes('demucs') ? 'Demucs AI Model' : 'FFmpeg Spectral Phase Inversion';
          const vocalsUrl = `file:///${res.vocalsPath.replace(/\\/g, '/')}`;
          const noVocalsUrl = `file:///${res.noVocalsPath.replace(/\\/g, '/')}`;

          feedback.innerHTML = `
            <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(52, 211, 153, 0.3); border-radius: 10px; padding: 12px; margin-top: 10px; display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #34d399; font-weight: 700; font-size: 12.5px;">✓ Tách thành công</span>
                <span class="badge badge-info" style="font-size: 10.5px;">${methodLabel}</span>
              </div>

              <div>
                <div style="font-size: 11px; font-weight: 600; color: #f43f5e; margin-bottom: 3px;">🎤 Giọng nói (Vocals.wav):</div>
                <audio controls src="${KZ.safeUrl(vocalsUrl)}" style="width: 100%; height: 32px; border-radius: 6px;"></audio>
              </div>

              <div>
                <div style="font-size: 11px; font-weight: 600; color: #38bdf8; margin-bottom: 3px;">🎵 Nhạc nền & Hiệu ứng (No_Vocals.wav):</div>
                <audio controls src="${KZ.safeUrl(noVocalsUrl)}" style="width: 100%; height: 32px; border-radius: 6px;"></audio>
              </div>

              <div style="display: flex; gap: 8px; margin-top: 4px;">
                <button type="button" class="btn btn-secondary btn-sm" id="btnOpenStemsFolder" style="flex: 1; font-size: 11.5px; padding: 6px;">
                  📁 Mở thư mục
                </button>
                <button type="button" class="btn btn-primary btn-sm" id="btnApplyBgmToTab1" style="flex: 1; font-size: 11.5px; padding: 6px;">
                  🎶 Dùng BGM cho Tab 1
                </button>
              </div>
            </div>
          `;

          // Bind result actions
          const btnOpen = document.getElementById('btnOpenStemsFolder');
          if (btnOpen) {
            btnOpen.addEventListener('click', () => {
              window.api.openDirectory(stemDir);
            });
          }

          const btnApplyBgm = document.getElementById('btnApplyBgmToTab1');
          if (btnApplyBgm) {
            btnApplyBgm.addEventListener('click', () => {
              // Apply to Tab 1
              window.customExtractedBgmPath = res.noVocalsPath;
              const chkBgMusic = document.getElementById('chkBackgroundMusic');
              if (chkBgMusic) chkBgMusic.checked = true;

              alert(`✓ Đã chọn kênh nhạc nền này làm BGM cho Tab 1 (Download & Render)!

Đường dẫn: ${res.noVocalsPath}`);
              
              // Switch to Tab 1
              const tabDownloadBtn = document.querySelector('.nav-item[data-tab="tab-download"]');
              if (tabDownloadBtn) tabDownloadBtn.click();
            });
          }
        }
      } catch (err) {
        if (feedback) {
          feedback.innerHTML = `
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 10px; margin-top: 8px; color: #ef4444; font-size: 12px;">
              Lỗi tách audio: ${escHtml(err.message)}
            </div>
          `;
        }
      } finally {
        btnSeparate.disabled = false;
        btnSeparate.innerHTML = origBtnText;
      }
    });
  }
}
