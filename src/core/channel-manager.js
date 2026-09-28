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

  // 2. Mở trình duyệt trực quan đăng nhập, tích hợp GetCookie extension và tự động lưu phiên
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
      '--start-maximized'
    ];

    // Tích hợp trực tiếp Kenzious GetCookie extension (Manifest V3)
    const extensionPath = path.resolve('D:/KOAL/GetCookie');
    if (fs.existsSync(extensionPath)) {
      args.push(`--load-extension=${extensionPath}`);
      args.push(`--disable-extensions-except=${extensionPath}`);
    }

    // Tải thẳng URL đích
    args.push(targetUrl);

    if (proxy && proxy.trim()) {
      args.push(`--proxy-server=${proxy.trim()}`);
    }

    onStatusUpdate('Đang mở trình duyệt trực quan (đã tích hợp GetCookie extension)...');

    const browser = await puppeteer.launch({
      executablePath: execPath,
      headless: false,
      defaultViewport: null,
      args
    });

    this.activeBrowsers.set(accountId, browser);

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.bringToFront().catch(() => {});

    onStatusUpdate(`Trình duyệt đã mở ở phía trước. Hãy đăng nhập tài khoản ${platform} của bạn...`);

    // Polling kiểm tra đăng nhập thành công qua TẤT CẢ các tab và CDP Session
    return new Promise((resolve, reject) => {
      let pollCount = 0;
      const interval = setInterval(async () => {
        try {
          pollCount++;

          if (!browser.isConnected()) {
            clearInterval(interval);
            this.activeBrowsers.delete(accountId);
            reject(new Error('Người dùng đã đóng trình duyệt trước khi hoàn tất đăng nhập.'));
            return;
          }

          const allPages = await browser.pages().catch(() => []);
          let currentCookies = [];

          // 1. Quét cookie từ trang nền tảng đang mở
          const targetTab = allPages.find(p => p.url().includes(platform)) || allPages[0];
          if (targetTab) {
            const pageCks = await targetTab.cookies().catch(() => []);
            currentCookies.push(...pageCks);
          }

          // 2. Dự phòng: Dùng CDP Session để lấy toàn bộ cookie của toàn bộ browser profile
          if (allPages.length > 0) {
            try {
              const cdp = await allPages[0].target().createCDPSession();
              const cdpObj = await cdp.send('Network.getAllCookies');
              if (cdpObj && cdpObj.cookies) {
                for (const ck of cdpObj.cookies) {
                  if (!currentCookies.some(c => c.name === ck.name && c.domain === ck.domain)) {
                    currentCookies.push(ck);
                  }
                }
              }
              await cdp.detach().catch(() => {});
            } catch (cdpErr) {}
          }

          let loggedIn = false;
          let displayName = `${platform}_${Date.now().toString().slice(-4)}`;
          let avatar = '';

          // Nhận diện đăng nhập theo từng nền tảng
          if (platform === 'facebook') {
            const cUser = currentCookies.find(c => c.name === 'c_user');
            if (cUser) {
              loggedIn = true;
              let detectedName = '';
              for (const p of allPages) {
                if (p.url().includes('facebook.com')) {
                  try {
                    const rawTitle = await p.title();
                    detectedName = rawTitle.replace(/\(\d+\)\s*/, '').replace(/Facebook/i, '').replace(/[-–—]/g, '').trim();
                  } catch (e) {}
                  if (detectedName) break;
                }
              }
              displayName = detectedName ? `${detectedName} (UID: ${cUser.value})` : `Facebook_${cUser.value}`;
            }
          } else if (platform === 'tiktok') {
            const hasSession = currentCookies.some(c => c.name === 'sessionid');
            const hasTiktokTab = allPages.some(p => p.url().includes('tiktok.com/@') || (!p.url().includes('/login') && p.url().includes('tiktok.com')));
            if (hasSession || hasTiktokTab) {
              loggedIn = true;
              displayName = `TikTok_Creator_${Date.now().toString().slice(-4)}`;
            }
          } else if (platform === 'youtube') {
            const hasStudio = allPages.some(p => p.url().includes('studio.youtube.com') && !p.url().includes('accounts.google.com'));
            if (hasStudio) {
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
            const hasZaloTab = allPages.some(p => p.url().includes('video.zalo.me/creator'));
            if (hasSek || hasZaloTab) {
              loggedIn = true;
              displayName = `Zalo_Creator`;
            }
          } else {
            if (currentCookies.length > 5) loggedIn = true;
          }

          if (loggedIn) {
            clearInterval(interval);
            onStatusUpdate('Đăng nhập thành công! Đang lưu thông tin phiên...');

            await new Promise(r => setTimeout(r, 1200));

            // Lưu cookie ra profile folder
            fs.writeFileSync(
              path.join(profileDir, 'cookies.json'),
              JSON.stringify(currentCookies, null, 2),
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
              cookies: currentCookies,
              profileDir,
              status: 'connected',
              method: 'interactive_login',
              lastCheck: Date.now(),
              destinations: [
                { id: 'dest_main', name: `Kênh chính (${displayName})`, type: 'profile', selected: true }
              ]
            };

            storage.addAccount(newAccount);
            resolve(newAccount);
          }

          if (pollCount > 300) {
            clearInterval(interval);
            await browser.close().catch(() => {});
            this.activeBrowsers.delete(accountId);
            reject(new Error('Hết thời gian chờ đăng nhập (Timeout 10 phút).'));
          }
        } catch (e) {}
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
