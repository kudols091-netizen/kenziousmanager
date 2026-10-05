/**
 * Kenzious Get Cookie - Cookie Helper (Content Script)
 * Injected into web pages to assist with fast session detection and bridge communication.
 */

(() => {
  // Listen for window postMessage from web app if authorized
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'KENZIOUS_PAGE_CALL') return;

    if (event.data.action === 'GET_SESSION_INFO') {
      chrome.runtime.sendMessage({ action: 'GET_COOKIES' }, (response) => {
        window.postMessage({
          source: 'KENZIOUS_EXTENSION_RESP',
          response
        }, '*');
      });
    }
  });

  // Global identifier that Kenzious extension is present
  try {
    window.__KENZIOUS_EXTENSION_ACTIVE__ = true;
  } catch (e) {
    // Cross-origin or restricted context
  }
})();
