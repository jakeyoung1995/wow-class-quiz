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

  // Gumroad issues one licence key per sale and verifies it without an access
  // token, so this can run in the browser with nothing secret exposed. The
  // product ID is public by necessity — it ships in this file.
  var GUMROAD_PRODUCT_ID = 'wQTS8U9pKrDpVHqFS5gemw==';
  var GUMROAD_VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';

  // Keys look like 6F0E4C97-B72A4E69-A11BF6C4-AF6517E7. Checked before the
  // network call so an obvious typo gets an instant answer instead of a
  // round trip, and so the unlock word never reaches Gumroad.
  var KEY_SHAPE = /^[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}$/i;

  function track(name, params) {
    try {
      if (typeof window.wowTrack === 'function') window.wowTrack(name, params);
    } catch (e) { /* never let analytics break the gate */ }
  }

  function pageName() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  // ── Entitlement ───────────────────────────────────────────────────────
  function saveAccess(licenseKey) {
    try {
      var record = {
        unlocked: true,
        expiry: Date.now() + ACCESS_DAYS * 24 * 60 * 60 * 1000
      };
      // Kept so a customer can be helped without being asked to find their
      // purchase email again, and so access can be re-verified later.
      if (licenseKey) record.key = String(licenseKey).trim();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
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

  function errorEl() {
    return document.getElementById('unlockErr') ||
           document.getElementById('gateError');
  }

  function showError(message) {
    var err = errorEl();
    if (err) {
      if (message) err.textContent = message;
      err.style.display = 'block';
    }
    var input = getInput();
    if (input) input.focus();
  }

  function hideError() {
    var err = errorEl();
    if (err) err.style.display = 'none';
  }

  // ── Unlock paths ──────────────────────────────────────────────────────
  var MESSAGES = {
    invalid:  "That key doesn't match a purchase. Check the licence key in your " +
              "Gumroad receipt email — it looks like XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX.",
    refunded: 'That purchase was refunded, so the key no longer unlocks access.',
    network:  "Couldn't reach Gumroad to check that key. Check your connection and try again.",
    word:     "That doesn't look right — check your Gumroad receipt for the key or unlock word."
  };

  function setBusy(busy) {
    var btn = document.querySelector('[data-unlock-btn]') ||
              document.getElementById('unlockBtn');
    if (btn) {
      btn.disabled = busy;
      if (busy) {
        if (!btn.dataset.label) btn.dataset.label = btn.textContent;
        btn.textContent = 'Checking…';
      } else if (btn.dataset.label) {
        btn.textContent = btn.dataset.label;
      }
    }
    var input = getInput();
    if (input) input.disabled = busy;
  }

  function getInput() {
    return document.getElementById('unlockInput') ||
           document.getElementById('gateInput');
  }

  /**
   * Handles both credentials from one field. A licence key is recognised by
   * shape and verified with Gumroad; anything else is compared to the legacy
   * unlock word, which existing buyers still rely on and which keeps working
   * indefinitely.
   *
   * Returns true/false synchronously for the word path so existing callers and
   * tests behave as before; the key path resolves asynchronously and reports
   * through the UI.
   */
  function unlockWithWord() {
    var input = getInput();
    var raw = ((input && input.value) || '').trim();

    if (looksLikeKey(raw)) {
      setBusy(true);
      hideError();
      unlockWithKey(raw).then(function (result) {
        setBusy(false);
        if (!result.ok) showError(MESSAGES[result.reason] || MESSAGES.invalid);
      });
      return undefined;   // async — outcome arrives via the UI
    }

    if (raw.toUpperCase() === UNLOCK_WORD) {
      track('unlock_success', { page: pageName(), method: 'word' });
      saveAccess();
      dismissGate();
      return true;
    }

    showError(MESSAGES.word);
    return false;
  }

  // ── Licence keys ──────────────────────────────────────────────────────
  function looksLikeKey(value) {
    return KEY_SHAPE.test((value || '').trim());
  }

  /**
   * Verify a licence key with Gumroad. Resolves
   * {ok:true, uses} or {ok:false, reason:'invalid'|'refunded'|'network'}.
   *
   * increment_uses_count is false on purpose. Gumroad counts uses per key, and
   * counting every unlock would make a customer who owns a laptop and a phone
   * look like an abuser within a week.
   */
  function verifyKey(key) {
    var body = new URLSearchParams({
      product_id: GUMROAD_PRODUCT_ID,
      license_key: (key || '').trim(),
      increment_uses_count: 'false'
    });
    return fetch(GUMROAD_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function (res) {
      return res.json().catch(function () { return null; });
    }).then(function (data) {
      if (!data || !data.success) return { ok: false, reason: 'invalid' };
      var purchase = data.purchase || {};
      // A refunded or disputed purchase must not keep working.
      if (purchase.refunded || purchase.chargebacked) {
        return { ok: false, reason: 'refunded' };
      }
      return { ok: true, uses: data.uses };
    }).catch(function () {
      // Offline, blocked, or Gumroad down. Distinct from a bad key: the user
      // should be told to retry, not told their key is wrong.
      return { ok: false, reason: 'network' };
    });
  }

  function unlockWithKey(key) {
    return verifyKey(key).then(function (result) {
      if (result.ok) {
        track('unlock_success', { page: pageName(), method: 'license_key' });
        saveAccess(key);
        dismissGate();
      }
      return result;
    });
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
    unlockWithKey: unlockWithKey,
    verifyKey: verifyKey,
    looksLikeKey: looksLikeKey,
    restore: restoreAccess,
    UNLOCK_WORD: UNLOCK_WORD,
    PRODUCT_ID: GUMROAD_PRODUCT_ID
  };

  // Inline onclick handlers in the existing markup call these by name.
  window.unlockWithWord = unlockWithWord;
  window.restoreAccess = restoreAccess;
  window.tryUnlock = unlockWithWord;   // the Classic quiz's name for it
  window.dismissGate = dismissGate;
})();
