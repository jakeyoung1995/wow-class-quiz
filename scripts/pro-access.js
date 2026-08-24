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

    // A licence key handed over in the URL, so the receipt can carry a link
    // that unlocks in one click instead of asking someone to copy a 35
    // character string into a box they have to find first.
    var urlKey = params.get('key');
    if (urlKey && looksLikeKey(urlKey)) {
      unlockWithKey(urlKey).then(function (result) {
        params.delete('key');
        var q = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (q ? '?' + q : ''));
        if (!result.ok) {
          showGate();
          showError(MESSAGES[result.reason] || MESSAGES.invalid);
        }
      });
      return;
    }

    if (hasStoredAccess()) {
      dismissGate();
      return;
    }

    showGate();
  }

  // ── Pro chooser ───────────────────────────────────────────────────────
  // Every Pro CTA used to go straight to Gumroad, which is wrong for the
  // people who have already bought: they arrive with a licence key and get
  // shown a checkout. The CTA now asks which of the two they are, and the
  // answer is remembered so it is asked exactly once.

  function accentOf(el) {
    // Pages use different token names for the same idea (--gold on Midnight
    // pages, --cgold on Classic). Read whichever exists so the dialog belongs
    // to the page it opened on.
    var cs = window.getComputedStyle(document.documentElement);
    var v = (cs.getPropertyValue('--gold') || cs.getPropertyValue('--cgold') || '').trim();
    return v || '#d4aa52';
  }

  var chooser = null;

  function closeChooser() {
    if (!chooser) return;
    chooser.remove();
    chooser = null;
    document.removeEventListener('keydown', onChooserKey, true);
    document.body.style.overflow = '';
  }

  function onChooserKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeChooser(); }
  }

  function openChooser(sourceLink) {
    if (chooser) return;
    var accent = accentOf();
    document.body.style.overflow = 'hidden';

    chooser = document.createElement('div');
    chooser.id = 'proChooser';
    chooser.setAttribute('role', 'dialog');
    chooser.setAttribute('aria-modal', 'true');
    chooser.setAttribute('aria-label', 'Get Pro access');
    chooser.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
      'justify-content:center;padding:20px;background:rgba(0,0,0,0.72);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    chooser.innerHTML =
      '<div id="proChooserCard" style="background:#14110a;border:1px solid #2e2a1e;' +
      'border-radius:14px;max-width:400px;width:100%;padding:26px 24px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,0.5);position:relative;">' +
        '<button type="button" data-pc-close aria-label="Close" style="position:absolute;' +
        'top:10px;right:12px;background:none;border:none;color:#7a6f58;font-size:22px;' +
        'line-height:1;cursor:pointer;padding:4px;">&times;</button>' +

        '<h2 style="margin:0 0 6px;font-size:19px;color:#f0e8d8;font-weight:700;">Get Pro</h2>' +
        '<p style="margin:0 0 20px;font-size:13.5px;color:#a89878;line-height:1.5;">' +
        'All four deep-dive quizzes, live tier data, and every future quiz.</p>' +

        '<button type="button" data-pc-buy style="width:100%;background:' + accent + ';' +
        'color:#0a0800;border:none;border-radius:99px;padding:13px 18px;font-size:15px;' +
        'font-weight:700;cursor:pointer;font-family:inherit;">Buy Pro &mdash; $1.99 &rarr;</button>' +

        '<div style="display:flex;align-items:center;gap:10px;margin:16px 0 14px;">' +
          '<span style="flex:1;height:1px;background:#2e2a1e;"></span>' +
          '<span style="font-size:11px;color:#6e6450;letter-spacing:0.08em;">ALREADY BOUGHT?</span>' +
          '<span style="flex:1;height:1px;background:#2e2a1e;"></span>' +
        '</div>' +

        '<label for="proChooserKey" style="display:block;font-size:12.5px;color:#a89878;' +
        'margin-bottom:7px;">Paste your licence key or unlock word</label>' +
        '<input id="proChooserKey" type="text" autocomplete="off" spellcheck="false" ' +
        'placeholder="A1B2C3D4-E5F60718-9ABCDEF0-1234ABCD" style="width:100%;' +
        'background:#0a0800;border:1px solid #2e2a1e;color:#f0e8d8;border-radius:8px;' +
        'padding:11px 13px;font-size:13.5px;font-family:inherit;outline:none;">' +

        '<p id="proChooserErr" role="alert" style="display:none;margin:9px 0 0;' +
        'font-size:12.5px;color:#e07a6a;line-height:1.45;"></p>' +

        '<button type="button" data-pc-unlock style="width:100%;margin-top:11px;' +
        'background:transparent;color:' + accent + ';border:1px solid ' + accent + ';' +
        'border-radius:99px;padding:11px 18px;font-size:14px;font-weight:600;' +
        'cursor:pointer;font-family:inherit;">Unlock</button>' +

        '<p style="margin:15px 0 0;font-size:11.5px;color:#6e6450;line-height:1.5;">' +
        'Your key is in the receipt email from Gumroad. You only need to enter it once ' +
        'on this device.</p>' +
      '</div>';

    document.body.appendChild(chooser);

    var card = chooser.querySelector('#proChooserCard');
    var input = chooser.querySelector('#proChooserKey');
    var err = chooser.querySelector('#proChooserErr');
    var unlockBtn = chooser.querySelector('[data-pc-unlock]');

    function fail(msg) {
      err.textContent = msg;
      err.style.display = 'block';
      input.focus();
    }

    function submit() {
      var raw = (input.value || '').trim();
      if (!raw) { fail('Enter your licence key or unlock word.'); return; }

      if (looksLikeKey(raw)) {
        unlockBtn.disabled = true;
        unlockBtn.textContent = 'Checking…';
        err.style.display = 'none';
        unlockWithKey(raw).then(function (result) {
          unlockBtn.disabled = false;
          unlockBtn.textContent = 'Unlock';
          if (result.ok) { closeChooser(); afterUnlock(); }
          else fail(MESSAGES[result.reason] || MESSAGES.invalid);
        });
        return;
      }

      if (raw.toUpperCase() === UNLOCK_WORD) {
        track('unlock_success', { page: pageName(), method: 'word' });
        saveAccess();
        closeChooser();
        afterUnlock();
        return;
      }
      fail(MESSAGES.word);
    }

    // Clicking the backdrop closes; clicking the card must not.
    chooser.addEventListener('click', function (e) {
      if (e.target === chooser) closeChooser();
    });
    card.addEventListener('click', function (e) { e.stopPropagation(); });
    chooser.querySelector('[data-pc-close]').addEventListener('click', closeChooser);
    unlockBtn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });

    chooser.querySelector('[data-pc-buy]').addEventListener('click', function () {
      closeChooser();
      // Hand back to the link that was clicked, flagged so the interceptor
      // lets it through to Gumroad's overlay this time.
      if (sourceLink) {
        sourceLink.dataset.pcAllow = '1';
        sourceLink.click();
        delete sourceLink.dataset.pcAllow;
      }
    });

    document.addEventListener('keydown', onChooserKey, true);
    input.focus();
  }

  function afterUnlock() {
    // On a gated page the content is right there, so just reveal it. Elsewhere
    // the person asked for Pro and now has it, so take them to it.
    if (document.getElementById('gateOverlay') || document.getElementById('gateWall')) {
      dismissGate();
      return;
    }
    window.location.href = '/wow-quiz-premium-hub.html';
  }

  function interceptProCtas() {
    document.addEventListener('click', function (ev) {
      var link = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!link || link.href.indexOf('gumroad.com') === -1) return;
      if (link.dataset.pcAllow) return;               // second pass, let it buy

      // Inside the gate there is already a key field and a buy button; a
      // dialog on top of that would be a dialog on top of a dialog.
      if (link.closest('#gateOverlay, #gateWall')) return;

      ev.preventDefault();
      ev.stopPropagation();

      if (hasStoredAccess()) {
        // They already own it. Selling again is the wrong answer.
        window.location.href = '/wow-quiz-premium-hub.html';
        return;
      }
      openChooser(link);
    }, true);
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
  interceptProCtas();

  window.ProAccess = {
    hasAccess: hasStoredAccess,
    grant: saveAccess,
    dismiss: dismissGate,
    unlockWithWord: unlockWithWord,
    unlockWithKey: unlockWithKey,
    verifyKey: verifyKey,
    looksLikeKey: looksLikeKey,
    restore: restoreAccess,
    openChooser: openChooser,
    closeChooser: closeChooser,
    UNLOCK_WORD: UNLOCK_WORD,
    PRODUCT_ID: GUMROAD_PRODUCT_ID
  };

  // Inline onclick handlers in the existing markup call these by name.
  window.unlockWithWord = unlockWithWord;
  window.restoreAccess = restoreAccess;
  window.tryUnlock = unlockWithWord;   // the Classic quiz's name for it
  window.dismissGate = dismissGate;
})();
