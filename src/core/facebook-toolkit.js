/**
 * Kenzious Reel V2 - Facebook Toolkit Engine (Clean-Room Clean Implementation)
 * Features:
 *  1. Extract Full-Permission EAAB Access Token from Ads Manager via HTTP cookies or Playwright browser session.
 *  2. High-Accuracy Facebook URL to numeric UID Resolution (Batch & Single, supporting Profiles, Pages, Groups).
 *  3. Verification and Storage Synchronization with Account Database.
 */

const { URL } = require('url');
const storage = require('./storage');
const proxyNet = require('./proxy-net');

class FacebookToolkit {
  constructor() {
    this.tokenCache = new Map();
  }

  /**
   * Format cookie list or raw string into standard Cookie header string
   * @param {Array|string} cookies 
   * @returns {string}
   */
  formatCookieHeader(cookies) {
    if (!cookies) return '';
    if (typeof cookies === 'string') return cookies.trim();
    if (Array.isArray(cookies)) {
      return cookies
        .filter(c => c && c.name && c.value)
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
    }
    return '';
  }

  /**
   * Safe HTTP GET helper with redirect handling and custom headers
   */
  async httpGet(urlStr, headers = {}, maxRedirects = 5, proxy = '') {
    // Cookie/token chỉ được gửi tới host Facebook và bị gỡ khi chuyển hướng sang domain khác (xem proxy-net)
    const res = await proxyNet.request(urlStr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        ...headers
      },
      maxRedirects,
      timeoutMs: 15000,
      proxy
    });
    return {
      statusCode: res.status,
      headers: res.headers,
      body: res.body.toString('utf8'),
      finalUrl: res.url
    };
  }

  /**
   * Parse EAAB Access Token from HTML source
   * @param {string} html 
   * @returns {string|null}
   */
  parseEaabTokenFromHtml(html) {
    if (!html || typeof html !== 'string') return null;

    const patterns = [
      /__accessToken"\s*:\s*"([^"]+)"/,
      /__accessToken[^"]*"([^"]+)"/,
      /"accessToken"\s*:\s*"(EAAB[^"]+)"/,
      /"access_token"\s*:\s*"(EAAB[^"]+)"/,
      /(EAAB[A-Za-z0-9_-]{80,})/,
      /["'](EAAB[a-zA-Z0-9]+)["']/
    ];

    for (const pat of patterns) {
      const match = html.match(pat);
      if (match && match[1] && match[1].startsWith('EAAB') && match[1].length >= 35) {
        return match[1].trim();
      }
    }
    return null;
  }

  /**
   * Extract Facebook User EAAB Token from Ads Manager
   * @param {Object} [options] { accountId, rawCookies, forceRefresh }
   * @returns {Promise<{success: boolean, token?: string, uid?: string, name?: string, message?: string, method?: string}>}
   */
  async extractEaabToken(options = {}) {
    const accounts = storage.getAccounts ? storage.getAccounts() : [];
    let fbAccount = null;

    if (options.accountId) {
      fbAccount = accounts.find(a => a.id === options.accountId);
    } else {
      fbAccount = accounts.find(a => a.platform === 'facebook');
    }

    let cookieHeader = '';
    if (options.rawCookies && typeof options.rawCookies === 'string' && options.rawCookies.trim()) {
      cookieHeader = options.rawCookies.trim();
    } else if (fbAccount && fbAccount.cookies) {
      cookieHeader = this.formatCookieHeader(fbAccount.cookies);
    }

    // Step 1: If account already has a saved token and refresh isn't forced, return it immediately
    if (fbAccount && fbAccount.token && fbAccount.token.startsWith('EAAB') && !options.forceRefresh) {
      return {
        success: true,
        token: fbAccount.token,
        uid: fbAccount.uid || '',
        name: fbAccount.displayName || 'Tài khoản Facebook',
        method: 'cached_account_token',
        message: 'Đã lấy thành công Token EAAB từ tài khoản đang kết nối.'
      };
    }

    if (!cookieHeader || !cookieHeader.includes('c_user')) {
      // If we don't have cookies, but we have a saved token, return that
      if (fbAccount && fbAccount.token) {
        return {
          success: true,
          token: fbAccount.token,
          uid: fbAccount.uid || '',
          name: fbAccount.displayName || 'Facebook Account',
          method: 'existing_token',
          message: 'Lấy token đã lưu của tài khoản kết nối.'
        };
      }
      return {
        success: false,
        message: 'Chưa có tài khoản Facebook nào kết nối hoặc thiếu thông tin Cookie (c_user/xs). Hãy đăng nhập tài khoản tại tab "Quản lý kênh"!'
      };
    }

    // Step 2: Direct HTTP Fetch from Ads Manager
    try {
      const endpoints = [
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns',
        'https://adsmanager.facebook.com/adsmanager/'
      ];

      for (const ep of endpoints) {
        try {
          const res = await this.httpGet(ep, {
            'Cookie': cookieHeader,
            'Referer': 'https://www.facebook.com/'
          }, 5, fbAccount ? fbAccount.proxy : '');

          if (res.body) {
            const token = this.parseEaabTokenFromHtml(res.body);
            if (token) {
              // Update account in storage
              if (fbAccount && fbAccount.id) {
                storage.updateAccount({
                  id: fbAccount.id,
                  token: token,
                  sessionHint: token.slice(0, 8) + '...' + token.slice(-4),
                  lastCheck: Date.now()
                });
              }

              return {
                success: true,
                token: token,
                uid: fbAccount ? fbAccount.uid : '',
                name: fbAccount ? fbAccount.displayName : 'Facebook',
                method: 'http_adsmanager',
                message: 'Bóc tách thành công Token EAAB trực tiếp từ Facebook Ads Manager!'
              };
            }
          }
        } catch (e) {
          console.warn('[FacebookToolkit] Ads endpoint attempt failed:', ep, e.message);
        }
      }
    } catch (httpErr) {
      console.warn('[FacebookToolkit] Direct HTTP adsmanager failed:', httpErr.message);
    }

    // Step 3: Browser Session Fallback (Playwright) if profileDir exists
    if (fbAccount && fbAccount.profileDir) {
      try {
        const profileManager = require('./browser/profile-manager');
        const { context, page } = await profileManager.launchBrowser(fbAccount.profileDir, {
          headless: true,
          proxy: fbAccount.proxy
        });
        let token = '';
        try {
        await page.goto('https://adsmanager.facebook.com/adsmanager/', {
          waitUntil: 'domcontentloaded',
          timeout: 25000
        });

        // Wait up to 5 seconds for Ads Manager initial script
        await page.waitForTimeout(3000);

        const pageContent = await page.content();
        token = this.parseEaabTokenFromHtml(pageContent);

        if (!token) {
          token = await page.evaluate(() => {
            return window.__accessToken || (window.__INITIAL_DATA__ && window.__INITIAL_DATA__.__accessToken) || null;
          }).catch(() => null);
        }

        } finally {
          await context.close().catch(() => {});
        }

        if (token && token.startsWith('EAAB')) {
          storage.updateAccount({
            id: fbAccount.id,
            token: token,
            sessionHint: token.slice(0, 8) + '...' + token.slice(-4),
            lastCheck: Date.now()
          });

          return {
            success: true,
            token: token,
            uid: fbAccount.uid,
            name: fbAccount.displayName,
            method: 'browser_adsmanager',
            message: 'Bóc tách thành công Token EAAB qua phiên trình duyệt Ads Manager!'
          };
        }
      } catch (browserErr) {
        console.warn('[FacebookToolkit] Browser AdsManager extraction error:', browserErr.message);
      }
    }

    // If all else fails, return existing account token if present
    if (fbAccount && fbAccount.token) {
      return {
        success: true,
        token: fbAccount.token,
        uid: fbAccount.uid,
        name: fbAccount.displayName,
        method: 'fallback_existing_token',
        message: 'Lấy token hiện hành trong tài khoản.'
      };
    }

    return {
      success: false,
      message: 'Không tìm thấy __accessToken trong Ads Manager. Phiên cookie có thể cần xác minh 2FA hoặc đăng nhập lại.'
    };
  }

  /**
   * Resolve a single Facebook URL into numeric UID & Display Name
   * @param {string} urlStr 
   * @param {string} [activeToken] 
   * @param {string} [cookieHeader]
   * @returns {Promise<{url: string, uid: string|null, name?: string, type?: string, error?: string}>}
   */
  async resolveFacebookUrlToUid(urlStr, activeToken = null, cookieHeader = '', proxy = '') {
    const raw = String(urlStr || '').trim();
    if (!raw) return { url: raw, uid: null, error: 'URL trống' };

    // 1. Direct Regex Lookup
    const idParam = raw.match(/[?&]id=(\d+)/i);
    if (idParam && idParam[1]) {
      return { url: raw, uid: idParam[1], type: 'direct_param_id' };
    }

    const numericPath = raw.match(/facebook\.com\/(\d{10,})\/?(?:$|[?#])/i);
    if (numericPath && numericPath[1]) {
      return { url: raw, uid: numericPath[1], type: 'numeric_url_id' };
    }

    const peoplePath = raw.match(/\/people\/[^/]+\/(\d+)/i);
    if (peoplePath && peoplePath[1]) {
      return { url: raw, uid: peoplePath[1], type: 'people_id' };
    }

    const groupPath = raw.match(/\/groups\/(\d+)/i);
    if (groupPath && groupPath[1]) {
      return { url: raw, uid: groupPath[1], type: 'group_id' };
    }

    // 2. Extract Slug from vanity URL (e.g. facebook.com/zuck -> zuck)
    let cleanUrl = raw;
    try {
      const u = new URL(raw.startsWith('http') ? raw : 'https://' + raw);
      cleanUrl = `${u.protocol}//${u.host}${u.pathname}`;
    } catch (e) {}

    // 3. Crawler HTML Metadata Inspection
    try {
      const res = await this.httpGet(cleanUrl, {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Cookie': cookieHeader || ''
      }, 5, proxy);

      if (res.body) {
        const body = res.body;

        // Extract UID patterns
        const patterns = [
          /al:android:url"\s+content="fb:\/\/(?:page|profile)\/(\d+)"/i,
          /al:ios:url"\s+content="fb:\/\/(?:page|profile)\/\?id=(\d+)"/i,
          /content="fb:\/\/(?:page|profile|group)\/(\d+)"/i,
          /"entity_id"\s*:\s*"(\d+)"/i,
          /"userID"\s*:\s*"(\d+)"/i,
          /"pageID"\s*:\s*"(\d+)"/i,
          /"target_id"\s*:\s*"(\d+)"/i,
          /"delegate_page_id"\s*:\s*"(\d+)"/i,
          /"identifier"\s*:\s*"(\d+)"/i
        ];

        let foundUid = null;
        for (const p of patterns) {
          const m = body.match(p);
          if (m && m[1]) {
            foundUid = m[1];
            break;
          }
        }

        // Extract Name/Title
        let foundName = '';
        const titleMatch = body.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                           body.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          foundName = titleMatch[1].replace(/\s*[|·•]\s*Facebook.*$/i, '').trim();
        }

        if (foundUid) {
          return {
            url: raw,
            uid: foundUid,
            name: foundName,
            type: 'html_metadata'
          };
        }
      }
    } catch (fetchErr) {
      console.warn('[FacebookToolkit] Crawler fetch failed for:', raw, fetchErr.message);
    }

    // 4. Fallback public UID lookup API if available
    try {
      const publicApiUrl = `https://id.traodoisub.net/api.php?link=${encodeURIComponent(cleanUrl)}`;
      const apiRes = await this.httpGet(publicApiUrl, {}, 2);
      if (apiRes.body) {
        const parsed = JSON.parse(apiRes.body);
        if (parsed && (parsed.id || parsed.uid)) {
          return {
            url: raw,
            uid: String(parsed.id || parsed.uid),
            type: 'public_lookup_service'
          };
        }
      }
    } catch (apiErr) {}

    return {
      url: raw,
      uid: null,
      error: 'Không thể nhận diện UID từ đường dẫn này'
    };
  }

  /**
   * Batch convert Facebook URLs into numeric UIDs
   * @param {Array<string>} urls 
   * @param {Function} [onProgress]
   * @returns {Promise<Array<{url: string, uid: string|null, name?: string, type?: string, error?: string}>>}
   */
  async resolveBatchUrlsToUid(urls, onProgress = null) {
    if (!Array.isArray(urls)) return [];
    const validUrls = urls.map(u => String(u || '').trim()).filter(Boolean);
    const results = [];

    // Get active Facebook account credentials if available
    const accounts = storage.getAccounts ? storage.getAccounts() : [];
    const fbAccount = accounts.find(a => a.platform === 'facebook');
    const token = fbAccount ? fbAccount.token : null;
    const cookieHeader = fbAccount ? this.formatCookieHeader(fbAccount.cookies) : '';
    const proxy = fbAccount ? fbAccount.proxy : '';

    let completed = 0;
    // Process with concurrency limit of 4
    const concurrency = 4;
    for (let i = 0; i < validUrls.length; i += concurrency) {
      const chunk = validUrls.slice(i, i + concurrency);
      const chunkPromises = chunk.map(url => this.resolveFacebookUrlToUid(url, token, cookieHeader, proxy));
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      completed += chunk.length;
      if (typeof onProgress === 'function') {
        onProgress({ current: completed, total: validUrls.length });
      }
    }

    return results;
  }
}

module.exports = new FacebookToolkit();
