/**
 * pro-access.js — the access gate for Pro content
 * ------------------------------------------------
 * Five pages each carried their own copy of this logic. They had already
 * drifted once (the Classic quiz ignored the ?unlock= redirect for a while,
 * so buyers arriving from Gumroad hit a wall), and every future change meant
 * five edits and five chances to miss one.
 *
 * This is that logic, once. Behaviour is deliberately identical to what the
 * five copies did on the day it was extracted — no new capability here. Licence
 * keys come next, and land in this one file rather than five.
 *
 * Markup contract, unchanged from before:
 *   #gateOverlay  — overlay style (DPS, tank, healer, hub). Removed on unlock.
 *   #gateWall     — inline style (Classic). Hidden, with #mainContent shown.
 *   #unlockInput  — where the unlock word is typed
 *   #unlockErr / #gateError — the "wrong word" message
 *
 * Exposes window.ProAccess plus the legacy global function names the inline
 * onclick handlers already reference.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'wowquiz_premium_v1';
  var UNLOCK_WORD = 'MIDNIGHT2026';
  var ACCESS_DAYS = 365;

  function track(name, params) {
    try {
      if (typeof window.wowTrack === 'function') window.wowTrack(name, params);
    } catch (e) { /* never let analytics break the gate */ }
  }

  function pageName() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  // ── Entitlement ───────────────────────────────────────────────────────
  function saveAccess() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        unlocked: true,
        expiry: Date.now() + ACCESS_DAYS * 24 * 60 * 60 * 1000
      }));
    } catch (e) { /* private browsing — access lasts the session only */ }
  }

  function hasStoredAccess() {
    try {
      var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return !!(d.unlocked && d.expiry > Date.now());
    } catch (e) { return false; }
  }

  // ── Gate UI ───────────────────────────────────────────────────────────
  // Two markup styles exist. Rather than make every page adopt one, handle
  // both: the migration stays a pure refactor and no page's markup changes.
  function dismissGate() {
    var overlay = document.getElementById('gateOverlay');
    if (overlay) {
      overlay.style.transition = 'opacity 0.4s';
      overlay.style.opacity = '0';
      window.setTimeout(function () { overlay.remove(); }, 420);
    }
    var wall = document.getElementById('gateWall');
    if (wall) {
      wall.style.display = 'none';
      var main = document.getElementById('mainContent');
      if (main) main.style.display = 'block';
    }
  }

  function showGate() {
    var wall = document.getElementById('gateWall');
    if (wall) {
      wall.style.display = 'block';
      var main = document.getElementById('mainContent');
      if (main) main.style.display = 'none';
    }
    // The overlay style is visible by default and needs no action.
  }

  function showError() {
    var err = document.getElementById('unlockErr') ||
              document.getElementById('gateError');
    if (err) err.style.display = 'block';
    var input = document.getElementById('unlockInput') ||
                document.getElementById('gateInput');
    if (input) input.focus();
  }

  // ── Unlock paths ──────────────────────────────────────────────────────
  function unlockWithWord() {
    var input = document.getElementById('unlockInput') ||
                document.getElementById('gateInput');
    var val = ((input && input.value) || '').trim().toUpperCase();
    if (val === UNLOCK_WORD) {
      track('unlock_success', { page: pageName(), method: 'word' });
      saveAccess();
      dismissGate();
      return true;
    }
    showError();
    return false;
  }

  function restoreAccess() {
    if (hasStoredAccess()) {
      dismissGate();
      return true;
    }
    window.alert(
      'No purchase found on this browser.\n\n' +
      'Open the confirmation email from Gumroad and click the product link — ' +
      'it will unlock access on this device automatically. ' +
      'Or enter your unlock word below.'
    );
    return false;
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  function checkAccess() {
    // Never gate local development.
    if (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.protocol === 'file:') {
      dismissGate();
      return;
    }

    // Arriving from Gumroad's redirect. Strip only the unlock param, keeping
    // any others — dropping the whole query string used to discard utm_ tags,
    // which silently broke attribution for exactly the visitors who converted.
    var params = new URLSearchParams(window.location.search);
    if (params.get('unlock') === UNLOCK_WORD) {
      track('unlock_success', { page: pageName(), method: 'url' });
      saveAccess();
      params.delete('unlock');
      var qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
      dismissGate();
      return;
    }

    if (hasStoredAccess()) {
      dismissGate();
      return;
    }

    showGate();
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // Enter submits the unlock field.
  onReady(function () {
    var input = document.getElementById('unlockInput') ||
                document.getElementById('gateInput');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); unlockWithWord(); }
      });
    }
  });

  // Run immediately so gated content is never briefly visible.
  checkAccess();

  window.ProAccess = {
    hasAccess: hasStoredAccess,
    grant: saveAccess,
    dismiss: dismissGate,
    unlockWithWord: unlockWithWord,
    restore: restoreAccess,
    UNLOCK_WORD: UNLOCK_WORD
  };

  // Inline onclick handlers in the existing markup call these by name.
  window.unlockWithWord = unlockWithWord;
  window.restoreAccess = restoreAccess;
  window.tryUnlock = unlockWithWord;   // the Classic quiz's name for it
  window.dismissGate = dismissGate;
})();
