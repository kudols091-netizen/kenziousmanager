/**
 * Kenzious Get Cookie - Clone Post Hook
 * Injects sleek "Clone Post" buttons onto Facebook posts and Reels.
 */

(() => {
  // SVG icon for Clone Post button
  const CLONE_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;

  /**
   * Extract post content from a Facebook post container
   */
  function extractPostData(postElem) {
    const data = {
      caption: '',
      images: [],
      videos: [],
      author: 'Facebook User',
      authorAvatar: '',
      postUrl: window.location.href
    };

    try {
      // 1. Author Name & Avatar
      const authorLink = postElem.querySelector('h2 a, h3 a, h4 a, strong a, [role="link"]');
      if (authorLink) {
        data.author = authorLink.textContent.trim() || data.author;
      }
      const avatarImg = postElem.querySelector('image, img[src*="fbcdn"]');
      if (avatarImg) {
        data.authorAvatar = avatarImg.getAttribute('xlink:href') || avatarImg.src || '';
      }

      // 2. Caption Text
      const textElems = postElem.querySelectorAll('div[data-ad-preview="message"], div[dir="auto"]');
      for (const el of textElems) {
        const text = el.innerText ? el.innerText.trim() : '';
        // Avoid short buttons like "Like", "Comment"
        if (text && text.length > data.caption.length && !['Thích', 'Bình luận', 'Chia sẻ', 'Like', 'Comment', 'Share'].includes(text)) {
          data.caption = text;
        }
      }

      // 3. Images
      const images = postElem.querySelectorAll('img[src*="fbcdn.net"], img[data-visualcompletion="media-vc-image"]');
      const seenImgs = new Set();
      images.forEach(img => {
        const src = img.src;
        // Filter out tiny emojis and avatars
        if (src && !seenImgs.has(src) && img.naturalWidth > 150 && img.naturalHeight > 150) {
          seenImgs.add(src);
          data.images.push(src);
        }
      });

      // 4. Videos
      const videos = postElem.querySelectorAll('video');
      videos.forEach(v => {
        if (v.src && !v.src.startsWith('blob:')) {
          data.videos.push(v.src);
        }
      });

      // 5. Post Permalink
      const permalink = postElem.querySelector('a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"], a[href*="/story.php"]');
      if (permalink && permalink.href) {
        data.postUrl = permalink.href;
      }
    } catch (e) {
      console.warn('[Kenzious] Error extracting post data:', e);
    }

    return data;
  }

  /**
   * Hook button into post action bars
   */
  function injectCloneButton(postElem) {
    if (postElem.querySelector('.kz-action-btn-clone')) return;

    // Look for action row (Like, Comment, Share)
    const actionBar = postElem.querySelector('div[role="toolbar"], div[aria-label*="Thích"], div[aria-label*="Like"]') ||
                      postElem.querySelector('div[data-pagelet*="FeedUnit"] div:last-child');

    const btn = document.createElement('button');
    btn.className = 'kz-action-btn-clone';
    btn.innerHTML = `${CLONE_ICON_SVG} <span>Clone Post</span>`;
    btn.title = 'Clone bài viết này qua Kenzious';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const postData = extractPostData(postElem);
      if (window.ClonePostModal) {
        window.ClonePostModal.open(postData);
      }
    });

    if (actionBar && actionBar.parentNode) {
      actionBar.parentNode.insertBefore(btn, actionBar.nextSibling);
    } else {
      postElem.style.position = 'relative';
      btn.style.position = 'absolute';
      btn.style.top = '10px';
      btn.style.right = '45px';
      postElem.appendChild(btn);
    }
  }

  /**
   * Scan DOM for posts
   */
  function scanPosts() {
    const posts = document.querySelectorAll('div[role="feed"] > div, div[role="article"], div[data-pagelet*="FeedUnit"]');
    posts.forEach(injectCloneButton);

    // Also handle Reels
    const reels = document.querySelectorAll('div[data-video-id], div[aria-label*="Reels"]');
    reels.forEach(injectCloneButton);
  }

  // MutationObserver for infinite scroll feeds
  const observer = new MutationObserver(() => {
    scanPosts();
  });

  // Start observing when DOM is ready
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
    scanPosts();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      scanPosts();
    });
  }

  console.log('[Kenzious] Clone Post hook initialized on Facebook.');
})();
