const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const storage = require('./storage');
const paths = require('./paths');
const proxyNet = require('./proxy-net');

class ChannelManager {
  constructor() {
    this.activeBrowsers = new Map();
  }

  saveAccount(acc) {
    if (typeof storage.updateAccount === 'function') {
      return storage.updateAccount(acc);
    }
    return storage.addAccount(acc);
  }

    async getFreePort() {
    return new Promise((resolve) => {
      const s = require('net').createServer();
      s.listen(0, '127.0.0.1', () => {
        const port = s.address().port;
        s.close(() => resolve(port));
      });
    });
  }

  getExtensionPath() {
    const candidates = [
      path.resolve(__dirname, '..', '..', 'extensions', 'GetCookie'),
      process.resourcesPath ? path.join(process.resourcesPath, 'extensions', 'GetCookie') : null,
      path.resolve('D:/KOAL/GetCookie')
    ].filter(Boolean);
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  getExecutablePath() {
    // 0. Uu tien Chromium bundled tai project hoac resources
    const candidatePaths = [
      path.resolve(__dirname, '..', '..', 'Chromium', 'bin', 'chrome.exe'),
      path.resolve(__dirname, '..', '..', 'Chromium', 'chrome.exe'),
      process.resourcesPath ? path.join(process.resourcesPath, 'Chromium', 'bin', 'chrome.exe') : null,
      process.resourcesPath ? path.join(process.resourcesPath, 'Chromium', 'chrome.exe') : null,
      path.resolve('D:/KOAL/Kenzious Reel V2/Chromium/bin/chrome.exe'),
      path.resolve('D:/KOAL/Kenzious Reel V2/Chromium/chrome.exe')
    ].filter(Boolean);
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        console.log('[ChannelManager] Su dung Chromium tai:', p);
        return p;
      }
    }

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
      case 'shopee': return 'https://shopee.vn/buyer/login?next=https%3A%2F%2Faffiliate.shopee.vn%2F';
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

