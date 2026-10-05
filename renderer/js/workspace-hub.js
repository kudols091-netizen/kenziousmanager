/**
 * workspace-hub.js - Bộ điều khiển Dual-Workspace & Multi-Window Hub
 * Phân chia Kenzious Reel v2 thành 2 không gian làm việc chuyên biệt:
 * 1. Kenzious Reup (AI Video Studio, Sub Karaoke ASS, Render 9:16)
 * 2. Kenzious Facebook Reel (Dàn Clone / Via 16 cột, Check Live, Token Katana, Đăng Reel)
 * Hỗ trợ chế độ Multi-Window (Dual Monitor) chạy 2 cửa sổ độc lập song song.
 */

(function () {
  'use strict';

  let fbReelInitialized = false;

  function initHub() {
    const wsReup = document.getElementById('workspace-reup');
    const wsFbReel = document.getElementById('workspace-fbreel');
    const modalHub = document.getElementById('modalWelcomeHub');
    const chkRemember = document.getElementById('chkRememberHub');

    // Kiểm tra xem có đang mở từ Multi-Window với query param ?ws=... hay không
    const urlParams = new URLSearchParams(window.location.search);
    const queryWs = urlParams.get('ws');

    if (queryWs) {
      // Cửa sổ Multi-Window độc lập: ẩn modal và vào thẳng workspace chỉ định
      if (modalHub) modalHub.classList.remove('active');
      switchWorkspace(queryWs, false);
      document.title = (queryWs === 'reup')
        ? 'Kenzious Reup Studio — AI Video & Render 9:16'
        : 'Kenzious Facebook Reel — Dàn Clone & Bulk Publisher';
      setupMultiWindowListeners();
      return;
    }

    // Đọc cài đặt mặc định
    const defaultHub = localStorage.getItem('kenzious_default_hub');
    const activeWs = localStorage.getItem('kenzious_active_workspace') || 'reup';

    if (!defaultHub && modalHub) {
      // Chưa lưu hub mặc định -> hiển thị Welcome Hub Modal
      modalHub.classList.add('active');
    } else {
      // Đã có mặc định hoặc mở lại app -> vào thẳng Workspace
      switchWorkspace(defaultHub || activeWs, false);
    }

    // Sự kiện nút chuyển trên Topbar
    document.querySelectorAll('.ws-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        if (target === 'workspace-reup') switchWorkspace('reup', false);
        else if (target === 'workspace-fbreel') switchWorkspace('fbreel', false);
        else if (target === 'workspace-igreel') switchWorkspace('igreel', false);
      });
    });

    // Sự kiện chọn từ Welcome Hub Cards
    const cardReup = document.getElementById('btnSelectHubReup');
    if (cardReup) {
      cardReup.addEventListener('click', () => {
        const remember = chkRemember && chkRemember.checked;
        switchWorkspace('reup', remember);
        if (modalHub) modalHub.classList.remove('active');
      });
    }

    const cardFbReel = document.getElementById('btnSelectHubFbReel');
    if (cardFbReel) {
      cardFbReel.addEventListener('click', () => {
        const remember = chkRemember && chkRemember.checked;
        switchWorkspace('fbreel', remember);
        if (modalHub) modalHub.classList.remove('active');
      });
    }

    const cardIgReel = document.getElementById('btnSelectHubIgReel');
    if (cardIgReel) {
      cardIgReel.addEventListener('click', () => {
        const remember = chkRemember && chkRemember.checked;
        switchWorkspace('igreel', remember);
        if (modalHub) modalHub.classList.remove('active');
      });
    }

    const igMascot = document.getElementById('igReelMascot');
    if (igMascot && modalHub) {
      igMascot.addEventListener('click', () => modalHub.classList.add('active'));
    }

    const btnBackIg = document.getElementById('btnHubBackToReupFromIg');
    if (btnBackIg && modalHub) {
      btnBackIg.addEventListener('click', () => modalHub.classList.add('active'));
    }

    // Nút đóng modal Hub
    const btnCloseHub = document.getElementById('btnCloseHubModal');
    if (btnCloseHub && modalHub) {
      btnCloseHub.addEventListener('click', () => {
        modalHub.classList.remove('active');
      });
    }

    // Nút mở lại Hub Launcher từ Header/Mascot
    const btnOpenHub = document.getElementById('btnOpenHubLauncher');
    if (btnOpenHub && modalHub) {
      btnOpenHub.addEventListener('click', () => {
        modalHub.classList.add('active');
      });
    }

    const btnBack = document.getElementById('btnHubBackToReup');
    if (btnBack) {
      btnBack.addEventListener('click', () => switchWorkspace('reup', false));
    }

    const btnRetryIg = document.getElementById('btnRetryIgServer');
    if (btnRetryIg) {
      btnRetryIg.onclick = () => {
        btnRetryIg.innerText = '⏳ Đang kiểm tra cổng 5055...';
        checkAndLoadIgReel();
        setTimeout(() => {
          btnRetryIg.innerText = '🔄 Thử Kết Nối Lại (Port 5055)';
        }, 1500);
      };
    }

    const fbMascot = document.getElementById('fbReelMascot');
    if (fbMascot && modalHub) {
      fbMascot.addEventListener('click', () => modalHub.classList.add('active'));
    }

    setupMultiWindowListeners();

    // Phím tắt bàn phím: Alt + 1 (Reup), Alt + 2 (FB Reel), Alt + W (Mở Reup mới), Alt + E (Mở FB Reel mới)
    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        switchWorkspace('reup', false);
      } else if (e.altKey && e.key === '2') {
        e.preventDefault();
        switchWorkspace('fbreel', false);
      } else if (e.altKey && e.key === '3') {
        e.preventDefault();
        switchWorkspace('igreel', false);
      } else if (e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        if (window.api && window.api.openWorkspaceWindow) window.api.openWorkspaceWindow('reup');
      } else if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        if (window.api && window.api.openWorkspaceWindow) window.api.openWorkspaceWindow('fbreel');
      }
    });

    console.log('[Kenzious Hub] Dual-Workspace & Multi-Window Controller sẵn sàng (Alt+1, Alt+2, Alt+W, Alt+E).');
  }

  function setupMultiWindowListeners() {
    // Nút mở FB Reel ở Cửa Sổ Mới từ Reup Studio
    const btnOpenFbReelWin = document.getElementById('btnOpenFbReelNewWin');
    if (btnOpenFbReelWin) {
      btnOpenFbReelWin.onclick = () => {
        if (window.api && window.api.openWorkspaceWindow) {
          window.api.openWorkspaceWindow('fbreel');
        }
      };
    }

    // Nút mở Reup Studio ở Cửa Sổ Mới từ FB Reel
    const btnOpenReupWin = document.getElementById('btnOpenReupNewWin');
    if (btnOpenReupWin) {
      btnOpenReupWin.onclick = () => {
        if (window.api && window.api.openWorkspaceWindow) {
          window.api.openWorkspaceWindow('reup');
        }
      };
    }
  }

  function checkAndLoadIgReel() {
    const iframe = document.getElementById('iframe-igreel');
    const offlineState = document.getElementById('igreel-offline-state');
    if (!iframe) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800);

    fetch('http://localhost:5055', { mode: 'no-cors', signal: controller.signal })
      .then(() => {
        clearTimeout(timeoutId);
        iframe.style.display = 'block';
        if (offlineState) offlineState.style.display = 'none';
        if (!iframe.src || iframe.src === 'about:blank') {
          iframe.src = 'http://localhost:5055';
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        iframe.style.display = 'none';
        if (offlineState) offlineState.style.display = 'flex';
      });
  }

  /**
   * Chuyển đổi giữa các Workspace
   */
  function switchWorkspace(mode, saveAsDefault = false) {
    const wsReup = document.getElementById('workspace-reup');
    const wsFbReel = document.getElementById('workspace-fbreel');
    const wsIgReel = document.getElementById('workspace-igreel');

    if (wsReup) {
      const active = (mode === 'reup');
      wsReup.classList.toggle('hidden-ws', !active);
      wsReup.style.display = active ? 'flex' : 'none';
    }

    if (wsFbReel) {
      const active = (mode === 'fbreel');
      wsFbReel.classList.toggle('hidden-ws', !active);
      wsFbReel.style.display = active ? 'flex' : 'none';
      if (active) initFbReelOnce();
    }

    if (wsIgReel) {
      const active = (mode === 'igreel');
      wsIgReel.classList.toggle('hidden-ws', !active);
      wsIgReel.style.display = active ? 'flex' : 'none';
      if (active) {
        checkAndLoadIgReel();
      }
    }

    // Cập nhật trạng thái nút Switcher trên thanh Topbar
    document.querySelectorAll('.ws-tab-btn').forEach(btn => {
      const target = btn.getAttribute('data-target');
      btn.classList.toggle('active', 
        (mode === 'reup' && target === 'workspace-reup') ||
        (mode === 'fbreel' && target === 'workspace-fbreel') ||
        (mode === 'igreel' && target === 'workspace-igreel')
      );
    });

    localStorage.setItem('kenzious_active_workspace', mode);
    if (saveAsDefault) {
      localStorage.setItem('kenzious_default_hub', mode);
    }
  }
  window.switchWorkspace = switchWorkspace;
  // Nút trong index.html (thay cho onclick inline)
  window.KZ.action('switchWorkspace', function (el) { switchWorkspace(el.dataset.ws, false); });
  window.KZ.action('reloadIgFrame', function () {
    var f = document.getElementById('iframe-igreel');
    if (f) f.src = 'http://localhost:5055?t=' + Date.now();
  });

  /**
   * Khởi tạo các sự kiện và panel của Facebook Reel (chỉ chạy 1 lần khi mở phân hệ)
   */
  function initFbReelOnce() {
    if (fbReelInitialized) return;
    fbReelInitialized = true;

    // Sidebar navigation của Facebook Reel
    function showFbNav(nav) {
      if (nav === 'pgtool') {
        try { if (window.kzCloneTabShow) window.kzCloneTabShow(false); } catch (_) {}
        try {
          if (window.kzReelSwitchTab) window.kzReelSwitchTab('posts');
          else if (window.kzReelTabShow) window.kzReelTabShow(true);
        } catch (_) {}
        try { if (window.kzOpenPgTool) window.kzOpenPgTool(); } catch (_) {}
        return;
      }

      const isClone = (nav === 'clone');
      try { if (window.kzCloneTabShow) window.kzCloneTabShow(isClone); } catch (_) {}

      if (isClone) {
        try { if (window.kzReelTabShow) window.kzReelTabShow(false); } catch (_) {}
      } else if (nav === 'reel') {
        try {
          if (window.kzReelSwitchTab) window.kzReelSwitchTab('posts');
          else if (window.kzReelTabShow) window.kzReelTabShow(true);
        } catch (_) {}
      } else {
        try { if (window.kzReelSwitchTab) window.kzReelSwitchTab(nav); } catch (_) {}
      }

      document.querySelectorAll('#workspace-fbreel .kz-navi[data-nav]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-nav') === nav);
      });
      try { localStorage.setItem('kenzi_nav', nav); } catch (_) {}
    }

    document.querySelectorAll('#workspace-fbreel .kz-navi[data-nav]').forEach(b => {
      b.onclick = function () {
        showFbNav(this.getAttribute('data-nav'));
      };
    });

    // Nút Đăng Reel to ở chân Sidebar FB
    const topPostBtn = document.getElementById('kz-toppost');
    if (topPostBtn) {
      topPostBtn.onclick = function () {
        showFbNav('reel');
        try { if (window.kzReelStart) window.kzReelStart(); } catch (_) {}
      };
    }

    // Khởi tạo tab mặc định của FB Reel
    const lastNav = localStorage.getItem('kenzi_nav') || 'reel';
    showFbNav(lastNav);

    console.log('[Facebook Reel] Phân hệ Facebook Reel đã kết nối Native Bridge thành công.');
  }

  // Khởi động khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHub);
  } else {
    initHub();
  }
})();
