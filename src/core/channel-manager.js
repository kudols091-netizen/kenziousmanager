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

  maskToken(token) {
    if (!token || typeof token !== 'string') return '';
    if (token.startsWith('EAAB') && token.length > 16) {
      return token.slice(0, 8) + '...' + token.slice(-4);
    }
    return token.slice(0, 10) + '...';
  }

  async extractFacebookTokenEAAB(cookies) {
    try {
      let cookieStr = '';
      if (Array.isArray(cookies)) {
        const fbCookies = cookies.filter(c => !c.domain || c.domain.includes('facebook.com'));
        cookieStr = fbCookies.map(c => `${c.name}=${c.value}`).join('; ');
      } else if (typeof cookies === 'string') {
        cookieStr = cookies;
      }
      if (!cookieStr || !cookieStr.includes('c_user')) return null;

      const res = await fetch('https://adsmanager.facebook.com/adsmanager/manage/campaigns', {
        headers: {
          'Cookie': cookieStr,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-site'
        }
      });

      if (!res.ok && res.status !== 200) return null;
      const html = await res.text();
      const regexes = [
        /["'](EAAB[a-zA-Z0-9]+)["']/,
        /accessToken["']\s*:\s*["'](EAAB[^"']+)["']/,
        /access_token["']\s*:\s*["'](EAAB[^"']+)["']/,
        /(EAAB[a-zA-Z0-9_-]{20,})/
      ];

      for (const r of regexes) {
        const m = html.match(r);
        if (m && m[1]) {
          return m[1];
        }
      }
      return null;
    } catch (err) {
      console.warn('[ChannelManager] extractFacebookTokenEAAB warning:', err.message);
      return null;
    }
  }

  // 1. Nhập Cookie trực tiếp (JSON / Header string)
  async importCookies(platform, rawInput, proxy = '', accountName = '', options = {}) {
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
    let uid = '';
    let avatar = '';
    let token = null;

    if (platform === 'facebook') {
      const cUser = cookies.find(c => c.name === 'c_user');
      if (cUser) {
        uid = cUser.value;
        if (!detectedUsername) detectedUsername = `Facebook User (${uid})`;
        avatar = `https://graph.facebook.com/${uid}/picture?type=normal`;
        token = await this.extractFacebookTokenEAAB(cookies);
      }
    }

    const accountId = `acc_${Date.now()}`;
    const profileDir = path.resolve(__dirname, '..', '..', 'data', 'profiles', accountId);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    fs.writeFileSync(path.join(profileDir, 'cookies.json'), JSON.stringify(cookies, null, 2), 'utf-8');

    const sessionHint = token ? this.maskToken(token) : (uid || accountId.slice(0, 8));

    const newAccount = {
      id: accountId,
      platform,
      username: detectedUsername || `${platform}_${Date.now().toString().slice(-4)}`,
      displayName: detectedUsername || `${platform}_${Date.now().toString().slice(-4)}`,
      uid,
      avatar,
      token: token || '',
      sessionHint,
      proxy: proxy.trim(),
      fingerprintEnabled: options.cleanDevice !== false,
      cookies,
      profileDir,
      status: 'connected',
      method: 'cookie_import',
      lastCheck: Date.now(),
      destinations: [
        { id: 'dest_main', name: `Kênh chính (${detectedUsername})`, type: 'profile', selected: true }
      ]
    };

    storage.addAccount(newAccount);
    return newAccount;
  }

  // 2. Mở trình duyệt độc lập để người dùng đăng nhập tay
  async interactiveLogin(platform, proxy = '', onStatusUpdate = () => {}, options = {}) {
    const execPath = this.getExecutablePath();
    if (!execPath) {
      throw new Error('Không tìm thấy Google Chrome hoặc Microsoft Edge trên máy tính!');
    }

    const accountId = options.existingAccountId || `acc_${Date.now()}`;
    const profileDir = options.existingProfileDir || path.resolve(__dirname, '..', '..', 'data', 'profiles', accountId);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    const targetUrl = this.getPlatformLoginUrl(platform);

    const args = [
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--start-maximized'
    ];

    if (options.cleanDevice !== false) {
      args.push('--lang=vi-VN,vi');
      args.push('--window-size=1280,800');
    }

    // Tích hợp trực tiếp Kenzious GetCookie extension (Manifest V3)
    const extensionPath = path.resolve('D:/KOAL/GetCookie');
    if (fs.existsSync(extensionPath)) {
      args.push(`--load-extension=${extensionPath}`);
      args.push(`--disable-extensions-except=${extensionPath}`);
    }

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

          // 2. Dự phòng: Dùng CDP Session để lấy toàn bộ cookie của profile
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
          let uid = '';
          let avatar = '';

          // Nhận diện đăng nhập theo từng nền tảng
          if (platform === 'facebook') {
            const cUser = currentCookies.find(c => c.name === 'c_user');
            if (cUser) {
              loggedIn = true;
              uid = cUser.value;
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
              displayName = detectedName || `Facebook User (${uid})`;
              avatar = `https://graph.facebook.com/${uid}/picture?type=normal`;
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
            onStatusUpdate('Đăng nhập thành công! Đang lấy Token EAAB và lưu phiên...');

            await new Promise(r => setTimeout(r, 1200));

            // Trích xuất Facebook Token EAAB
            let token = null;
            if (platform === 'facebook') {
              token = await this.extractFacebookTokenEAAB(currentCookies);
            }

            // Lưu cookie ra profile folder
            fs.writeFileSync(
              path.join(profileDir, 'cookies.json'),
              JSON.stringify(currentCookies, null, 2),
              'utf-8'
            );

            await browser.close().catch(() => {});
            this.activeBrowsers.delete(accountId);

            const sessionHint = token ? this.maskToken(token) : (uid || accountId.slice(0, 8));

            // Cập nhật hoặc thêm mới
            let existing = storage.getAccounts().find(a => a.id === accountId);
            if (existing) {
              existing.cookies = currentCookies;
              existing.status = 'connected';
              existing.lastCheck = Date.now();
              if (token) existing.token = token;
              if (sessionHint) existing.sessionHint = sessionHint;
              if (avatar) existing.avatar = avatar;
              if (uid) existing.uid = uid;
              if (displayName) {
                existing.displayName = displayName;
                existing.username = displayName;
              }
              storage.updateAccount(existing);
              resolve(existing);
            } else {
              const newAccount = {
                id: accountId,
                platform,
                username: displayName,
                displayName,
                uid,
                avatar,
                token: token || '',
                sessionHint,
                proxy: proxy.trim(),
                fingerprintEnabled: options.cleanDevice !== false,
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

  // 3. Mở Profile trình duyệt trực tiếp (Nút "Mở" trên bảng)
  async openProfileBrowser(accountId) {
    const acc = storage.getAccounts().find(a => a.id === accountId);
    if (!acc) throw new Error('Không tìm thấy tài khoản!');

    const execPath = this.getExecutablePath();
    if (!execPath) throw new Error('Không tìm thấy Chrome/Edge!');

    const profileDir = acc.profileDir || path.resolve(__dirname, '..', '..', 'data', 'profiles', acc.id);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    const targetUrl = this.getPlatformLoginUrl(acc.platform || 'facebook');

    const args = [
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--start-maximized'
    ];

    if (acc.fingerprintEnabled !== false) {
      args.push('--lang=vi-VN,vi');
    }

    const extensionPath = path.resolve('D:/KOAL/GetCookie');
    if (fs.existsSync(extensionPath)) {
      args.push(`--load-extension=${extensionPath}`);
      args.push(`--disable-extensions-except=${extensionPath}`);
    }

    args.push(targetUrl);

    if (acc.proxy && acc.proxy.trim()) {
      args.push(`--proxy-server=${acc.proxy.trim()}`);
    }

    const browser = await puppeteer.launch({
      executablePath: execPath,
      headless: false,
      defaultViewport: null,
      args
    });

    this.activeBrowsers.set(accountId, browser);
    return { success: true, message: `Đã mở trình duyệt profile cho ${acc.displayName}` };
  }

  // 4. Kiểm tra tính sống còn và làm mới Token EAAB
  async checkAccountStatus(id) {
    const acc = storage.getAccounts().find(a => a.id === id);
    if (!acc) return false;

    let isLive = (acc.cookies && acc.cookies.length > 0);

    if (acc.platform === 'facebook' && isLive) {
      try {
        const freshToken = await this.extractFacebookTokenEAAB(acc.cookies);
        if (freshToken) {
          acc.token = freshToken;
          acc.sessionHint = this.maskToken(freshToken);
          isLive = true;
        }
      } catch (err) {
        console.warn('[ChannelManager] checkAccountStatus token refresh error:', err.message);
      }
    }

    acc.status = isLive ? 'connected' : 'expired';
    acc.lastCheck = Date.now();
    storage.updateAccount(acc);
    return isLive;
  }

  // 5. Cập nhật cấu hình tài khoản (Fingerprint, Proxy, etc.)
  updateAccountSettings(id, patch = {}) {
    const acc = storage.getAccounts().find(a => a.id === id);
    if (!acc) throw new Error('Không tìm thấy tài khoản!');

    Object.assign(acc, patch);
    acc.updatedAt = Date.now();
    storage.updateAccount(acc);
    return acc;
  }

  // 6. Lấy Token EAAB của tài khoản
  async getAccountToken(id) {
    const acc = storage.getAccounts().find(a => a.id === id);
    if (!acc) throw new Error('Không tìm thấy tài khoản!');
    if (acc.token) return acc.token;
    if (acc.platform === 'facebook') {
      const token = await this.extractFacebookTokenEAAB(acc.cookies);
      if (token) {
        acc.token = token;
        acc.sessionHint = this.maskToken(token);
        storage.updateAccount(acc);
        return token;
      }
    }
    return null;
  }
}

module.exports = new ChannelManager();
