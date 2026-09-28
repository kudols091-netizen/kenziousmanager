const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const storage = require('./storage');

class ChannelManager {
  constructor() {
    this.activeBrowsers = new Map();
  }

  getExecutablePath() {
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
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

  // 2. Mở trình duyệt trực quan đăng nhập và tự động lưu phiên
  async interactiveLogin(platform, proxy = '', onStatusUpdate = () => {}) {
    const execPath = this.getExecutablePath();
    if (!execPath) {
      throw new Error('Không tìm thấy Google Chrome hoặc Microsoft Edge trên máy tính!');
    }

    const accountId = `acc_${Date.now()}`;
    const profileDir = path.join(__dirname, '..', '..', 'data', 'profiles', accountId);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    const args = [
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1050,750'
    ];

    if (proxy && proxy.trim()) {
      args.push(`--proxy-server=${proxy.trim()}`);
    }

    onStatusUpdate('Đang khởi động trình duyệt đăng nhập...');

    const browser = await puppeteer.launch({
      executablePath: execPath,
      headless: false,
      defaultViewport: null,
      args
    });

    this.activeBrowsers.set(accountId, browser);

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    const targetUrl = this.getPlatformLoginUrl(platform);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    onStatusUpdate(`Đã mở trang đăng nhập ${platform}. Vui lòng tự đăng nhập trên cửa sổ Chrome vừa mở...`);

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

          // Tự động đóng các popup cản trở (Instagram "Not Now", v.v.)
          try {
            const notNowButtons = await page.$$('button');
            for (const btn of notNowButtons) {
              const text = await page.evaluate(el => el.textContent, btn);
              if (text && (text.includes('Lúc khác') || text.includes('Not Now') || text.includes('Save Info'))) {
                await btn.click().catch(() => {});
              }
            }
          } catch (e) {}

          const currentCookies = await page.cookies();
          let loggedIn = false;
          let displayName = `${platform}_${Date.now().toString().slice(-4)}`;
          let avatar = '';

          if (platform === 'facebook') {
            const hasCUser = currentCookies.some(c => c.name === 'c_user');
            if (hasCUser) {
              loggedIn = true;
              const cUser = currentCookies.find(c => c.name === 'c_user')?.value;
              displayName = `FB_${cUser || 'Profile'}`;
            }
          } else if (platform === 'tiktok') {
            const hasSession = currentCookies.some(c => c.name === 'sessionid');
            const url = page.url();
            if (hasSession || (!url.includes('/login') && url.includes('tiktok.com'))) {
              loggedIn = true;
              displayName = `TikTok_Creator`;
            }
          } else if (platform === 'youtube') {
            const url = page.url();
            if (url.includes('studio.youtube.com') && !url.includes('accounts.google.com')) {
              loggedIn = true;
              displayName = `YouTube_Studio`;
            }
          } else if (platform === 'instagram') {
            const hasSession = currentCookies.some(c => c.name === 'sessionid');
            if (hasSession) {
              loggedIn = true;
              displayName = `Instagram_User`;
            }
          } else {
            // Generic check
            if (currentCookies.length > 5 && !page.url().includes('login')) {
              loggedIn = true;
            }
          }

          if (loggedIn) {
            clearInterval(interval);
            onStatusUpdate('Đăng nhập thành công! Đang lưu thông tin phiên...');

            // Lưu cookie ra file
            fs.writeFileSync(
              path.join(profileDir, 'cookies.json'),
              JSON.stringify(currentCookies, null, 2),
              'utf-8'
            );

            // Đóng trình duyệt
            await browser.close().catch(() => {});
            this.activeBrowsers.delete(accountId);

            const newAccount = {
              id: accountId,
              platform,
              username: displayName,
              displayName,
              avatar,
              proxy: proxy.trim(),
              cookies: currentCookies,
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

          // Timeout sau 5 phút nếu không đăng nhập
          if (pollCount > 150) {
            clearInterval(interval);
            await browser.close().catch(() => {});
            this.activeBrowsers.delete(accountId);
            reject(new Error('Hết thời gian chờ đăng nhập (Timeout 5 phút).'));
          }
        } catch (err) {
          // Ignore polling errors
        }
      }, 2000);
    });
  }

  // 3. Kiểm tra trạng thái sống (Alive Check)
  async checkAccountStatus(accountId) {
    const accounts = storage.getAccounts();
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return null;

    acc.lastCheck = Date.now();
    if (acc.cookies && acc.cookies.length > 0) {
      acc.status = 'connected';
    } else {
      acc.status = 'disconnected';
    }
    storage.saveAccounts(accounts);
    return acc;
  }
}

module.exports = new ChannelManager();
