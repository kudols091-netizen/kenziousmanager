/**
 * Kenzious Get Cookie - Service Worker (Manifest V3)
 * Handles cookie extraction, cookie import, Facebook UID resolution, Token extraction, and IPC messaging.
 */

// Service Worker installation & update lifecycle
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Kenzious] Extension installed/updated:', details.reason);
});

// IPC Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, payload } = request;

  switch (action) {
    case 'GET_ACTIVE_TAB':
      handleGetActiveTab(sendResponse);
      return true;

    case 'GET_COOKIES':
      handleGetCookies(payload, sendResponse);
      return true;

    case 'IMPORT_COOKIES':
      handleImportCookies(payload, sendResponse);
      return true;

    case 'RESOLVE_FB_UID':
      handleResolveFbUid(payload, sendResponse);
      return true;

    case 'GET_ADS_TOKEN':
      handleGetAdsToken(sendResponse);
      return true;

    case 'GET_PANCAKE_TOKEN':
      handleGetPancakeToken(sendResponse);
      return true;

    case 'FETCH_FACEBOOK_GRAPHQL':
      handleFetchFacebookGraphQL(payload, sendResponse);
      return true;

    case 'DOWNLOAD_MEDIA':
      handleDownloadMedia(payload, sendResponse);
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action: ' + action });
      return false;
  }
});

/**
 * Get active tab in the current window
 */
async function handleGetActiveTab(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      sendResponse({ success: true, tab: tabs[0] });
    } else {
      sendResponse({ success: false, error: 'No active tab found' });
    }
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Extract cookies for a specific domain or active URL
 */
