/**
 * Kenzious Get Cookie - Popup Controller
 * Manages tabs, cookie display/export/import, UID extraction, Tokens, and FB Automation triggers.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // State
  let currentTab = null;
  let currentCookies = [];
  let currentFormat = 'header'; // 'header' | 'json' | 'netscape' | 'base64'

  // DOM Elements
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  const currentDomainEl = document.getElementById('currentDomain');
  const siteExtraInfoEl = document.getElementById('siteExtraInfo');
  const siteIconWrapperEl = document.getElementById('siteIconWrapper');
  const siteIconTextEl = document.getElementById('siteIconText');
  const cookieOutputEl = document.getElementById('cookieOutput');

  const pillButtons = document.querySelectorAll('.pill');
  const btnRefreshTab = document.getElementById('btnRefreshTab');
  const btnCopyCookie = document.getElementById('btnCopyCookie');
  const btnCopyInline = document.getElementById('btnCopyInline');
  const btnDownloadCookie = document.getElementById('btnDownloadCookie');

  // Import Modal
  const btnOpenImport = document.getElementById('btnOpenImport');
  const importModal = document.getElementById('importModal');
  const btnCloseImport = document.getElementById('btnCloseImport');
  const btnCancelImport = document.getElementById('btnCancelImport');
  const btnConfirmImport = document.getElementById('btnConfirmImport');
  const importInput = document.getElementById('importInput');
  const chkClearSession = document.getElementById('chkClearSession');
  const chkReloadAfter = document.getElementById('chkReloadAfter');

  // FB Tools
  const btnGetTabUid = document.getElementById('btnGetTabUid');
  const tabUidResult = document.getElementById('tabUidResult');
  const bulkLinksInput = document.getElementById('bulkLinksInput');
  const btnConvertBulk = document.getElementById('btnConvertBulk');
  const btnClearBulk = document.getElementById('btnClearBulk');
  const btnCopyBulkResult = document.getElementById('btnCopyBulkResult');
  const bulkResultArea = document.getElementById('bulkResultArea');
  const bulkCount = document.getElementById('bulkCount');
  const bulkResultOutput = document.getElementById('bulkResultOutput');
  const btnTriggerScanUidModal = document.getElementById('btnTriggerScanUidModal');
  const btnTriggerCloneModal = document.getElementById('btnTriggerCloneModal');

  // Tokens
  const btnGetAdsToken = document.getElementById('btnGetAdsToken');
  const adsTokenOutput = document.getElementById('adsTokenOutput');
  const btnCopyAdsToken = document.getElementById('btnCopyAdsToken');
  const btnGetPancakeToken = document.getElementById('btnGetPancakeToken');
  const pancakeTokenOutput = document.getElementById('pancakeTokenOutput');
  const btnCopyPancakeToken = document.getElementById('btnCopyPancakeToken');

  // Auto Nuôi Nick
  const btnLaunchSidebar = document.getElementById('btnLaunchSidebar');

  // Toast
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');

  /* ==========================================================================
     Tab Navigation
     ========================================================================== */
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      navTabs.forEach(t => t.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  /* ==========================================================================
     Cookie Formats & Refresh
     ========================================================================== */
  pillButtons.forEach(pill => {
    pill.addEventListener('click', () => {
      pillButtons.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFormat = pill.getAttribute('data-format');
      updateCookieDisplay();
    });
  });

  async function loadActiveTabInfo() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        currentDomainEl.textContent = 'Không có tab hoạt động';
        return;
      }

      currentTab = tabs[0];
      const urlObj = new URL(currentTab.url || 'https://www.facebook.com');
      const hostname = urlObj.hostname;
      currentDomainEl.textContent = hostname;

      // Update Site Icon
      updateSiteIcon(hostname);

      // Fetch cookies for current tab
      chrome.runtime.sendMessage({
        action: 'GET_COOKIES',
        payload: { url: currentTab.url, domain: hostname }
      }, (res) => {
        if (res && res.success) {
          currentCookies = res.cookies || [];
          siteExtraInfoEl.textContent = `${currentCookies.length} cookies phát hiện`;

          // If on Facebook, check c_user
          if (hostname.includes('facebook.com')) {
            const cUser = currentCookies.find(c => c.name === 'c_user');
            if (cUser) {
              siteExtraInfoEl.textContent = `FB UID: ${cUser.value} (${currentCookies.length} cookies)`;
            }
          }

          updateCookieDisplay();
        } else {
          siteExtraInfoEl.textContent = 'Không thể lấy cookie';
          cookieOutputEl.value = 'Lỗi hoặc không có quyền truy cập cookie trang này.';
        }
      });
    } catch (e) {
      currentDomainEl.textContent = 'Trang hệ thống';
      siteExtraInfoEl.textContent = 'Không áp dụng';
    }
  }

  function updateSiteIcon(hostname) {
    if (hostname.includes('facebook.com') || hostname.includes('messenger.com')) {
      siteIconTextEl.textContent = '📘';
      siteIconWrapperEl.style.background = 'rgba(59, 89, 152, 0.2)';
    } else if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) {
      siteIconTextEl.textContent = '🤖';
      siteIconWrapperEl.style.background = 'rgba(16, 163, 127, 0.2)';
    } else if (hostname.includes('gemini.google.com')) {
      siteIconTextEl.textContent = '✨';
      siteIconWrapperEl.style.background = 'rgba(124, 58, 237, 0.2)';
    } else if (hostname.includes('tiktok.com')) {
      siteIconTextEl.textContent = '🎵';
      siteIconWrapperEl.style.background = 'rgba(254, 44, 85, 0.2)';
    } else if (hostname.includes('youtube.com')) {
      siteIconTextEl.textContent = '▶️';
      siteIconWrapperEl.style.background = 'rgba(255, 0, 0, 0.2)';
    } else if (hostname.includes('instagram.com') || hostname.includes('threads.net')) {
      siteIconTextEl.textContent = '📸';
      siteIconWrapperEl.style.background = 'rgba(225, 48, 108, 0.2)';
    } else if (hostname.includes('x.com') || hostname.includes('twitter.com') || hostname.includes('grok.com')) {
      siteIconTextEl.textContent = '✖️';
      siteIconWrapperEl.style.background = 'rgba(255, 255, 255, 0.15)';
    } else {
      siteIconTextEl.textContent = '🌐';
      siteIconWrapperEl.style.background = 'rgba(153, 80, 250, 0.15)';
    }
  }

  function updateCookieDisplay() {
    if (!currentCookies || currentCookies.length === 0) {
      cookieOutputEl.value = 'Chưa phát hiện cookie nào trên trang này.';
      return;
    }

    let output = '';
    switch (currentFormat) {
      case 'header':
        output = CookieParser.toHeaderString(currentCookies);
        break;
      case 'json':
        output = CookieParser.toJSON(currentCookies);
        break;
      case 'netscape':
        output = CookieParser.toNetscape(currentCookies);
        break;
      case 'base64':
        output = CookieParser.toBase64(currentCookies);
        break;
      default:
        output = CookieParser.toHeaderString(currentCookies);
    }
    cookieOutputEl.value = output;
  }

  btnRefreshTab.addEventListener('click', () => {
    loadActiveTabInfo();
    showToast('Đã làm mới dữ liệu cookie!');
  });

  /* ==========================================================================
     Copy & Download Cookie
     ========================================================================== */
  function copyTextToClipboard(text, successMsg = 'Đã sao chép vào bộ nhớ tạm!') {
    if (!text) {
      showToast('Nội dung trống, không thể sao chép!');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    }).catch(() => {
      // Fallback
      cookieOutputEl.select();
      document.execCommand('copy');
      showToast(successMsg);
    });
  }

  btnCopyCookie.addEventListener('click', () => {
    copyTextToClipboard(cookieOutputEl.value, 'Đã copy toàn bộ Cookie!');
  });

  btnCopyInline.addEventListener('click', () => {
    copyTextToClipboard(cookieOutputEl.value, 'Đã copy Cookie!');
  });

  btnDownloadCookie.addEventListener('click', () => {
    if (!cookieOutputEl.value) {
      showToast('Không có cookie để tải về!');
      return;
    }

    const host = currentTab && currentTab.url ? new URL(currentTab.url).hostname : 'cookie';
    const ext = currentFormat === 'json' ? 'json' : 'txt';
    const filename = `kenzious_cookie_${host}_${Date.now()}.${ext}`;

    const blob = new Blob([cookieOutputEl.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);

    showToast(`Đã tải file: ${filename}`);
  });

  /* ==========================================================================
     Import Cookie Modal Handlers
     ========================================================================== */
  btnOpenImport.addEventListener('click', () => {
    importModal.classList.remove('hidden');
    importInput.focus();
  });

  const closeImportModal = () => {
    importModal.classList.add('hidden');
    importInput.value = '';
  };

  btnCloseImport.addEventListener('click', closeImportModal);
  btnCancelImport.addEventListener('click', closeImportModal);

  btnConfirmImport.addEventListener('click', () => {
    const rawInput = importInput.value.trim();
    if (!rawInput) {
      showToast('Vui lòng dán chuỗi cookie hợp lệ!');
      return;
    }

    const targetUrl = currentTab && currentTab.url ? currentTab.url : 'https://www.facebook.com';
    const parsedUrl = new URL(targetUrl);
    const cookiesToImport = CookieParser.parseInput(rawInput, parsedUrl.hostname);

    if (!cookiesToImport || cookiesToImport.length === 0) {
      showToast('Không nhận diện được định dạng Cookie hợp lệ!');
      return;
    }

    btnConfirmImport.textContent = 'Đang nạp...';
    btnConfirmImport.disabled = true;

    chrome.runtime.sendMessage({
      action: 'IMPORT_COOKIES',
      payload: {
        cookies: cookiesToImport,
        targetUrl: targetUrl,
        clearExisting: chkClearSession.checked
      }
    }, (res) => {
      btnConfirmImport.textContent = 'Nạp Cookie Ngay';
      btnConfirmImport.disabled = false;

      if (res && res.success) {
        closeImportModal();
        showToast(`Đã nạp thành công ${res.count}/${res.total} cookie!`);

        if (chkReloadAfter.checked && currentTab && currentTab.id) {
          setTimeout(() => {
            chrome.tabs.reload(currentTab.id);
            window.close();
          }, 800);
        } else {
          loadActiveTabInfo();
        }
      } else {
        showToast('Lỗi khi nạp cookie: ' + (res ? res.error : 'Không rõ'));
      }
    });
  });

  /* ==========================================================================
     Facebook Tools Handlers
     ========================================================================== */
  btnGetTabUid.addEventListener('click', async () => {
    if (!currentTab || !currentTab.url) {
      tabUidResult.innerHTML = '<span class="placeholder-text">Không tìm thấy tab.</span>';
      return;
    }

    tabUidResult.innerHTML = '<span class="placeholder-text">Đang phân tích UID Facebook...</span>';

    // 1. Try asking content script on the tab first
    try {
      chrome.tabs.sendMessage(currentTab.id, { action: 'GET_CURRENT_PAGE_UID' }, (resp) => {
        if (resp && resp.success && resp.uid) {
          renderUidResult(resp.uid, resp.type || 'Profile');
          return;
        }

        // 2. If content script didn't resolve, send to service worker
        chrome.runtime.sendMessage({
          action: 'RESOLVE_FB_UID',
          payload: { link: currentTab.url }
        }, (res) => {
          if (res && res.success && res.uid) {
            renderUidResult(res.uid, 'URL Page');
          } else {
            tabUidResult.innerHTML = '<span class="placeholder-text" style="color:var(--danger)">Không tìm thấy UID cho tab này.</span>';
          }
        });
      });
    } catch (e) {
      tabUidResult.innerHTML = '<span class="placeholder-text" style="color:var(--danger)">Lỗi: ' + e.message + '</span>';
    }
  });

  function renderUidResult(uid, type) {
    tabUidResult.innerHTML = `
      <div>
        <span style="font-size:10.5px;color:var(--text-muted)">${type}:</span>
        <span class="uid-value">${uid}</span>
      </div>
      <button class="btn btn-sm btn-violet" id="btnCopyTabUid">Copy</button>
    `;
    document.getElementById('btnCopyTabUid').addEventListener('click', () => {
      copyTextToClipboard(uid, `Đã copy UID: ${uid}`);
    });
  }

  // Bulk Convert Links to UID
  btnConvertBulk.addEventListener('click', async () => {
    const text = bulkLinksInput.value.trim();
    if (!text) {
      showToast('Vui lòng nhập ít nhất 1 link Facebook!');
      return;
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    btnConvertBulk.textContent = 'Đang xử lý...';
    btnConvertBulk.disabled = true;

    const resolvedList = [];

    for (const line of lines) {
      // Direct numeric check
      const numMatch = line.match(/(?:id=|profile\.php\?id=|\/posts\/|\/reel\/|\/videos\/|\/groups\/)(\d{6,})/);
      if (numMatch && numMatch[1]) {
        resolvedList.push(numMatch[1]);
        continue;
      }

      // Check service worker resolver
      try {
        const res = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'RESOLVE_FB_UID', payload: { link: line } }, resolve);
        });
        if (res && res.success && res.uid) {
          resolvedList.push(res.uid);
        } else {
          resolvedList.push(`[Không tìm thấy] ${line}`);
        }
      } catch (err) {
        resolvedList.push(`[Lỗi] ${line}`);
      }
    }

    bulkResultArea.classList.remove('hidden');
    bulkCount.textContent = resolvedList.filter(u => !u.startsWith('[')).length;
    bulkResultOutput.value = resolvedList.join('\n');
    btnCopyBulkResult.disabled = false;

    btnConvertBulk.textContent = 'Chuyển sang UID';
    btnConvertBulk.disabled = false;
    showToast(`Đã phân giải xong ${lines.length} liên kết!`);
  });

  btnClearBulk.addEventListener('click', () => {
    bulkLinksInput.value = '';
    bulkResultOutput.value = '';
    bulkResultArea.classList.add('hidden');
    btnCopyBulkResult.disabled = true;
  });

  btnCopyBulkResult.addEventListener('click', () => {
    copyTextToClipboard(bulkResultOutput.value, 'Đã copy toàn bộ danh sách UID!');
  });

  // Launch Modals on Facebook
  btnTriggerScanUidModal.addEventListener('click', async () => {
    if (!currentTab || !currentTab.url || !currentTab.url.includes('facebook.com')) {
      showToast('Tính năng này chỉ hoạt động trên tab Facebook!');
      return;
    }

    chrome.tabs.sendMessage(currentTab.id, { action: 'OPEN_SCAN_UID_MODAL' }, (res) => {
      if (chrome.runtime.lastError) {
        showToast('Vui lòng F5 lại trang Facebook để tải script!');
      } else {
        window.close(); // Close popup so user sees the modal on page
      }
    });
  });

  btnTriggerCloneModal.addEventListener('click', async () => {
    if (!currentTab || !currentTab.url || !currentTab.url.includes('facebook.com')) {
      showToast('Tính năng này chỉ hoạt động trên tab Facebook!');
      return;
    }

    chrome.tabs.sendMessage(currentTab.id, { action: 'OPEN_CLONE_POST_MODAL' }, (res) => {
      if (chrome.runtime.lastError) {
        showToast('Vui lòng F5 lại trang Facebook để tải script!');
      } else {
        window.close();
      }
    });
  });

  /* ==========================================================================
     Tokens Tab Handlers
     ========================================================================== */
  btnGetAdsToken.addEventListener('click', () => {
    btnGetAdsToken.textContent = 'Đang lấy...';
    btnGetAdsToken.disabled = true;

    chrome.runtime.sendMessage({ action: 'GET_ADS_TOKEN' }, (res) => {
      btnGetAdsToken.textContent = 'Lấy Token';
      btnGetAdsToken.disabled = false;

      if (res && res.success && res.token) {
        adsTokenOutput.value = res.token;
        showToast('Lấy Token Ads EAAB thành công!');
      } else if (res && res.fb_dtsg) {
        adsTokenOutput.value = 'fb_dtsg: ' + res.fb_dtsg;
        showToast(res.message || 'Lấy được thông tin phiên.');
      } else {
        adsTokenOutput.value = '';
        showToast(res ? res.error : 'Không lấy được Token. Hãy đăng nhập Ads Manager!');
      }
    });
  });

  btnCopyAdsToken.addEventListener('click', () => {
    copyTextToClipboard(adsTokenOutput.value, 'Đã copy Token Ads EAAB!');
  });

  btnGetPancakeToken.addEventListener('click', () => {
    btnGetPancakeToken.textContent = 'Đang lấy...';
    btnGetPancakeToken.disabled = true;

    chrome.runtime.sendMessage({ action: 'GET_PANCAKE_TOKEN' }, (res) => {
      btnGetPancakeToken.textContent = 'Lấy Token';
      btnGetPancakeToken.disabled = false;

      if (res && res.success && res.token) {
        pancakeTokenOutput.value = res.token;
        showToast('Lấy Token Pancake thành công!');
      } else {
        pancakeTokenOutput.value = '';
        showToast(res ? res.error : 'Không tìm thấy Token Pancake!');
      }
    });
  });

  btnCopyPancakeToken.addEventListener('click', () => {
    copyTextToClipboard(pancakeTokenOutput.value, 'Đã copy Token Pancake!');
  });

  /* ==========================================================================
     Auto Nuôi Nick Handlers
     ========================================================================== */
  btnLaunchSidebar.addEventListener('click', async () => {
    if (!currentTab || !currentTab.url || !currentTab.url.includes('facebook.com')) {
      // Prompt and open Facebook tab
      chrome.tabs.create({ url: 'https://www.facebook.com' });
      showToast('Đang mở Facebook để kích hoạt bộ nuôi nick!');
      window.close();
      return;
    }

    chrome.tabs.sendMessage(currentTab.id, { action: 'TOGGLE_AUTO_SIDEBAR' }, (res) => {
      if (chrome.runtime.lastError) {
        showToast('Vui lòng F5 lại trang Facebook để tải công cụ!');
      } else {
        window.close();
      }
    });
  });

  /* ==========================================================================
     Toast Notification Helper
     ========================================================================== */
  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    toastMessage.textContent = msg;
    toast.classList.remove('hidden');

    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }

  // Initial tab loading
  loadActiveTabInfo();
});
