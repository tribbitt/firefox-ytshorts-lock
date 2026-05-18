(function () {
  'use strict';

  const BLOCKED_KEYS = new Set([
    'ArrowUp',
    'ArrowDown',
    'PageUp',
    'PageDown',
    'Home',
    'End'
  ]);

  function isOnShorts() {
    return location.pathname.startsWith('/shorts/');
  }

  function syncLockClass() {
    const root = document.documentElement;
    if (!root) return;
    if (isOnShorts()) {
      root.classList.add('ytsl-locked');
    } else {
      root.classList.remove('ytsl-locked');
    }
  }
  syncLockClass();

  function killEvent(e) {
    e.stopImmediatePropagation();
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
  }

  function keyHandler(e) {
    if (!isOnShorts()) return;
    if (BLOCKED_KEYS.has(e.key) || BLOCKED_KEYS.has(e.code)) {
      killEvent(e);
    }
  }
  ['keydown', 'keyup', 'keypress'].forEach(function (t) {
    window.addEventListener(t, keyHandler, { capture: true, passive: false });
    document.addEventListener(t, keyHandler, { capture: true, passive: false });
  });

  function wheelHandler(e) {
    if (!isOnShorts()) return;
    killEvent(e);
  }
  ['wheel', 'mousewheel', 'DOMMouseScroll'].forEach(function (t) {
    window.addEventListener(t, wheelHandler, { capture: true, passive: false });
  });

  function touchHandler(e) {
    if (!isOnShorts()) return;
    killEvent(e);
  }
  window.addEventListener('touchmove', touchHandler, { capture: true, passive: false });
  window.addEventListener('gesturechange', touchHandler, { capture: true, passive: false });

  // Block clicks on any leftover next/prev nav button that escaped the CSS hide.
  function clickHandler(e) {
    if (!isOnShorts()) return;
    const t = e.target;
    if (!(t && t.closest)) return;
    const btn = t.closest(
      '#navigation-button-up, #navigation-button-down, ' +
      '[aria-label="Next video"], [aria-label="Previous video"], ' +
      '[aria-label="Next Short"], [aria-label="Previous Short"], ' +
      '.shorts-navigation-button-up, .shorts-navigation-button-down'
    );
    if (btn) killEvent(e);
  }
  ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(function (t) {
    window.addEventListener(t, clickHandler, { capture: true, passive: false });
  });

  // React to SPA route changes so the lock class stays in sync.
  let lastPath = location.pathname;
  setInterval(function () {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      syncLockClass();
    }
  }, 250);

  // Prevent pre-loading + peek of the next short. Strategy:
  //   - Wait until YT designates an `is-active` reel-video-renderer.
  //   - Remove every other reel-video-renderer from the DOM. Removing the
  //     element kills its <video>, which kills any in-flight media load.
  //   - Re-run on any DOM mutation so re-inserted renderers get removed again.
  // Critical: must not act before `is-active` exists — YT inserts renderers
  // first and sets is-active later, so early intervention breaks the eventual
  // active short.
  function stopMedia(v) {
    try { v.pause(); } catch (e) {}
    try { if (v.srcObject) v.srcObject = null; } catch (e) {}
    try { if (v.getAttribute('src')) v.removeAttribute('src'); } catch (e) {}
    try { v.removeAttribute('autoplay'); } catch (e) {}
    try { v.setAttribute('preload', 'none'); } catch (e) {}
    try { v.load(); } catch (e) {}
  }

  function killRenderer(renderer) {
    // Stop media first so any in-flight segment requests are aborted,
    // then drop the renderer from the DOM entirely.
    try { renderer.querySelectorAll('video').forEach(stopMedia); } catch (e) {}
    try { renderer.remove(); } catch (e) {}
  }

  function sweep() {
    if (!isOnShorts()) return;
    const active = document.querySelector('ytd-reel-video-renderer[is-active]');
    if (!active) return; // Wait for YT to designate the active short.
    const all = document.querySelectorAll('ytd-reel-video-renderer');
    all.forEach(function (r) {
      if (r === active) return;
      killRenderer(r);
    });
  }

  let sweepTimer = 0;
  function scheduleSweep() {
    if (sweepTimer) return;
    sweepTimer = setTimeout(function () {
      sweepTimer = 0;
      sweep();
    }, 30);
  }

  const mo = new MutationObserver(scheduleSweep);
  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['is-active']
  });
  // Safety-net poll for is-active flips the MO might miss.
  setInterval(scheduleSweep, 500);

  // Inject the page-context script that hijacks history navigation.
  // Must run in page world to override the same `history` object YouTube uses.
  try {
    const s = document.createElement('script');
    s.src = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('injected.js');
    s.async = false;
    s.onload = function () { s.remove(); };
    (document.head || document.documentElement).appendChild(s);
  } catch (err) {
    console.warn('[YT Shorts Lock] failed to inject page-context script:', err);
  }
})();
