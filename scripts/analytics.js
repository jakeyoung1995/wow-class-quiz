/**
 * analytics.js — funnel instrumentation
 * -------------------------------------
 * The site had four lifetime buyers, nineteen links to checkout, and no way to
 * tell how many people ever clicked one. Only `quiz_complete` was firing, so
 * every step between arriving and paying was invisible.
 *
 * Events emitted:
 *
 *   quiz_start          {quiz_type}                  paired with quiz_complete
 *   premium_cta_click   {from_page, cta_text, ...}   any link to checkout
 *   paywall_view        {page}                       a gated page stayed gated
 *   unlock_success      {page, method}               'url' or 'word'
 *
 * quiz_type values match the ones quiz_complete already sends, so start and
 * complete pair up into a real completion rate instead of two unrelated counts.
 *
 * Checkout links are caught by delegation rather than by editing nineteen
 * anchors: it cannot drift, and any link added later is covered for free.
 *
 * Load with `defer` after the GA4 snippet. Safe to load anywhere — every hook
 * is optional and no-ops when its element is absent.
 */
(function () {
  'use strict';

  function track(name, params) {
    // gtag may be blocked, still loading, or absent on local dev. Tracking must
    // never be able to break a page, so every call is guarded and swallowed.
    try {
      if (typeof gtag === 'function') {
        gtag('event', name, params || {});
      }
    } catch (e) { /* analytics must never throw */ }
  }

  function pageId() {
    var file = (window.location.pathname.split('/').pop() || 'index.html');
    return file.replace(/\.html$/, '') || 'index';
  }

  // ── Checkout intent ────────────────────────────────────────────────────
  // Capture phase, so the event is recorded even if another handler stops
  // propagation. Never calls preventDefault — navigation is untouched.
  document.addEventListener('click', function (ev) {
    var link = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!link) return;
    if (link.href.indexOf('gumroad.com') === -1) return;

    track('premium_cta_click', {
      from_page: pageId(),
      cta_text: (link.textContent || '').trim().slice(0, 60),
      // Distinguishes "clicked the paywall button" from "clicked a nav link",
      // which is the difference between a blocked buyer and a browser.
      in_paywall: !!link.closest('#gateOverlay, #gateWall')
    });
  }, true);

  // ── Paywall ───────────────────────────────────────────────────────────
  // Fires only when the gate is actually blocking. The gate code removes the
  // overlay for buyers, so a deferred check after load reflects what the
  // visitor really saw rather than the markup's initial state.
  function isVisible(el) {
    if (!el) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') {
      return false;
    }
    // getClientRects, not offsetParent: offsetParent is null for any
    // position:fixed element, which the gate overlay is. Using it here reported
    // zero paywall views on a fully visible gate.
    return el.getClientRects().length > 0;
  }

  function checkPaywall() {
    var blocked = isVisible(document.getElementById('gateOverlay')) ||
                  isVisible(document.getElementById('gateWall'));
    if (blocked) track('paywall_view', { page: pageId() });
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(function () { window.setTimeout(checkPaywall, 600); });

  // ── Public helper ─────────────────────────────────────────────────────
  // Pages call this for events only they can know about — starting a quiz,
  // unlocking successfully.
  window.wowTrack = track;
})();
