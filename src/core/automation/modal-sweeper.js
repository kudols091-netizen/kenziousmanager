/**
 * Clean-Room Modal Sweeper Engine (Playwright Engine)
 * Extracted & ported directly from Zoo Reup Studio (modals.ts, chat-promo.ts)
 */

class ModalSweeper {
  constructor() {
    this.PAGE_SWITCH_DIALOG_RE = /Chuyển|Switch|Dùng trang|Use Page|sang .* để dùng|switch to (using |your )?|Đã cập nhật Trang|Your Page has been updated/i;
    this.CONFIRM_PAGE_BTN_RE = /^\s*(Chuyển|Switch|Dùng trang|Dùng Trang|Use Page|Chuyển ngay|Switch now)\s*$/i;
    this.DISMISS_BTN_RE = /^\s*(Lúc khác|Not now|Not Now|Để sau|Bỏ qua|Skip|Maybe later|Không phải bây giờ)\s*$/i;
    this.CHAT_PROMO_DIALOG_RE = /Trò chuyện trực tiếp|Chat directly|Gọi ngay|Gửi ngay|Call Now|Send now|Thêm nút|Add button|Nhập số điện thoại/i;
  }

  /**
   * Sweeps and dismisses any blocking overlays without interfering with main creation modals
   */
  async sweepFacebookModals(page) {
    if (!page || page.isClosed()) return 0;
    try {
      return await page.evaluate(({ pageSwitchRe, confirmBtnRe, dismissBtnRe, promoRe }) => {
        let swept = 0;
        const pageSwitchRegex = new RegExp(pageSwitchRe, 'i');
        const confirmPageBtnRegex = new RegExp(confirmBtnRe, 'i');
        const dismissBtnRegex = new RegExp(dismissBtnRe, 'i');
        const chatPromoRegex = new RegExp(promoRe, 'i');

        // 1. Quét xử lý các dialog đặc biệt
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], [aria-modal="true"]'));
        for (const dia of dialogs) {
          const diaText = (dia.innerText || dia.textContent || '').trim();

          // Tuyệt đối không can thiệp nếu là modal Tạo Reels / Cài đặt thước phim
          if (/Create reel|Tạo thước phim|Edit reel|Chỉnh sửa thước phim|Reel settings|Cài đặt thước phim/i.test(diaText)) {
            continue;
          }

          // Popup xác nhận chuyển quyền sang Fanpage
          if (pageSwitchRegex.test(diaText)) {
            const diaBtns = Array.from(dia.querySelectorAll('div[role="button"], button, span[role="button"]'));
            for (const btn of diaBtns) {
              const bText = (btn.innerText || btn.textContent || '').trim();
              if (confirmPageBtnRegex.test(bText)) {
                try { btn.click(); swept++; break; } catch (_) {}
              }
            }
          }

          // Popup mời thêm WhatsApp / Chat promo / Số điện thoại
          if (chatPromoRegex.test(diaText)) {
            const diaBtns = Array.from(dia.querySelectorAll('div[role="button"], button, span[role="button"]'));
            for (const btn of diaBtns) {
              const bText = (btn.innerText || btn.textContent || '').trim();
              if (dismissBtnRegex.test(bText)) {
                try { btn.click(); swept++; break; } catch (_) {}
              }
            }
          }
        }

        // 2. Dismiss các nút Lúc khác / Not now bên ngoài modal tạo reels
        const allButtons = Array.from(document.querySelectorAll('div[role="button"], button, span[role="button"], a[role="button"]'));
        for (const btn of allButtons) {
          const txt = (btn.innerText || btn.textContent || '').trim();
          const aria = (btn.getAttribute('aria-label') || '').trim();
          if (dismissBtnRegex.test(txt) || dismissBtnRegex.test(aria)) {
            const inReelsModal = btn.closest('div[role="dialog"]') && /Create reel|Tạo thước phim|Reel settings/i.test(btn.closest('div[role="dialog"]').innerText || '');
            if (!inReelsModal) {
              try { btn.click(); swept++; } catch (_) {}
            }
          }
        }

        return swept;
      }, {
        pageSwitchRe: this.PAGE_SWITCH_DIALOG_RE.source,
        confirmBtnRe: this.CONFIRM_PAGE_BTN_RE.source,
        dismissBtnRe: this.DISMISS_BTN_RE.source,
        promoRe: this.CHAT_PROMO_DIALOG_RE.source
      });
    } catch (_) {
      return 0;
    }
  }
}

module.exports = new ModalSweeper();
