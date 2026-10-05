/**
 * Clean-Room Facebook Reels Engine (Playwright Engine)
 * Proactive Identity Switcher & Unified Multi-Destination Poster
 * Supports Personal Profile & Fanpages (New Pages Experience - NPE)
 * Ported & Unified directly from Zoo Reup Studio (post.ts, modals.ts)
 */

const path = require('path');
const fs = require('fs');
const profileManager = require('../browser/profile-manager');
const modalSweeper = require('../automation/modal-sweeper');

// Optional SQLite WAL support
let Database;
try {
  Database = require('better-sqlite3');
} catch (_) {
  try { Database = require('sql.js'); } catch (__) { Database = null; }
}

const paths = require('../paths');

function resolveDataDir() {
  return paths.getDataDir();
}

class FacebookPoster {
  constructor() {
    const dataDir = resolveDataDir();
    this.errorDir = path.join(dataDir, 'post_errors');
    if (!fs.existsSync(this.errorDir)) {
      try { fs.mkdirSync(this.errorDir, { recursive: true }); } catch (_) {}
    }

    this.dbPath = path.join(dataDir, 'kenzious.db');
    this.db = null;
    this._initDatabase();
  }

  _initDatabase() {
    if (!Database) return;
    try {
      this.db = new Database(this.dbPath);
      if (typeof this.db.pragma === 'function') this.db.pragma('journal_mode = WAL');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS post_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT DEFAULT 'facebook',
          account_id TEXT,
          destination_id TEXT,
          destination_type TEXT,
          post_id TEXT,
          post_url TEXT,
          caption TEXT,
          video_path TEXT,
          publish_method TEXT,
          success_reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (_) {}
  }

  _savePostEvent(record) {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO post_events (
          platform, account_id, destination_id, destination_type,
          post_id, post_url, caption, video_path, publish_method, success_reason
        ) VALUES (
          @platform, @accountId, @destinationId, @destinationType,
          @postId, @postUrl, @caption, @videoPath, @publishMethod, @successReason
        )
      `);
      stmt.run({
        platform: 'facebook',
        accountId: record.accountId || '',
        destinationId: record.destinationId || '',
        destinationType: record.destinationType || '',
        postId: record.postId || '',
        postUrl: record.postUrl || '',
        caption: record.caption || '',
        videoPath: record.videoPath || '',
        publishMethod: record.publishMethod || '',
        successReason: record.successReason || ''
      });
    } catch (_) {}
  }

  /**
   * Chuyển đổi danh tính chủ động (Proactive Identity Switcher - NPE Engine)
   * Tự động kiểm tra và chuyển đổi giữa Profile cá nhân và các Fanpage con
   */
  async ensureFacebookIdentity(context, page, destinationType, targetDestId, account, onProgress = () => {}) {
    const cookies = await context.cookies('https://www.facebook.com');
    const cUser = cookies.find(c => c.name === 'c_user')?.value;
    const iUser = cookies.find(c => c.name === 'i_user')?.value;
    const mainUid = String(account.uid || account.id || cUser || '').trim();

    const isPersonal = destinationType === 'profile' || !targetDestId || targetDestId === mainUid || targetDestId === cUser;

    if (isPersonal) {
      if (!iUser || iUser === cUser) {
        onProgress({ phase: 'identity_ready', message: '✓ Danh tính hiện tại: Trang cá nhân (Personal Profile).' });
        return;
      }
      onProgress({ phase: 'switching_identity', message: 'Đang chủ động chuyển danh tính về Trang cá nhân...' });
      await context.clearCookies({ name: 'i_user' });
      await context.clearCookies({ name: 'actor_id' });
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
      await page.waitForTimeout(2500);
      onProgress({ phase: 'identity_ready', message: '✓ Đã chuyển về Trang cá nhân thành công.' });
      return;
    }

    // Target is Fanpage
    if (iUser && (iUser === targetDestId || targetDestId.includes(iUser))) {
      onProgress({ phase: 'identity_ready', message: `✓ Danh tính hiện tại đã là Fanpage (ID: ${iUser}).` });
      return;
    }

    onProgress({ phase: 'switching_identity', message: `Đang chủ động chuyển danh tính sang Fanpage (ID: ${targetDestId})...` });

    // Nếu đang đứng ở Page khác, xóa actor cookie để về profile mẹ trước
    if (iUser && iUser !== targetDestId) {
      await context.clearCookies({ name: 'i_user' });
      await context.clearCookies({ name: 'actor_id' });
    }

    // Điều hướng trực tiếp tới Fanpage
    await page.goto(`https://www.facebook.com/profile.php?id=${targetDestId}`, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Tìm nút Switch / Chuyển ngay trên Fanpage header
    const switchBtn = page.locator('div[role="button"], button').filter({
      hasText: /^(Switch|Switch Now|Chuyển|Chuyển ngay)$/i
    }).first();

    if (await switchBtn.count().catch(() => 0) > 0 && await switchBtn.isVisible().catch(() => false)) {
      onProgress({ phase: 'switching_identity', message: 'Nhấn nút chuyển quyền sang Fanpage...' });
      await switchBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(3000);

      // Xác nhận trong hộp thoại modal nếu có
      const confirmBtn = page.locator('div[role="dialog"] div[role="button"], div[role="dialog"] button').filter({
        hasText: /^(Switch|Switch now|Chuyển|Chuyển ngay|Confirm|Xác nhận)$/i
      }).first();
      if (await confirmBtn.count().catch(() => 0) > 0) {
        await confirmBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(3500);
      }
    }

    const updatedCookies = await context.cookies('https://www.facebook.com');
    const newIUser = updatedCookies.find(c => c.name === 'i_user')?.value;
    onProgress({ phase: 'identity_ready', message: `✓ Đã kích hoạt quyền quản trị Fanpage (Active ID: ${newIUser || targetDestId}).` });
  }

  /**
   * Main Upload Interface compatible with publisher.js
   */
  async uploadReel(job, account, onProgress = () => {}) {
    const videoPath = job.videoPath || job.video_path || job.filePath || job.path;
    const captionText = job.caption || job.description || job.title || '';
    const profileDir = account.profileDir || path.join(paths.getProfilesDir(), account.id);

    if (!videoPath || !fs.existsSync(videoPath)) {
      throw new Error(`File video không tồn tại: ${videoPath}`);
    }

    const cleanDestId = String(job.destination_id || '').replace(/^dest_page_/, '').replace(/^dest_main_/, '').trim();
    const destinationType = job.destination_type || (cleanDestId && cleanDestId !== String(account.uid || account.id) ? 'page' : 'profile');
    const isPage = destinationType === 'page';

    onProgress({ phase: 'launching_browser', message: `Khởi tạo Playwright context: ${account.displayName || account.id}...` });

    const { context, page } = await profileManager.launchBrowser(profileDir, {
      proxy: account.proxy,
      headless: false
    });

    try {
      // ── 0. BƯỚC CỐT LÕI: CHỦ ĐỘNG ĐỔI PROFILE / FANPAGE ĐÍCH (PROACTIVE IDENTITY) ──
      await this.ensureFacebookIdentity(context, page, destinationType, cleanDestId, account, onProgress);
      await modalSweeper.sweepFacebookModals(page);

      // ── 1. MỞ TRÌNH TẠO REELS (TIMELINE PAGE NẾU LÀ PAGE HOẶC /REEL/CREATE NẾU PROFILE) ──
      let reelOpened = false;

      if (isPage) {
        // Kiểm tra xem hiện tại đã ở trang Fanpage chưa
        if (!page.url().includes(cleanDestId)) {
          await page.goto(`https://www.facebook.com/profile.php?id=${cleanDestId}`, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await page.waitForTimeout(3000);
        }

        // Kích hoạt nút Reel trên dòng thời gian của Page
        const timelineReelBtn = page.locator('div[role="button"]').filter({
          hasText: /^Reel$|^Thước phim$/i
        }).first();

        if (await timelineReelBtn.count().catch(() => 0) > 0 && await timelineReelBtn.isVisible().catch(() => false)) {
          onProgress({ phase: 'opening_reel', message: 'Nhấn nút Reel trên dòng thời gian Fanpage...' });
          await timelineReelBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(3000);
          reelOpened = true;
        }

        // Fallback: nếu chưa mở được dialog, chuyển sang /reel/create/
        if (!reelOpened && (await page.locator('div[role="dialog"]').count().catch(() => 0)) === 0) {
          onProgress({ phase: 'opening_reel', message: 'Mở trình tạo Reels Fanpage...' });
          await page.goto(`https://www.facebook.com/reels/create/?page_id=${cleanDestId}`, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await page.waitForTimeout(3000);
        }
      } else {
        // Trang cá nhân: điều hướng trực tiếp tới /reel/create
        onProgress({ phase: 'opening_reel', message: 'Mở trình tạo Reels Trang cá nhân...' });
        await page.goto('https://www.facebook.com/reels/create', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
        await page.waitForTimeout(3000);
      }

      await modalSweeper.sweepFacebookModals(page);

      // ── 2. NẠP FILE VIDEO (CHỌN CHÍNH XÁC VIDEO INPUT, TRÁNH TIMELINE PHOTO INPUT) ──
      onProgress({ phase: 'uploading_file', message: 'Nạp file video vào Facebook Reels...' });
      let fileUploaded = false;
      const uploadStart = Date.now();

      while (Date.now() - uploadStart < 35000 && !fileUploaded) {
        // Ưu tiên input video bên trong dialog nếu có, hoặc input video toàn trang
        const fileInput = page.locator('div[role="dialog"] input[type="file"][accept*="video"], input[type="file"][accept*="video"]').first();

        if (await fileInput.count().catch(() => 0) > 0) {
          try {
            await fileInput.setInputFiles(videoPath);
            fileUploaded = true;
            onProgress({ phase: 'uploading_file', message: '✓ Đã đưa file video vào cổng nạp Reels!' });
            break;
          } catch (_) {}
        }

        // Nếu ở /reel/create chưa hiện dialog, thử nhấn nút Create reel / Tạo thước phim
        const sidebarCreateBtn = page.locator('div[role="button"]').filter({
          hasText: /Create reel|Tạo thước phim/i
        }).first();
        if (await sidebarCreateBtn.count().catch(() => 0) > 0 && await sidebarCreateBtn.isVisible().catch(() => false)) {
          await sidebarCreateBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(2000);
        }

        // Nếu ở Page, thử click lại nút Reel trên timeline
        if (isPage) {
          const reelBtn = page.locator('div[role="button"]').filter({ hasText: /^Reel$|^Thước phim$/i }).first();
          if (await reelBtn.count().catch(() => 0) > 0 && await reelBtn.isVisible().catch(() => false)) {
            await reelBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(2000);
          }
        }

        await page.waitForTimeout(1000);
      }

      if (!fileUploaded) {
        const errShot = path.join(this.errorDir, `err_no_video_input_${Date.now()}.png`);
        await page.screenshot({ path: errShot }).catch(() => {});
        throw new Error(`Không tìm thấy cổng nạp video Facebook Reels sau 35s. Ảnh lỗi: ${errShot}`);
      }

      // Đợi Facebook render preview video
      await page.waitForTimeout(4000);

      // ── 3. VÒNG LẶP HỢP NHẤT ZOO REUP: UNIFIED ADVANCE-AND-PUBLISH LOOP ──
      onProgress({ phase: 'advancing_and_posting', message: 'Kích hoạt vòng lặp điều hướng & Đăng Reels (Zoo Reup Engine)...' });

      let publishMethod = 'post_button';
      let postClicked = false;
      let captionInjected = false;
      // Trạng thái trang ngay trước khi bấm Đăng — dùng để xác nhận "modal đã đóng" / "đã rời trang tạo"
      let dialogsAtClick = 0;
      let urlAtClick = '';
      const loopTimeout = 120000;
      const loopStart = Date.now();

      while (Date.now() - loopStart < loopTimeout && !postClicked) {
        await modalSweeper.sweepFacebookModals(page);

        // A. Tìm nút Publish / Post (quét từ dưới lên vì nút dialog nằm cuối DOM)
        const postBtns = page.locator('div[role="button"]').filter({
          hasText: /^(Post|Publish|Đăng)$/i
        });
        const postCount = await postBtns.count().catch(() => 0);

        for (let i = postCount - 1; i >= 0; i--) {
          const btn = postBtns.nth(i);
          const isEnabled = await btn.evaluate(el => !el.hasAttribute('aria-disabled') && el.getAttribute('aria-disabled') !== 'true').catch(() => false);
          if (isEnabled && await btn.isVisible().catch(() => false)) {
            // Nhập Caption tại bước cuối nếu chưa nhập
            if (!captionInjected) {
              const editor = page.locator('div[role="textbox"]:not([aria-label*="Comment" i]), div:has-text("Describe your reel"), div:has-text("Mô tả thước phim")').last();
              if (await editor.count().catch(() => 0) > 0 && await editor.isVisible().catch(() => false)) {
                try {
                  await editor.click({ force: true });
                  await page.waitForTimeout(300);
                  await page.keyboard.press('Control+A');
                  await page.keyboard.press('Backspace');
                  await page.keyboard.type(captionText, { delay: 15 });
                  captionInjected = true;
                  onProgress({ phase: 'entering_caption', message: '✓ Đã nhập tiêu đề & caption vào Reels!' });
                  await page.waitForTimeout(500);
                } catch (_) {}
              }
            }

            onProgress({ phase: 'submitting', message: '✓ Phát hiện nút Đăng / Post đã sẵn sàng. Tiến hành click xuất bản...' });
            dialogsAtClick = await page.locator('div[role="dialog"]').count().catch(() => 0);
            urlAtClick = page.url();
            // Đánh dấu chính nút Đăng vừa bấm: composer chỉ được coi là đã đóng khi nút này biến mất
            await btn.evaluate(el => el.setAttribute('data-kz-post-btn', '1')).catch(() => {});
            await btn.click({ force: true });
            postClicked = true;
            break;
          }
        }

        if (postClicked) break;

        // B. Nếu chưa tới bước cuối hoặc nút Post chưa enabled, tìm nút Next / Tiếp
        const nextBtns = page.locator('div[role="button"]').filter({
          hasText: /^(Next|Tiếp)$/i
        });
        const nextCount = await nextBtns.count().catch(() => 0);

        for (let i = nextCount - 1; i >= 0; i--) {
          const btn = nextBtns.nth(i);
          const isEnabled = await btn.evaluate(el => !el.hasAttribute('aria-disabled') && el.getAttribute('aria-disabled') !== 'true').catch(() => false);
          if (isEnabled && await btn.isVisible().catch(() => false)) {
            // Nhập caption nếu editor đã xuất hiện ở Step 1 (đối với giao diện Profile cá nhân)
            if (!captionInjected && !isPage) {
              const editor = page.locator('div[role="textbox"]:not([aria-label*="Comment" i])').first();
              if (await editor.count().catch(() => 0) > 0 && await editor.isVisible().catch(() => false)) {
                try {
                  await editor.click({ force: true });
                  await page.waitForTimeout(300);
                  await page.keyboard.press('Control+A');
                  await page.keyboard.press('Backspace');
                  await page.keyboard.type(captionText, { delay: 15 });
                  captionInjected = true;
                  onProgress({ phase: 'entering_caption', message: '✓ Đã nhập caption vào giao diện Profile!' });
                  await page.waitForTimeout(500);
                } catch (_) {}
              }
            }

            onProgress({ phase: 'advancing', message: 'Phát hiện nút Tiếp / Next. Điều hướng sang bước kế tiếp...' });
            await btn.click({ force: true });
            await page.waitForTimeout(2500);
            break;
          }
        }

        await page.waitForTimeout(1500);
      }

      if (!postClicked) {
        // Fallback: Thử tìm nút Save as draft nếu FB chặn Post
        const draftBtn = page.locator('div[role="button"]').filter({ hasText: /Save as draft|Lưu bản nháp/i }).last();
        if (await draftBtn.count().catch(() => 0) > 0 && await draftBtn.isVisible().catch(() => false)) {
          await draftBtn.click({ force: true });
          await page.waitForTimeout(4000);
          // Bản nháp KHÔNG phải bài đã đăng — trả trạng thái riêng để publisher không tính là thành công
          onProgress({ phase: 'draft_saved', message: `⚠ Facebook không cho bấm Đăng — đã lưu thành bản nháp trên ${isPage ? 'Fanpage' : 'Profile'}.` });
          return {
            success: false,
            status: 'draft',
            postUrl: page.url(),
            postId: null,
            publishMethod: 'saved_draft',
            captionInjected
          };
        } else {
          const errShot = path.join(this.errorDir, `err_no_publish_${Date.now()}.png`);
          await page.screenshot({ path: errShot }).catch(() => {});
          throw new Error(`Vượt quá thời gian chờ 120s: Không thể tiến qua bước Đăng Reels. Ảnh lỗi: ${errShot}`);
        }
      }

      // ── 4. XÁC NHẬN HOÀN TẤT & ĐIỀU HƯỚNG URL ──
      onProgress({ phase: 'verifying_completion', message: 'Đang xác thực phản hồi xuất bản từ Facebook...' });
      const verifyStart = Date.now();
      let uploadSuccess = false;
      let successReason = '';

      while (Date.now() - verifyStart < 60000) {
        const status = await page.evaluate(({ dialogsAtClick, urlAtClick }) => {
          const bodyText = document.body.innerText || '';
          // Lỗi rõ ràng từ Facebook → chắc chắn CHƯA đăng
          const errMatch = bodyText.match(/Something went wrong|Đã xảy ra (sự cố|lỗi)|couldn'?t (be )?(posted|shared|published)|Your reel couldn'?t|Không thể (đăng|chia sẻ) thước phim|Không đăng được/i);
          if (errMatch) return { ok: false, error: errMatch[0] };

          // Chỉ dùng cụm từ đặc thù của thông báo xuất bản (không dùng "Đã đăng" trơn — trùng chữ trên feed)
          if (/Your reel is being processed|Đang xử lý thước phim|Đã chia sẻ thước phim|Your reel has been shared|Reel published|Đã đăng thước phim/i.test(bodyText)) {
            return { ok: true, reason: 'Toast thông báo đăng thành công' };
          }
          // Modal tạo Reels đóng lại — chỉ có nghĩa khi lúc bấm Đăng thực sự đang có modal,
          // và chính nút Đăng đã bấm cũng biến mất (tránh nhầm khi modalSweeper đóng popup khác)
          const dialogsNow = document.querySelectorAll('div[role="dialog"]').length;
          const postBtnGone = !document.querySelector('[data-kz-post-btn]');
          if (dialogsAtClick > 0 && dialogsNow < dialogsAtClick && postBtnGone) {
            return { ok: true, reason: 'Modal tạo Reels đã đóng sau khi bấm Đăng' };
          }
          // Luồng /reels/create (không có modal): Facebook điều hướng khỏi trang tạo sau khi đăng
          if (/\/reels?\/create/i.test(urlAtClick) && !/\/reels?\/create/i.test(location.href)) {
            return { ok: true, reason: 'Đã rời trang tạo Reels sau khi bấm Đăng' };
          }
          return { ok: false };
        }, { dialogsAtClick, urlAtClick }).catch(() => ({ ok: false }));

        if (status.error) {
          const errShot = path.join(this.errorDir, `err_publish_rejected_${Date.now()}.png`);
          await page.screenshot({ path: errShot }).catch(() => {});
          throw new Error(`Facebook báo lỗi khi đăng: "${status.error}". Ảnh lỗi: ${errShot}`);
        }

        if (status.ok) {
          uploadSuccess = true;
          successReason = status.reason;
          break;
        }

        await modalSweeper.sweepFacebookModals(page);
        await page.waitForTimeout(2000);
      }

      if (!uploadSuccess) {
        // Đã bấm Đăng nhưng không xác nhận được kết quả: bài CÓ THỂ đã lên.
        // Không báo thành công, nhưng cũng không coi là lỗi thường (để publisher không tự đăng lại gây trùng).
        const errShot = path.join(this.errorDir, `err_unverified_${Date.now()}.png`);
        await page.screenshot({ path: errShot }).catch(() => {});
        const err = new Error(`Đã bấm Đăng nhưng không xác nhận được kết quả sau 60s — vui lòng kiểm tra tay trên Facebook. Ảnh: ${errShot}`);
        err.code = 'UNVERIFIED';
        throw err;
      }

      // ── 5. BÓC TÁCH POST ID & LƯU SQLITE WAL ──
      let harvestedPostUrl = page.url();
      let harvestedPostId = '';
      const idMatch = harvestedPostUrl.match(/reel\/(\d+)/) || harvestedPostUrl.match(/videos\/(\d+)/);
      if (idMatch) harvestedPostId = idMatch[1];

      this._savePostEvent({
        accountId: account.id || account.uid || '',
        destinationId: cleanDestId,
        destinationType: destinationType,
        postId: harvestedPostId,
        postUrl: harvestedPostUrl,
        caption: captionText,
        videoPath: videoPath,
        publishMethod: publishMethod,
        successReason: successReason || 'Xuất bản thành công'
      });

      const postIdInfo = harvestedPostId ? ` | Post ID: ${harvestedPostId}` : '';
      onProgress({ phase: 'done', message: `✓ Đăng Reels thành công lên ${isPage ? 'Fanpage' : 'Profile'}! (${successReason})${postIdInfo}` });

      return {
        success: true,
        status: 'posted',
        postUrl: harvestedPostUrl,
        postId: harvestedPostId || null,
        publishMethod,
        captionInjected
      };
    } finally {
      await context.close().catch(() => {});
    }
  }

  async publishVideoToFacebook(job, account, onProgress = () => {}) {
    return this.uploadReel(job, account, onProgress);
  }
}

module.exports = new FacebookPoster();
