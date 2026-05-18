(function () {
  'use strict';

  function shortIdFromPath(p) {
    const m = p && p.match(/^\/shorts\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  let lockedId = shortIdFromPath(location.pathname);

  function resyncLock() {
    const here = shortIdFromPath(location.pathname);
    if (here) {
      // Always relock to whatever short the user is currently on.
      lockedId = here;
    } else {
      lockedId = null;
    }
  }

  function urlWouldChangeShort(url) {
    if (!lockedId || url == null) return false;
    let parsed;
    try { parsed = new URL(url, location.href); } catch (e) { return false; }
    const targetId = shortIdFromPath(parsed.pathname);
    return !!(targetId && targetId !== lockedId);
  }

  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function (state, title, url) {
    if (urlWouldChangeShort(url)) return;
    return origPush.apply(this, arguments);
  };

  history.replaceState = function (state, title, url) {
    if (urlWouldChangeShort(url)) return;
    return origReplace.apply(this, arguments);
  };

  window.addEventListener('popstate', function () {
    if (lockedId) {
      const here = shortIdFromPath(location.pathname);
      if (here && here !== lockedId) {
        // Snap the URL back without triggering a real navigation.
        origReplace.call(history, null, '', '/shorts/' + lockedId);
        return;
      }
    }
    resyncLock();
  }, true);

  // If we ever drift to a different short anyway (e.g. via a navigation API
  // we didn't cover), accept the new location as the new lock target rather
  // than fighting it forever.
  let lastPath = location.pathname;
  setInterval(function () {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      resyncLock();
    }
  }, 500);

  // ----- Block pre-fetch of next-short metadata -----------------------------
  // YT triggers next-short media loading by first calling its internal API
  // (/youtubei/v1/player, /next, /reel/...) with a `videoId` for the upcoming
  // short. If we let those through, the DASH manifest and segment fetches
  // follow. Filter those API calls to allow only the currently-locked videoId.

  function isYouTubeiApi(url) {
    if (!url) return false;
    return /\/youtubei\/v1\/(player|next|reel|guide|browse)/.test(url);
  }

  // Extract videoId from a request body (JSON string or FormData/URLSearchParams).
  function bodyVideoId(body) {
    try {
      if (body == null) return null;
      if (typeof body === 'string') {
        const m = body.match(/"videoId"\s*:\s*"([^"]+)"/);
        return m ? m[1] : null;
      }
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        return body.get('videoId') || null;
      }
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
        return body.get('videoId') || null;
      }
    } catch (e) {}
    return null;
  }

  function shouldBlock(url, body) {
    if (!lockedId) return false;
    if (!isYouTubeiApi(url)) return false;
    const vid = bodyVideoId(body);
    // Only block when we can clearly identify a different videoId.
    return !!(vid && vid !== lockedId);
  }

  // --- fetch ---
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string'
          ? input
          : (input && input.url) || '';
        const body = (init && init.body) ||
          (input && typeof input !== 'string' ? input.body : null);
        if (shouldBlock(url, body)) {
          // Resolve with an empty response — rejecting causes uncaught errors
          // in YT code and shows as console noise.
          return Promise.resolve(new Response('', { status: 204 }));
        }
      } catch (e) {}
      return origFetch.apply(this, arguments);
    };
  }

  // --- XMLHttpRequest ---
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__ytsl_url = url;
      return origOpen.apply(this, arguments);
    };
    XHR.prototype.send = function (body) {
      try {
        if (shouldBlock(this.__ytsl_url, body)) {
          // Short-circuit: don't actually send. Fire load/end so callers settle.
          const self = this;
          setTimeout(function () {
            try {
              Object.defineProperty(self, 'readyState', { value: 4, configurable: true });
              Object.defineProperty(self, 'status', { value: 204, configurable: true });
              Object.defineProperty(self, 'responseText', { value: '', configurable: true });
              self.dispatchEvent(new Event('readystatechange'));
              self.dispatchEvent(new Event('load'));
              self.dispatchEvent(new Event('loadend'));
            } catch (e) {}
          }, 0);
          return;
        }
      } catch (e) {}
      return origSend.apply(this, arguments);
    };
  }
})();
