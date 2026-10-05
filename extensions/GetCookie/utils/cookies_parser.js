/**
 * Kenzious Get Cookie - Cookie Parser & Formatter Utility
 * Supports JSON, Header String (cURL), Netscape, and Base64 format conversions.
 */

const CookieParser = {
  /**
   * Convert an array of Chrome cookie objects into standard Header string format (key=value; ...)
   * @param {Array<chrome.cookies.Cookie>} cookies
   * @returns {string}
   */
  toHeaderString(cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) return '';
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  },

  /**
   * Convert Chrome cookies array into formatted JSON string
   * @param {Array<chrome.cookies.Cookie>} cookies
   * @param {boolean} minified
   * @returns {string}
   */
  toJSON(cookies, minified = false) {
    if (!Array.isArray(cookies)) return '[]';
    const formatted = cookies.map(c => ({
      domain: c.domain,
      expirationDate: c.expirationDate,
      hostOnly: c.hostOnly,
      httpOnly: c.httpOnly,
      name: c.name,
      path: c.path,
      sameSite: c.sameSite,
      secure: c.secure,
      session: c.session,
      storeId: c.storeId,
      value: c.value
    }));
    return minified ? JSON.stringify(formatted) : JSON.stringify(formatted, null, 2);
  },

  /**
   * Convert Chrome cookies array into Netscape HTTP Cookie File format (curl/wget/yt-dlp compatible)
   * @param {Array<chrome.cookies.Cookie>} cookies
   * @returns {string}
   */
  toNetscape(cookies) {
    if (!Array.isArray(cookies)) return '';
    const lines = [
      '# Netscape HTTP Cookie File',
      '# https://curl.haxx.se/rfc/cookie_spec.html',
      '# Exported by Kenzious Get Cookie',
      ''
    ];
    cookies.forEach(c => {
      const domain = c.domain.startsWith('.') ? c.domain : '.' + c.domain;
      const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const path = c.path || '/';
      const secure = c.secure ? 'TRUE' : 'FALSE';
      const expiry = c.expirationDate ? Math.round(c.expirationDate) : Math.round(Date.now() / 1000) + 86400 * 365;
      lines.push(`${domain}\t${flag}\t${path}\t${secure}\t${expiry}\t${c.name}\t${c.value}`);
    });
    return lines.join('\n');
  },

  /**
   * Convert cookies into Base64 encoded JSON
   * @param {Array<chrome.cookies.Cookie>} cookies
   * @returns {string}
   */
  toBase64(cookies) {
    const jsonStr = this.toJSON(cookies, true);
    return btoa(unescape(encodeURIComponent(jsonStr)));
  },

  /**
   * Parse arbitrary user input string (JSON, Header string, Base64, or Netscape) into an array of cookie items
   * @param {string} inputStr
   * @param {string} defaultDomain
   * @returns {Array<{name: string, value: string, domain?: string, path?: string, secure?: boolean, httpOnly?: boolean}>}
   */
  parseInput(inputStr, defaultDomain = '') {
    if (!inputStr || typeof inputStr !== 'string') return [];
    let trimmed = inputStr.trim();

    // Check if Base64
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 20 && !trimmed.includes(';') && !trimmed.includes('=')) {
      try {
        const decoded = decodeURIComponent(escape(atob(trimmed)));
        if (decoded.startsWith('[') || decoded.startsWith('{')) {
          trimmed = decoded;
        }
      } catch (e) {
        // Not base64, proceed
      }
    }

    // Try parsing as JSON array
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(item => ({
            name: item.name,
            value: item.value,
            domain: item.domain || defaultDomain,
            path: item.path || '/',
            secure: typeof item.secure === 'boolean' ? item.secure : true,
            httpOnly: typeof item.httpOnly === 'boolean' ? item.httpOnly : false,
            expirationDate: item.expirationDate
          })).filter(c => c.name && c.value !== undefined);
        }
      } catch (e) {
        // Continue to other formats
      }
    }

    // Try parsing as JSON object { key: value }
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        const result = [];
        for (const [key, val] of Object.entries(parsed)) {
          result.push({
            name: key,
            value: String(val),
            domain: defaultDomain,
            path: '/',
            secure: true
          });
        }
        if (result.length > 0) return result;
      } catch (e) {
        // Continue to other formats
      }
    }

    // Try parsing as Netscape format
    if (trimmed.includes('\t') && (trimmed.includes('# Netscape') || trimmed.split('\n')[0].split('\t').length >= 6)) {
      const lines = trimmed.split(/\r?\n/);
      const result = [];
      lines.forEach(line => {
        const lineTrimmed = line.trim();
        if (!lineTrimmed || lineTrimmed.startsWith('#')) return;
        const parts = line.split('\t');
        if (parts.length >= 7) {
          result.push({
            domain: parts[0],
            path: parts[2] || '/',
            secure: parts[3] === 'TRUE',
            expirationDate: parseInt(parts[4], 10) || undefined,
            name: parts[5],
            value: parts[6]
          });
        }
      });
      if (result.length > 0) return result;
    }

    // Default: Header String format ("c_user=123; xs=abc; datr=xyz")
    const result = [];
    const pairs = trimmed.split(';');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx !== -1) {
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (name) {
          result.push({
            name,
            value,
            domain: defaultDomain,
            path: '/',
            secure: true
          });
        }
      }
    }
    return result;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CookieParser;
}
