/**
 * Kenzious Get Cookie - Facebook ID / UID Detector
 * Scans Facebook DOM, URL, meta tags, and Comet state to resolve accurate numeric UIDs.
 */

const FbIdDetector = {
  /**
   * Detect numeric UID of current Facebook page/profile/group/post
   * @returns {{success: boolean, uid?: string, type?: string, error?: string}}
   */
  detectCurrentPageUid() {
    const url = window.location.href;

    // 1. Direct query param `id=1000...`
    const queryIdMatch = url.match(/[?&]id=(\d+)/);
    if (queryIdMatch) {
      return { success: true, uid: queryIdMatch[1], type: 'Profile / Page' };
    }

    // 2. Groups `groups/12345678...`
    const groupMatch = url.match(/\/groups\/(\d+)/);
    if (groupMatch) {
      return { success: true, uid: groupMatch[1], type: 'Facebook Group' };
    }

    // 3. Posts / Videos / Reels
    const postMatch = url.match(/\/(?:posts|videos|reel|watch\/\?v=)(\d+)/);
    if (postMatch) {
      return { success: true, uid: postMatch[1], type: 'Post / Video' };
    }

    // 4. Meta tags: al:android:url or al:ios:url (e.g. fb://profile/1000..., fb://page/...)
    const metaAndroid = document.querySelector('meta[property="al:android:url"]');
    if (metaAndroid && metaAndroid.content) {
      const match = metaAndroid.content.match(/fb:\/\/(?:profile|page|group|post)\/(\d+)/);
      if (match) {
        return { success: true, uid: match[1], type: 'Meta App Link' };
      }
    }

    const metaIos = document.querySelector('meta[property="al:ios:url"]');
    if (metaIos && metaIos.content) {
      const match = metaIos.content.match(/fb:\/\/(?:profile|page|group|post)\/(\d+)/);
      if (match) {
        return { success: true, uid: match[1], type: 'Meta iOS Link' };
      }
    }

    // 5. Check script tags containing "entity_id" or "userID"
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const content = s.textContent || '';
      if (content.length > 20 && content.length < 500000) {
        const entityMatch = content.match(/"entity_id":"(\d+)"/);
        if (entityMatch) {
          return { success: true, uid: entityMatch[1], type: 'Entity ID' };
        }
        const delegateMatch = content.match(/"delegate_page":\{"id":"(\d+)"/);
        if (delegateMatch) {
          return { success: true, uid: delegateMatch[1], type: 'Delegate Page' };
        }
      }
    }

    // 6. Check Current User ID (c_user from cookies)
    const cookieMatch = document.cookie.match(/(?:^|;\s*)c_user=(\d+)/);
    if (cookieMatch) {
      return { success: true, uid: cookieMatch[1], type: 'Current User' };
    }

    return { success: false, error: 'Không tìm thấy UID trên trang hiện tại' };
  }
};

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_CURRENT_PAGE_UID') {
    const result = FbIdDetector.detectCurrentPageUid();
    sendResponse(result);
    return true;
  }
});
