/**
 * Kenzious Reel V2 - Facebook Destinations Manager (Clean-Room Dynamic GraphQL Engine)
 * Re-engineered from Zoo Reup 2.03.00 graphql-destinations-DTMOwZBe architecture.
 * Features:
 * - Dynamic live doc_id learning for Facebook GraphQL endpoints
 * - Direct HTTP GraphQL discovery for Fanpages & Groups
 * - Auto-fallback to Comet HTML parser
 * - SQLite destination persistence and state synchronization
 */

const fs = require('fs');
const path = require('path');
const proxyNet = require('./proxy-net');

const DOC_PROFILE_SWITCHER = '24673778975623080';
const DOC_GROUPS_YOU_MANAGE = '4811312595637508';

function resolveDataDir(baseDir) {
  if (baseDir) return path.resolve(baseDir);
  return require('./paths').getDataDir();
}

class DestinationsManager {
  constructor(baseDataDir = null) {
    this.dataDir = resolveDataDir(baseDataDir);
    this.jsonPath = path.join(this.dataDir, 'destinations_store.json');
    this.livePagesDocId = DOC_PROFILE_SWITCHER;
    this.liveGroupsDocId = DOC_GROUPS_YOU_MANAGE;
    this.store = {
      meta_kv: {},
      destinations: []
    };
    this.initDatabase();
    this.loadLearnedDocIds();
  }

  initDatabase() {
    if (!fs.existsSync(this.dataDir)) {
      try { fs.mkdirSync(this.dataDir, { recursive: true }); } catch (_) {}
    }
    if (!fs.existsSync(this.jsonPath)) {
      this._save();
      return;
    }
    // File hỏng được giữ lại (.corrupt-<ts>) thay vì bị ghi đè trắng ở lần lưu sau
    const parsed = require('./paths').readJsonSafe(this.jsonPath, null);
    if (parsed && typeof parsed === 'object') {
      this.store = {
        meta_kv: parsed.meta_kv || {},
        destinations: Array.isArray(parsed.destinations) ? parsed.destinations : []
      };
    }
  }