  async extractFacebookTokenEAAB(cookies, proxy = '') {
    try {
      let cookieStr = '';
      if (Array.isArray(cookies)) {
        const fbCookies = cookies.filter(c => !c.domain || c.domain.includes('facebook.com'));
        cookieStr = fbCookies.map(c => `${c.name}=${c.value}`).join('; ');
      } else if (typeof cookies === 'string') {
        cookieStr = cookies;
      }
      if (!cookieStr || !cookieStr.includes('c_user')) return null;

      const res = await proxyNet.proxyFetch('https://adsmanager.facebook.com/adsmanager/manage/campaigns', {
        proxy,
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
  
  async fetchFacebookProfileInfo(cookies, profileDir = '', proxy = '') {
    try {
      const fbCookies = (cookies || []).filter(c => !c.domain || c.domain.includes('facebook.com'));
      const cookieStr = fbCookies.map(c => `${c.name}=${c.value}`).join('; ');
      if (!cookieStr || !cookieStr.includes('c_user')) return null;

      const res = await proxyNet.proxyFetch('https://www.facebook.com/', {
        proxy,
        headers: {
          'Cookie': cookieStr,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-User': '?1',
          'Sec-Fetch-Dest': 'document',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      if (!res.ok) return null;
      const html = await res.text();
      if (!html || html.length < 5000) return null;

      let name = '';
      let uid = '';

      // 1. Extract Name & UID from CurrentUserInitialData
      const curUserMatch = html.match(/CurrentUserInitialData[\s\S]{0,100}?{([^}]+)}/i);
      if (curUserMatch) {
        const nameM = curUserMatch[0].match(/"NAME"\s*:\s*"([^"]+)"/i);
        const uidM = curUserMatch[0].match(/"USER_ID"\s*:\s*"([^"]+)"/i) || curUserMatch[0].match(/"ACCOUNT_ID"\s*:\s*"([^"]+)"/i);
        if (nameM && nameM[1]) name = nameM[1];
        if (uidM && uidM[1]) uid = uidM[1];
      }

      if (!name) {
        const nameM = html.match(/"NAME"\s*:\s*"([^"]+)"/i);
        if (nameM && nameM[1]) name = nameM[1];
      }

      // 2. Unescape HTML and extract real scontent avatar
      const unescapedHtml = html.replace(/\\\//g, '/');
      const allUrls = [...unescapedHtml.matchAll(/https:\/\/scontent[^"\'\s]+/g)].map(m => m[0]);
      const cleanScontents = [...new Set(allUrls.filter(u => !u.includes('static.xx') && !u.includes('rsrc.php')))];

      // Tìm các ảnh ứng viên (ưu tiên các ảnh có cstp=mx hoặc s160/s240/s720)
      const candidateUrls = cleanScontents.slice(0, 15);
      let bestBuf = null;
      let bestUrl = '';

      for (const u of candidateUrls) {
        try {
          const imgRes = await proxyNet.proxyFetch(u, { proxy });
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            if (buf && buf.length > 500 && (!bestBuf || buf.length > bestBuf.length)) {
              bestBuf = buf;
              bestUrl = u;
            }
          }
        } catch {}
      }

      let avatarBase64 = '';
      let avatarPath = '';

      if (bestBuf) {
        avatarBase64 = `data:image/jpeg;base64,${bestBuf.toString('base64')}`;
        if (profileDir) {
          try {
            if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
            avatarPath = path.join(profileDir, 'avatar.jpg');
            fs.writeFileSync(avatarPath, bestBuf);
          } catch (e) {
            console.warn('[ChannelManager] Save avatar to disk error:', e.message);
          }
        }
      }

      return {
        name,
        uid,
        avatarUrl: bestUrl,
        avatar: avatarBase64 || bestUrl,
        avatarPath
      };
    } catch (err) {
      console.warn('[ChannelManager] fetchFacebookProfileInfo error:', err.message);
      return null;
    }
  }

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
    let avatarPath = '';
    let avatarUrl = '';
    let token = null;

    // Khai báo profileDir TRƯỚC khối Facebook vì fetchFacebookProfileInfo cần nó để lưu avatar
    const accountId = `acc_${Date.now()}`;
    const profileDir = path.join(paths.getProfilesDir(), accountId);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    if (platform === 'facebook') {
      const cUser = cookies.find(c => c.name === 'c_user');
      if (cUser) uid = cUser.value;
      token = await this.extractFacebookTokenEAAB(cookies, proxy);
      const fbInfo = await this.fetchFacebookProfileInfo(cookies, profileDir, proxy);
      if (fbInfo) {
        if (fbInfo.name) detectedUsername = fbInfo.name;
        if (fbInfo.uid) uid = fbInfo.uid;
        if (fbInfo.avatar) avatar = fbInfo.avatar;
        if (fbInfo.avatarPath) avatarPath = fbInfo.avatarPath;
        if (fbInfo.avatarUrl) avatarUrl = fbInfo.avatarUrl;
      }
      if (!detectedUsername) detectedUsername = `Facebook User (${uid})`;
    }

    // Cookie chỉ lưu (đã mã hoá) trong accounts.json — không ghi bản sao plaintext vào profile nữa

    const sessionHint = token ? this.maskToken(token) : (uid || accountId.slice(0, 8));

    const newAccount = {
      id: accountId,
      platform,
      username: detectedUsername || `${platform}_${Date.now().toString().slice(-4)}`,
      displayName: detectedUsername || `${platform}_${Date.now().toString().slice(-4)}`,
      uid,
      avatar,
      avatarPath,
      avatarUrl,
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
      throw new Error('Không tìm thấy Chromium tại D:\\KOAL\\Kenzious Reel V2\\Chromium!');
    }

    const accountId = options.existingAccountId || `acc_${Date.now()}`;
    const profileDir = options.existingProfileDir || path.join(paths.getProfilesDir(), accountId);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    // Xóa sạch lockfile cũ tránh zombie process giữ lock
    const lockFile = path.join(profileDir, 'lockfile');
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch (e) {}
    }

    const targetUrl = this.getPlatformLoginUrl(platform);
    const port = await this.getFreePort();

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--start-maximized'
    ];

    if (options.cleanDevice !== false) {
      args.push('--lang=vi-VN,vi');
    }

    // Proxy: Chrome không nhận user/pass qua dòng lệnh → extension xác thực proxy tự sinh trong profile
    const chromeProxy = proxyNet.prepareChromeProxy(proxy, profileDir);
    args.push(...chromeProxy.args);

    const extensionDirs = [this.getExtensionPath(), chromeProxy.extensionDir].filter(p => p && fs.existsSync(p));
    if (extensionDirs.length > 0) {
      args.push(`--load-extension=${extensionDirs.join(',')}`);
      args.push(`--disable-extensions-except=${extensionDirs.join(',')}`);
    }

    args.push(targetUrl);

    onStatusUpdate('Đang bung cửa sổ Chromium độc lập trên màn hình...');

    // 1. Khoi chay Native detached de Windows render cua so thuc 100% tren Desktop
    const child = require('child_process').spawn(execPath, args, {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    // 2. Ket noi Puppeteer qua Chrome DevTools Protocol de bat cookie tu dong
    let browser = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise(r => setTimeout(r, 400));
      try {
        browser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${port}`,
          defaultViewport: null
        });
        if (browser) break;
      } catch (err) {}
    }

    if (!browser) {
      throw new Error(`Khong the ket noi vao Chromium qua port ${port}!`);
    }

    this.activeBrowsers.set(accountId, browser);

    onStatusUpdate(`Cửa sổ Chromium đã bung ra phía trước. Hãy đăng nhập tài khoản ${platform} của bạn...`);

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
          } else if (platform === 'shopee') {
            const hasSpcSt = currentCookies.some(c => (c.name === 'SPC_ST' || c.name === 'SPC_EC') && c.value && c.value.length > 20);
            const onAffiliateDashboard = allPages.some(p => p.url().includes('affiliate.shopee.vn'));
            const onCreatorDashboard = allPages.some(p => p.url().includes('creator.shopee.vn') && !p.url().includes('/login'));

            // SPC_ST token hoac dang o tren dashboard Affiliate la da dang nhap thanh cong 100%
            if (hasSpcSt || onAffiliateDashboard || onCreatorDashboard) {
              loggedIn = true;
              const spcU = currentCookies.find(c => c.name === 'SPC_U');
              if (spcU && spcU.value) uid = spcU.value;

              for (const p of allPages) {
                if (p.url().includes('affiliate.shopee.vn') || p.url().includes('shopee.vn')) {
                  try {
                    const detected = await p.evaluate(() => {
                      const nameEl = document.querySelector('.username, .user-name, .header-user-name, [class*="username"], [class*="userName"]');
                      return nameEl ? nameEl.innerText.trim() : '';
                    });
                    if (detected) {
                      displayName = `Shopee Affiliate (${detected})`;
                      break;
                    }
                  } catch (e) {}
                }
              }

              if (!displayName || displayName === 'Shopee_Affiliate') {
                displayName = uid ? `Shopee Affiliate (${uid})` : `Shopee_Affiliate_${Date.now().toString().slice(-4)}`;
              }
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
              token = await this.extractFacebookTokenEAAB(currentCookies, proxy);
            }

            // Trích xuất avatar thật trực tiếp từ trang Facebook đang mở
            let detectedAvatar = '';
            for (const p of allPages) {
              if (p.url().includes('facebook.com')) {
                try {
                  detectedAvatar = await p.evaluate(() => {
                    const imgs = Array.from(document.querySelectorAll('svg image, image, img[src*="scontent"]'));
                    for (const img of imgs) {
                      const src = img.currentSrc || img.src || (img.getAttribute && img.getAttribute('xlink:href')) || (img.getAttributeNS && img.getAttributeNS('http://www.w3.org/1999/xlink', 'href')) || '';
                      if (src && src.includes('scontent') && !src.includes('static.xx') && !src.includes('rsrc.php')) return src;
                    }
                    const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
                    if (og && og.includes('scontent')) return og;
                    return '';
                  });
                } catch (e) {}
                if (detectedAvatar) break;
              }
            }

            if (detectedAvatar) {
              avatar = detectedAvatar;
            }

            // Cookie chỉ lưu (đã mã hoá) trong accounts.json — không ghi bản sao plaintext vào profile nữa

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
              this.saveAccount(existing);
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
    if (!execPath) throw new Error('Không tìm thấy Chromium!');

    const profileDir = acc.profileDir || path.join(paths.getProfilesDir(), acc.id);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    const lockFile = path.join(profileDir, 'lockfile');
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch (e) {}
    }

    const targetUrl = this.getPlatformLoginUrl(acc.platform || 'facebook');
    const port = await this.getFreePort();

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--start-maximized'
    ];

    if (acc.fingerprintEnabled !== false) {
      args.push('--lang=vi-VN,vi');
    }

    // Proxy: Chrome không nhận user/pass qua dòng lệnh → extension xác thực proxy tự sinh trong profile
    const chromeProxy = proxyNet.prepareChromeProxy(acc.proxy, profileDir);
    args.push(...chromeProxy.args);

    const extensionDirs = [this.getExtensionPath(), chromeProxy.extensionDir].filter(p => p && fs.existsSync(p));
    if (extensionDirs.length > 0) {
      args.push(`--load-extension=${extensionDirs.join(',')}`);
      args.push(`--disable-extensions-except=${extensionDirs.join(',')}`);
    }

    args.push(targetUrl);

    const child = require('child_process').spawn(execPath, args, {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    let browser = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise(r => setTimeout(r, 400));
      try {
        browser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${port}`,
          defaultViewport: null
        });
        if (browser) break;
      } catch (err) {}
    }

    if (browser) {
      this.activeBrowsers.set(accountId, browser);
    }

    return { success: true, message: `Đã mở trình duyệt profile cho ${acc.displayName}` };
  }

  // 4. Kiểm tra tính sống còn và làm mới Token EAAB, Tên, Avatar (Silent Live Check)
  async checkAccountStatus(id) {
    const acc = storage.getAccounts().find(a => a.id === id);
    if (!acc) return false;

    let isLive = (acc.cookies && acc.cookies.length > 0);

    if (acc.platform === 'facebook' && isLive) {
      try {
        const freshToken = await this.extractFacebookTokenEAAB(acc.cookies, acc.proxy);
        if (freshToken) {
          acc.token = freshToken;
          acc.sessionHint = this.maskToken(freshToken);
          isLive = true;

          // Tải lại tên & avatar mới nhất qua Graph API mà không cần mở trình duyệt
          try {
            const fbInfo = await this.fetchFacebookProfileInfo(acc.cookies, acc.profileDir, acc.proxy);
            if (fbInfo) {
              if (fbInfo.name) {
                acc.displayName = fbInfo.name + (acc.uid ? ` (UID: ${acc.uid})` : '');
                acc.username = fbInfo.name;
              }
              if (fbInfo.avatar) {
                acc.avatar = fbInfo.avatar;
                if (fbInfo.avatarPath) acc.avatarPath = fbInfo.avatarPath;
                if (fbInfo.avatarUrl) acc.avatarUrl = fbInfo.avatarUrl;
              }
              if (fbInfo.uid) acc.uid = fbInfo.uid;
            }
          } catch (graphErr) {
            console.warn('[ChannelManager] Profile refresh error:', graphErr.message);
          }
        }
      } catch (err) {
        console.warn('[ChannelManager] checkAccountStatus token refresh error:', err.message);
      }
    }

    acc.status = isLive ? 'connected' : 'expired';
    acc.lastCheck = Date.now();
    this.saveAccount(acc);
    return isLive;
  }

  // 5. Cập nhật cấu hình tài khoản (Fingerprint, Proxy, etc.)
  updateAccountSettings(id, patch = {}) {
    const acc = storage.getAccounts().find(a => a.id === id);
    if (!acc) throw new Error('Không tìm thấy tài khoản!');

    Object.assign(acc, patch);
    acc.updatedAt = Date.now();
    this.saveAccount(acc);
    return acc;
  }

  // 6. Lấy Token EAAB của tài khoản
  async getAccountToken(id) {
    const acc = storage.getAccounts().find(a => a.id === id);
    if (!acc) throw new Error('Không tìm thấy tài khoản!');
    if (acc.token) return acc.token;
    if (acc.platform === 'facebook') {
      const token = await this.extractFacebookTokenEAAB(acc.cookies, acc.proxy);
      if (token) {
        acc.token = token;
        acc.sessionHint = this.maskToken(token);
        this.saveAccount(acc);
        return token;
      }
    }
    return null;
  }
}

module.exports = new ChannelManager();
