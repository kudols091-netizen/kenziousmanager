const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const storage = require('./storage');

class ChannelManager {
  constructor() {
    this.activeBrowsers = new Map();
  }

  getExecutablePath() {
    const localAppData = process.env.LOCALAPPDATA || '';
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe'),
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
    ];
    for (const p of chromePaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  getPlatformLoginUrl(platform) {
    switch (platform.toLowerCase()) {
      case 'tiktok': return 'https://www.tiktok.com/login';
      case 'youtube': return 'https://studio.youtube.com/';
      case 'facebook': return 'https://www.facebook.com/';
      case 'instagram': return 'https://www.instagram.com/accounts/login/';
      case 'threads': return 'https://www.threads.net/login';
      case 'zalo': return 'https://video.zalo.me/';
      default: return 'https://google.com';
    }
  }

  // 1. Nhập Cookie trực tiếp (JSON / Header string)
  async importCookies(platform, rawInput, proxy = '', accountName = '') {
    let cookies = [];
    try {
      if (rawInput.trim().startsWith('[') || rawInput.trim().startsWith('{')) {
        const parsed = JSON.parse(rawInput);
        cookies = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        // Parse header format: name1=value1; name2=value2;
        const pairs = rawInput.split(';');
        for (const pair of pairs) {
          const idx = pair.indexOf('=');
          if (idx > -1) {
            const name = pair.substring(0, idx).trim();
            const value = pair.substring(idx + 1).trim();
            if (name && value) {
              cookies.push({ name, value, domain: `.${platform}.com` });
            }
          }
        }
      }
    } catch (e) {
      throw new Error(`Định dạng Cookie không hợp lệ: ${e.message}`);
    }

    if (cookies.length === 0) {
      throw new Error('Không tìm thấy cookie nào!');
    }

    // Trích xuất username gợi ý
    let detectedUsername = accountName;
    if (!detectedUsername) {
      if (platform === 'facebook') {
        const cUser = cookies.find(c => c.name === 'c_user');
        detectedUsername = cUser ? `FB_${cUser.value}` : `Facebook_${Date.now()}`;
      } else if (platform === 'tiktok') {
        detectedUsername = `TikTok_${Date.now().toString().slice(-4)}`;
      } else {
        detectedUsername = `${platform}_${Date.now().toString().slice(-4)}`;
      }
    }

    const account = {
      id: `acc_${Date.now()}`,
      platform,
      username: detectedUsername,
      displayName: detectedUsername,
      avatar: '',
      proxy: proxy.trim(),
      cookies,
      status: 'connected',
      method: 'cookie_import',
      lastCheck: Date.now(),
      destinations: [
        { id: 'dest_main', name: 'Kênh chính', type: 'profile', selected: true }
      ]
    };

    storage.addAccount(account);
    return account;
  }

  // Hủy tất cả các phiên trình duyệt đang mở
  cancelAllActiveBrowsers() {
    for (const [id, browser] of this.activeBrowsers.entries()) {
      try {
        browser.close().catch(() => {});
      } catch (e) {}
    }
    this.activeBrowsers.clear();
    return true;
  }

  // 2. Mở trình duyệt trực quan đăng nhập và tự động lưu phiên
  async interactiveLogin(platform, proxy = '', onStatusUpdate = () => {}) {
    const execPath = this.getExecutablePath();
    if (!execPath) {
      throw new Error('Không tìm thấy Google Chrome hoặc Microsoft Edge trên máy tính!');
    }

    const accountId = `acc_${Date.now()}`;
    const profileDir = path.resolve(__dirname, '..', '..', 'data', 'profiles', accountId);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    const targetUrl = this.getPlatformLoginUrl(platform);

    const args = [
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      targetUrl // Tải thẳng URL đích ngay từ frame đầu tiên để không bị màn hình trắng about:blank
    ];

    if (proxy && proxy.trim()) {
      args.push(`--proxy-server=${proxy.trim()}`);
    }

    onStatusUpdate('Đang mở trình duyệt trực quan...');

    const browser = await puppeteer.launch({
      executablePath: execPath,
      headless: false,
      defaultViewport: null,
      args
    });

    this.activeBrowsers.set(accountId, browser);

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    // Đưa cửa sổ lên phía trước
    await page.bringToFront().catch(() => {});

    onStatusUpdate(`Trình duyệt đã mở ở phía trước. Hãy đăng nhập tài khoản ${platform} của bạn...`);

    // Polling kiểm tra đăng nhập thành công
    return new Promise((resolve, reject) => {
      let pollCount = 0;
      const interval = setInterval(async () => {
        try {
          pollCount++;

          // Kiểm tra xem trình duyệt có bị người dùng tắt không
          if (!browser.isConnected()) {
            clearInterval(interval);
            this.activeBrowsers.delete(accountId);
            reject(new Error('Người dùng đã đóng trình duyệt trước khi hoàn tất đăng nhập.'));
            return;
          }

          const currentCookies = await page.cookies().catch(() => []);
          let loggedIn = false;
          let displayName = `${platform}_${Date.now().toString().slice(-4)}`;
          let avatar = '';

          const curUrl = page.url();

          if (platform === 'facebook') {
            const cUser = currentCookies.find(c => c.name === 'c_user');
            if (cUser) {
              loggedIn = true;
              displayName = `FB_${cUser.value}`;
            }
          } else if (platform === 'tiktok') {
            const hasSession = currentCookies.some(c => c.name === 'sessionid');
            if (hasSession || (!curUrl.includes('/login') && curUrl.includes('tiktok.com/@'))) {
              loggedIn = true;
              displayName = `TikTok_Creator`;
            }
          } else if (platform === 'youtube') {
            if (curUrl.includes('studio.youtube.com') && !curUrl.includes('accounts.google.com')) {
              loggedIn = true;
              displayName = `YouTube_Studio`;
            }
          } else if (platform === 'instagram') {
            const hasSession = currentCookies.some(c => c.name === 'sessionid');
            if (hasSession) {
              loggedIn = true;
              displayName = `Instagram_User`;
            }
          } else if (platform === 'threads') {
            const hasSession = currentCookies.some(c => c.name === 'sessionid');
            if (hasSession) {
              loggedIn = true;
              displayName = `Threads_User`;
            }
          } else if (platform === 'zalo') {
            const hasSek = currentCookies.some(c => c.name === 'zpw_sek');
            if (hasSek || curUrl.includes('video.zalo.me/creator')) {
              loggedIn = true;
              displayName = `Zalo_Creator`;
            }
          } else {
            if (currentCookies.length > 5 && !curUrl.includes('login')) {
              loggedIn = true;
            }
          }

          if (loggedIn) {
            clearInterval(interval);
            onStatusUpdate('Đăng nhập thành công! Đang lưu thông tin phiên...');

            // Chờ 1 giây để cookie phiên đồng bộ đầy đủ
            await new Promise(r => setTimeout(r, 1000));
            const finalCookies = await page.cookies().catch(() => currentCookies);

            // Lưu cookie ra profile folder
            fs.writeFileSync(
              path.join(profileDir, 'cookies.json'),
              JSON.stringify(finalCookies, null, 2),
              'utf-8'
            );

            await browser.close().catch(() => {});
            this.activeBrowsers.delete(accountId);

            const newAccount = {
              id: accountId,
              platform,
              username: displayName,
              displayName,
              avatar,
              proxy: proxy.trim(),
              cookies: finalCookies,
              profileDir,
              status: 'connected',
              method: 'interactive_login',
              lastCheck: Date.now(),
              destinations: [
                { id: 'dest_main', name: 'Kênh mặc định', type: 'profile', selected: true }
              ]
            };

            storage.addAccount(newAccount);
            resolve(newAccount);
          }

          // Timeout sau 10 phút nếu người dùng chưa hoàn tất
          if (pollCount > 300) {
            clearInterval(interval);
            await browser.close().catch(() => {});
            this.activeBrowsers.delete(accountId);
            reject(new Error('Hết thời gian chờ đăng nhập (Timeout 10 phút).'));
          }
        } catch (e) {
          // Bỏ qua lỗi tạm thời khi trang đang chuyển hướng
        }
      }, 2000);
    });
  }

  // 3. Kiểm tra tính sống còn của tài khoản
  async checkAccountStatus(id) {
    const acc = storage.getAccounts().find(a => a.id === id);
    if (!acc) return false;

    const isLive = (acc.cookies && acc.cookies.length > 0);
    acc.status = isLive ? 'connected' : 'expired';
    acc.lastCheck = Date.now();
    storage.updateAccount(acc);
    return isLive;
  }
}

module.exports = new ChannelManager();