async function handleGetCookies(payload, sendResponse) {
  try {
    const { url, domain } = payload || {};
    let queryDetails = {};

    if (url) {
      queryDetails.url = url;
    } else if (domain) {
      queryDetails.domain = domain;
    } else {
      // Fallback to active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0 && tabs[0].url) {
        queryDetails.url = tabs[0].url;
      }
    }

    const cookies = await chrome.cookies.getAll(queryDetails);
    sendResponse({ success: true, cookies, count: cookies.length });
  } catch (err) {
    console.error('[Kenzious] Error getting cookies:', err);
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Import cookies into the browser for the target domain
 */
async function handleImportCookies(payload, sendResponse) {
  try {
    const { cookies, targetUrl, clearExisting } = payload;
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return sendResponse({ success: false, error: 'Danh sách cookie trống hoặc không hợp lệ' });
    }

    const parsedUrl = new URL(targetUrl || 'https://www.facebook.com');
    const domain = parsedUrl.hostname;

    // Optional: Clear existing cookies for a clean session switch
    if (clearExisting) {
      const existing = await chrome.cookies.getAll({ domain });
      for (const c of existing) {
        const removeUrl = `${c.secure ? 'https' : 'http'}://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}${c.path}`;
        await chrome.cookies.remove({ url: removeUrl, name: c.name }).catch(() => {});
      }
    }

    let successCount = 0;
    for (const c of cookies) {
      const cookieDomain = c.domain ? (c.domain.startsWith('.') ? c.domain : '.' + c.domain) : ('.' + domain);
      const cookieUrl = `https://${cookieDomain.startsWith('.') ? cookieDomain.slice(1) : cookieDomain}${c.path || '/'}`;

      const cookieData = {
        url: cookieUrl,
        name: c.name,
        value: c.value,
        path: c.path || '/',
        secure: c.secure !== undefined ? c.secure : true,
        httpOnly: c.httpOnly !== undefined ? c.httpOnly : false,
        sameSite: c.sameSite && ['no_restriction', 'lax', 'strict'].includes(c.sameSite) ? c.sameSite : 'no_restriction'
      };

      if (!c.domain || c.domain.includes(domain) || domain.includes(c.domain)) {
        cookieData.domain = cookieDomain;
      }

      if (c.expirationDate) {
        cookieData.expirationDate = c.expirationDate;
      }

      try {
        await chrome.cookies.set(cookieData);
        successCount++;
      } catch (e) {
        // Retry with simplified fallback URL
        try {
          delete cookieData.domain;
          cookieData.url = targetUrl || 'https://www.facebook.com';
          await chrome.cookies.set(cookieData);
          successCount++;
        } catch (innerErr) {
          console.warn('[Kenzious] Failed to set cookie:', c.name, innerErr.message);
        }
      }
    }

    sendResponse({ success: true, count: successCount, total: cookies.length });
  } catch (err) {
    console.error('[Kenzious] Error importing cookies:', err);
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Resolve a Facebook link/username to its numeric UID
 */
async function handleResolveFbUid(payload, sendResponse) {
  try {
    const { link } = payload;
    if (!link) return sendResponse({ success: false, error: 'Thiếu link Facebook' });

    // Clean up link
    let cleanLink = link.trim();
    if (!cleanLink.startsWith('http')) {
      cleanLink = 'https://www.facebook.com/' + cleanLink.replace(/^\/+/, '');
    }

    // Direct check: If link already has numeric ID in query or path
    const profileIdMatch = cleanLink.match(/[?&]id=(\d+)/);
    if (profileIdMatch) {
      return sendResponse({ success: true, uid: profileIdMatch[1], source: 'query_param' });
    }

    const postMatch = cleanLink.match(/\/(?:posts|videos|reel|stories)\/(\d+)/);
    if (postMatch) {
      return sendResponse({ success: true, uid: postMatch[1], source: 'post_path' });
    }

    // Otherwise, fetch HTML page using authenticated session
    const response = await fetch(cleanLink, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      }
    });

    const html = await response.text();

    // Regex matchers for Facebook UID
    const patterns = [
      /"userID":"(\d+)"/,
      /"actorID":"(\d+)"/,
      /"entity_id":"(\d+)"/,
      /"delegate_page":\{"id":"(\d+)"/,
      /fb:\/\/profile\/(\d+)/,
      /fb:\/\/page\/(\d+)/,
      /fb:\/\/group\/(\d+)/,
      /content="fb:\/\/profile\/(\d+)"/,
      /"targetID":"(\d+)"/,
      /"pageID":"(\d+)"/,
      /"groupID":"(\d+)"/,
      /al:android:url" content="fb:\/\/[^"]*?(\d{8,})/,
      /al:ios:url" content="fb:\/\/[^"]*?(\d{8,})/
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        return sendResponse({ success: true, uid: match[1], source: 'html_pattern' });
      }
    }

    sendResponse({ success: false, error: 'Không tìm thấy UID cho link này' });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Extract Facebook Ads Manager Access Token (EAAB...)
 */
async function handleGetAdsToken(sendResponse) {
  try {
    const adsUrl = 'https://adsmanager.facebook.com/adsmanager/manage/campaigns';
    const response = await fetch(adsUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    const html = await response.text();

    // Look for EAAB token pattern
    const tokenMatches = [
      /["'](EAAB[a-zA-Z0-9]+)["']/,
      /accessToken["']\s*:\s*["'](EAAB[^"']+)["']/,
      /access_token["']\s*:\s*["'](EAAB[^"']+)["']/
    ];

    for (const regex of tokenMatches) {
      const match = html.match(regex);
      if (match && match[1]) {
        return sendResponse({ success: true, token: match[1] });
      }
    }

    // Secondary fallback: inspect cookies for fb_dtsg and fetch graph token
    const dtsgMatch = html.match(/["']DTSGInitialData["'],\[\],\{["']token["']:["']([^"']+)["']/);
    const uidMatch = html.match(/"USER_ID":"(\d+)"/);

    if (dtsgMatch && dtsgMatch[1]) {
      sendResponse({
        success: true,
        token: null,
        fb_dtsg: dtsgMatch[1],
        uid: uidMatch ? uidMatch[1] : null,
        message: 'Lấy được fb_dtsg. Vui lòng mở Ads Manager để hoàn tất lấy token đầy đủ.'
      });
    } else {
      sendResponse({ success: false, error: 'Chưa đăng nhập Ads Manager hoặc tài khoản không có quyền quảng cáo.' });
    }
  } catch (err) {
    sendResponse({ success: false, error: 'Lỗi kết nối Ads Manager: ' + err.message });
  }
}

/**
 * Extract Pancake access token from pancake.vn
 */
async function handleGetPancakeToken(sendResponse) {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'pancake.vn' });
    const tokenCookie = cookies.find(c => c.name === 'jwt' || c.name === 'token' || c.name === 'access_token' || c.name === 'pancake_token');

    if (tokenCookie) {
      return sendResponse({ success: true, token: tokenCookie.value });
    }

    // Try finding pancake tab
    const tabs = await chrome.tabs.query({ url: '*://*.pancake.vn/*' });
    if (tabs.length > 0) {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          return localStorage.getItem('token') || localStorage.getItem('access_token') || localStorage.getItem('jwt') || sessionStorage.getItem('token');
        }
      });
      if (result && result[0] && result[0].result) {
        return sendResponse({ success: true, token: result[0].result });
      }
    }

    sendResponse({ success: false, error: 'Không tìm thấy Token Pancake. Hãy đăng nhập pancake.vn trước.' });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Proxy Facebook GraphQL queries
 */
async function handleFetchFacebookGraphQL(payload, sendResponse) {
  try {
    const { docId, variables, fb_dtsg } = payload;
    const bodyParams = new URLSearchParams();
    bodyParams.append('doc_id', docId);
    bodyParams.append('variables', JSON.stringify(variables));
    if (fb_dtsg) bodyParams.append('fb_dtsg', fb_dtsg);

    const response = await fetch('https://www.facebook.com/api/graphql/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-FB-Friendly-Name': 'KenziousGraphQL'
      },
      body: bodyParams.toString()
    });

    const data = await response.json();
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Helper to download media file
 */
async function handleDownloadMedia(payload, sendResponse) {
  try {
    const { url, filename } = payload;
    chrome.downloads.download({
      url: url,
      filename: filename || 'kenzious_media.mp4',
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}
