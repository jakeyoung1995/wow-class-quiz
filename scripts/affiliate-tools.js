/**
 * affiliate-tools.js
 * ------------------
 * Renders a compact "My WoW gear" card on results pages pointing to /gear.html.
 *
 * Previously this rendered a per-class affiliate list. We've simplified to a
 * single curated gear page that gets updated quarterly. One source of truth,
 * one CTA, less maintenance.
 *
 * Usage:
 *   <div id="toolsSection"></div>
 *   <script src="/scripts/affiliate-tools.js"></script>
 *   <script>renderAffiliateTools('toolsSection', { role: 'dps', topClass: 'Mage' });</script>
 */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function renderAffiliateTools(containerId, opts) {
    const el = document.getElementById(containerId);
    if (!el) return;
    opts = opts || {};
    const topClass = opts.topClass || '';
    const role = (opts.role || 'dps').toLowerCase();

    // Role-aware sub-copy — slight variation so it doesn't feel generic
    const roleCopy = {
      dps:    'The mouse, keyboard, audio and monitor I use to push Mythic+ keys.',
      tank:   'The gear I use to pull packs and survive at +18 keys.',
      healer: 'The hardware I use to click-to-cast through chaos and keep raid alive.'
    }[role] || 'The hardware I use to push Mythic+ keys and clear Cutting Edge.';

    const headline = topClass
      ? `Playing ${escapeHtml(topClass)}? Here's my full WoW setup.`
      : `My full WoW gear setup`;

    el.innerHTML = `
      <div class="tools-card gear-card">
        <div class="gear-card-inner">
          <div class="gear-card-icon">📦</div>
          <div class="gear-card-body">
            <div class="tools-eyebrow">⚒ My recommended gear</div>
            <h3>${headline}</h3>
            <p class="tools-sub">${escapeHtml(roleCopy)} Razer Naga, Wooting 80HE, DT 770 Pro, MSI QD-OLED, and more — one curated list, updated quarterly.</p>
            <a class="gear-cta-btn" href="/gear.html" data-gear-cta>See my full setup →</a>
          </div>
        </div>
        <div class="tools-disclaimer">Some links on the gear page are Amazon affiliate links — small commission at no extra cost to you. Helps keep this site free.</div>
      </div>
    `;

    // GA4 event — tracks how many users click through to gear page
    const btn = el.querySelector('[data-gear-cta]');
    if (btn && typeof gtag !== 'undefined') {
      btn.addEventListener('click', function () {
        try { gtag('event', 'gear_cta_click', { from_role: role, top_class: topClass }); } catch (e) {}
      });
    }
  }

  window.renderAffiliateTools = renderAffiliateTools;
})();