  _save() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      require('./paths').writeJsonAtomic(this.jsonPath, this.store);
    } catch (err) {
      console.error('[DestinationsManager] Save error:', err.message);
    }
  }

  loadLearnedDocIds() {
    try {
      const pageDocId = this.store.meta_kv['fb_live_pages_doc_id'];
      if (pageDocId && /^\d{10,}$/.test(pageDocId)) {
        this.livePagesDocId = pageDocId;
      }
      const groupDocId = this.store.meta_kv['fb_live_groups_doc_id'];
      if (groupDocId && /^\d{10,}$/.test(groupDocId)) {
        this.liveGroupsDocId = groupDocId;
      }
    } catch (err) {
      console.warn('[DestinationsManager] Load doc_ids warning:', err.message);
    }
  }

  /**
   * Tự động ghi nhớ live doc_id từ traffic mạng Playwright
   */
  rememberFacebookGraphqlDocId(requestName, docId) {
    const cleanDocId = String(docId || '').trim();
    if (!/^\d{10,}$/.test(cleanDocId)) return;

    let updatedKey = null;
    if (/CometProfileSwitcherDialogListPaginationQuery/i.test(requestName)) {
      this.livePagesDocId = cleanDocId;
      updatedKey = 'fb_live_pages_doc_id';
    } else if (/GroupsLeftRailGroupsYouManage|GroupsYouManagePaginated/i.test(requestName)) {
      this.liveGroupsDocId = cleanDocId;
      updatedKey = 'fb_live_groups_doc_id';
    }

    if (updatedKey) {
      this.store.meta_kv[updatedKey] = cleanDocId;
      this._save();
      console.log(`[DestinationsManager] Learned live GraphQL doc_id: ${updatedKey} = ${cleanDocId}`);
    }
  }

  extractCookieString(cookies) {
    if (!cookies || !Array.isArray(cookies)) return '';
    const fbCookies = cookies.filter(c => !c.domain || c.domain.includes('facebook.com'));
    return fbCookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  extractCookieValue(cookies, name) {
    if (!cookies || !Array.isArray(cookies)) return '';
    const found = cookies.find(c => c.name === name);
    return found ? found.value : '';
  }

  /**
   * Bóc tách token fb_dtsg từ trang chủ Facebook
   */
  async fetchFbDtsg(cookieStr, proxy = '') {
    try {
      // Đi qua proxy của tài khoản (trước đây luôn dùng IP máy)
      const res = await proxyNet.proxyFetch('https://www.facebook.com/', {
        proxy,
        headers: {
          'Cookie': cookieStr,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      if (!res.ok) return null;
      const html = await res.text();
      const dtsgMatch = html.match(/"DTSGInitialData"[^>]*\{\s*"token"\s*:\s*"([^"]+)"/i) ||
                        html.match(/"token"\s*:\s*"([A-Za-z0-9_-]+:[A-Za-z0-9_-]+)"/i) ||
                        html.match(/name="fb_dtsg"\s+value="([^"]+)"/i);
      return dtsgMatch ? dtsgMatch[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Truy vấn trực tiếp Facebook GraphQL endpoint với live doc_id
   */
  async queryFacebookGraphql(account, docId, friendlyName, variables = {}) {
    const cookieStr = this.extractCookieString(account.cookies);
    const cUser = account.uid || this.extractCookieValue(account.cookies, 'c_user');
    if (!cookieStr || !cUser) return null;

    const fbDtsg = await this.fetchFbDtsg(cookieStr, account.proxy);

    const bodyParams = new URLSearchParams();
    bodyParams.append('doc_id', docId);
    bodyParams.append('variables', JSON.stringify(variables));
    bodyParams.append('fb_api_req_friendly_name', friendlyName);
    bodyParams.append('fb_api_caller_class', 'RelayModern');
    bodyParams.append('server_timestamps', 'true');
    if (fbDtsg) bodyParams.append('fb_dtsg', fbDtsg);
    bodyParams.append('__user', cUser);
    bodyParams.append('__a', '1');

    try {
      const res = await proxyNet.proxyFetch('https://www.facebook.com/api/graphql/', {
        proxy: account.proxy,
        method: 'POST',
        headers: {
          'Cookie': cookieStr,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': '*/*',
          'Origin': 'https://www.facebook.com',
          'Referer': 'https://www.facebook.com/'
        },
        body: bodyParams.toString()
      });

      if (!res.ok) return null;
      const text = await res.text();
      return text;
    } catch (err) {
      console.warn('[DestinationsManager] GraphQL POST error:', err.message);
      return null;
    }
  }

  /**
   * Bóc tách Fanpage con qua GraphQL doc_id & Fallback HTML
   */
  async discoverFacebookDestinations(account) {
    if (!account || !account.cookies) return [];

    const cookieStr = this.extractCookieString(account.cookies);
    const cUser = account.uid || this.extractCookieValue(account.cookies, 'c_user');
    if (!cookieStr || !cUser) return [];

    const destinations = [];
    const now = Date.now();
    const foundIds = new Set();

    // 1. Luôn có điểm đến chính: Profile cá nhân
    const mainDest = {
      id: `dest_main_${account.id}`,
      account_id: account.id,
      target_id: cUser,
      name: `Trang cá nhân (${account.displayName || account.username || 'Chính'})`,
      type: 'profile',
      avatar_url: account.avatarUrl || account.avatar || '',
      selected: 1,
      enabled: 1,
      followers: '',
      created_at: now,
      updated_at: now
    };
    destinations.push(mainDest);
    foundIds.add(cUser);

    // 2. Fast-Path: Thử query qua GraphQL doc_id
    try {
      const gqlResult = await this.queryFacebookGraphql(
        account,
        this.livePagesDocId,
        'CometProfileSwitcherDialogListPaginationQuery',
        { count: 30, cursor: null }
      );

      if (gqlResult && !gqlResult.includes('"errors":')) {
        // Parse edges
        const idRegex = /"id"\s*:\s*"(\d+)"/g;
        const nameRegex = /"name"\s*:\s*"([^"]+)"/;
        const picRegex = /"uri"\s*:\s*"(https:[^"]+)"/;

        const chunks = gqlResult.split(/"node"\s*:/);
        for (const chunk of chunks.slice(1)) {
          const idMatch = chunk.match(/"id"\s*:\s*"(\d+)"/);
          if (!idMatch) continue;
          const pageId = idMatch[1];
          if (foundIds.has(pageId)) continue;

          const nameMatch = chunk.match(nameRegex);
          const picMatch = chunk.match(picRegex);

          const pageName = nameMatch ? nameMatch[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, cp) => String.fromCharCode(parseInt(cp, 16))) : `Fanpage ${pageId}`;
          const avatarUrl = picMatch ? picMatch[1].replace(/\\\//g, '/') : '';

          foundIds.add(pageId);
          destinations.push({
            id: `dest_page_${pageId}`,
            account_id: account.id,
            target_id: pageId,
            name: `Fanpage ${pageName}`,
            type: 'page',
            avatar_url: avatarUrl,
            selected: 1,
            enabled: 1,
            followers: '',
            created_at: now,
            updated_at: now
          });
        }
      }
    } catch (gqlErr) {
      console.warn('[DestinationsManager] Fast-path GraphQL failed, falling back to HTML:', gqlErr.message);
    }

    // 3. Fallback: Quét danh sách Fanpage từ your_pages endpoint nếu GraphQL chưa lấy đủ
    if (destinations.length <= 1) {
      try {
        const res = await proxyNet.proxyFetch('https://www.facebook.com/pages/?category=your_pages', {
          proxy: account.proxy,
          headers: {
            'Cookie': cookieStr,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (res.ok) {
          const html = await res.text();
          const unescaped = html.replace(/\\\//g, '/');

          const delegateRegex = /"delegate_page_id"\s*:\s*"(\d+)"/g;
          let match;

          while ((match = delegateRegex.exec(unescaped)) !== null) {
            const pageId = match[1];
            if (foundIds.has(pageId)) continue;
            foundIds.add(pageId);

            const start = Math.max(0, match.index - 800);
            const end = Math.min(unescaped.length, match.index + 800);
            const context = unescaped.slice(start, end);

            let name = '';
            const nameM = context.match(/"name"\s*:\s*"([^"]+)"/i);
            if (nameM && nameM[1] && !nameM[1].includes(account.username)) {
              name = nameM[1];
            }

            let avatarUrl = '';
            const picM = context.match(/"profile_picture"\s*:\s*\{\s*"uri"\s*:\s*"(https:[^"]+)"/i) || context.match(/"uri"\s*:\s*"(https:[^"]*scontent[^"]*)"/i);
            if (picM && picM[1]) {
              avatarUrl = picM[1];
            }

            if (name) {
              destinations.push({
                id: `dest_page_${pageId}`,
                account_id: account.id,
                target_id: pageId,
                name: `Fanpage ${name}`,
                type: 'page',
                avatar_url: avatarUrl,
                selected: 1,
                enabled: 1,
                followers: '',
                created_at: now,
                updated_at: now
              });
            }
          }
        }
      } catch (e) {
        console.warn('[DestinationsManager] Discover Facebook destinations fallback warning:', e.message);
      }
    }

    // 4. Lưu vào persistent store
    for (const d of destinations) {
      const idx = this.store.destinations.findIndex(x => x.id === d.id);
      if (idx >= 0) {
        this.store.destinations[idx] = {
          ...this.store.destinations[idx],
          name: d.name,
          avatar_url: d.avatar_url,
          updated_at: d.updated_at
        };
      } else {
        this.store.destinations.push(d);
      }
    }
    this._save();

    // 5. Đồng bộ lại vào accounts.json
    try {
      const storage = require('./storage');
      account.destinations = destinations.map(d => ({
        id: d.id,
        targetId: d.target_id,
        name: d.name,
        type: d.type,
        avatarUrl: d.avatar_url,
        selected: Boolean(d.selected),
        enabled: Boolean(d.enabled)
      }));
      storage.updateAccount(account);
    } catch (err) {
      console.warn('[DestinationsManager] Storage sync error:', err.message);
    }

    return destinations;
  }

  // Lấy danh sách điểm đến của tài khoản
  getDestinations(accountId) {
    const rows = this.store.destinations.filter(d => d.account_id === accountId);
    rows.sort((a, b) => {
      if (a.type !== b.type) return b.type.localeCompare(a.type);
      return (a.name || '').localeCompare(b.name || '');
    });
    return rows.map(r => ({
      ...r,
      selected: Boolean(r.selected),
      enabled: Boolean(r.enabled)
    }));
  }

  // Tích chọn / Bỏ chọn điểm đến
  toggleDestination(accountId, destId, selected) {
    const isSelected = selected ? 1 : 0;
    const dest = this.store.destinations.find(d => d.account_id === accountId && d.id === destId);
    if (dest) {
      dest.selected = isSelected;
      dest.updated_at = Date.now();
      this._save();
    }

    try {
      const storage = require('./storage');
      const acc = storage.getAccounts().find(a => a.id === accountId);
      if (acc && acc.destinations) {
        const d = acc.destinations.find(x => x.id === destId);
        if (d) d.selected = Boolean(selected);
        storage.updateAccount(acc);
      }
    } catch (err) {}

    return { success: true, destId, selected: Boolean(selected) };
  }
}

module.exports = DestinationsManager;
