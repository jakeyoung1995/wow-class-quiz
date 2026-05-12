/**
 * affiliate-tools.js
 * ------------------
 * Renders a "Tools I recommend for [class]" card on results pages.
 * Pulls from a central catalog. Some links are affiliate-tagged.
 *
 * Usage:
 *   <div id="toolsSection"></div>
 *   <script src="/scripts/affiliate-tools.js"></script>
 *   <script> renderAffiliateTools('toolsSection', { role: 'dps', topClass: 'Mage' }); </script>
 *
 * To update affiliate tags later, edit AFFILIATE_TAGS below. The renderer
 * substitutes ${AMZ_TAG} into Amazon URLs at render time.
 */
(function () {
  'use strict';

  // ─── Affiliate tags ─────────────────────────────────────
  // Replace these with your real IDs once Amazon Associates / Raider.IO approvals come back.
  const AFFILIATE_TAGS = {
    AMZ_TAG: 'wowclassquiz-20',        // Amazon Associates tracking ID — replace once approved
    RAIDERIO_REF: '',                  // e.g. '?ref=wowclassquiz' if Raider.IO provides one
    WOWHEAD_REF: '',                   // Wowhead premium referral path if available
  };

  // ─── Tools catalog ──────────────────────────────────────
  // Order in each role array roughly = relevance. The renderer picks the top N.
  const TOOLS = {
    // Universal tools shown across all roles
    universal: [
      {
        name: 'Raider.IO Premium',
        desc: 'Better M+ planning, alt tracking, and ungated runs view. The community standard for serious M+ pushers.',
        url: 'https://raider.io/premium',
        icon: '📈',
        type: 'service',
      },
      {
        name: 'Wowhead',
        desc: 'The encyclopedia. Guides, leveling routes, talent calculators — irreplaceable for any class.',
        url: 'https://www.wowhead.com/',
        icon: '📚',
        type: 'reference',
      },
      {
        name: 'Icy Veins',
        desc: 'Class-specific written guides — rotations, talent builds, tier rankings, weekly hotfix coverage.',
        url: 'https://www.icy-veins.com/wow/',
        icon: '🧊',
        type: 'reference',
      },
      {
        name: 'Method / Maxroll',
        desc: 'Video and written guides from top-200 mythic raiders. Maxroll has the cleanest spec guides.',
        url: 'https://maxroll.gg/wow',
        icon: '🎯',
        type: 'reference',
      },
      {
        name: 'Logitech G Pro Wireless mouse',
        desc: 'Most-used mouse in pro WoW M+. Light, low-latency, programmable side buttons for keybinds.',
        url: 'https://www.amazon.com/dp/B07GBZ4Q68?tag=${AMZ_TAG}',
        icon: '🖱️',
        type: 'hardware',
      },
      {
        name: 'Razer Naga V2 Pro (12-button)',
        desc: 'If you bind half your rotation to the mouse, the Naga\'s side panel is unmatched. WoW staple for 15+ years.',
        url: 'https://www.amazon.com/dp/B0B97MFLNJ?tag=${AMZ_TAG}',
        icon: '🐍',
        type: 'hardware',
      },
      {
        name: 'Glorious Model O- (budget pick)',
        desc: 'Lightweight ($50) gaming mouse if you don\'t need 12 side buttons. Excellent for ranged casters.',
        url: 'https://www.amazon.com/dp/B07X3DCN85?tag=${AMZ_TAG}',
        icon: '⚪',
        type: 'hardware',
      },
    ],

    // Role-specific extras
    dps: [
      {
        name: 'Details! Damage Meter',
        desc: 'In-game damage meter. Free Curseforge/Wago addon — non-negotiable for any DPS.',
        url: 'https://www.curseforge.com/wow/addons/details',
        icon: '📊',
        type: 'addon',
      },
    ],
    tank: [
      {
        name: 'BigWigs Bossmods',
        desc: 'Boss timers and warnings. Non-negotiable for tank-call coordination in mythic raid.',
        url: 'https://www.curseforge.com/wow/addons/big-wigs',
        icon: '⏱️',
        type: 'addon',
      },
      {
        name: 'MRT (Method Raid Tools)',
        desc: 'Raid-wide cooldown and tank-swap planner. Standard for any progression raid team.',
        url: 'https://www.curseforge.com/wow/addons/method-raid-tools',
        icon: '🛡️',
        type: 'addon',
      },
    ],
    healer: [
      {
        name: 'VuhDo / Cell',
        desc: 'Replacement raid frames built for healers. Click-to-cast, debuff highlighting, cleaner than default.',
        url: 'https://www.curseforge.com/wow/addons/vuhdo',
        icon: '💚',
        type: 'addon',
      },
      {
        name: 'OmniCD',
        desc: 'Tracks your group\'s defensive cooldowns. Lets you stop pre-shielding when the prot pally is about to bubble.',
        url: 'https://www.curseforge.com/wow/addons/omnicd',
        icon: '🎴',
        type: 'addon',
      },
    ],
  };

  // ─── Class-specific picks ──────────────────────────────
  // Optional: nudge specific tools forward for a top class. Add more as you find them.
  const CLASS_BIASED = {
    'Warlock':       ['Curseforge → "WeakAuras" search'],
    'Mage':          ['Curseforge → "WeakAuras" search'],
    'Rogue':         ['Curseforge → "WeakAuras" search'],
    'Death Knight':  ['Curseforge → "WeakAuras" search'],
  };

  function applyAffiliateTags(url) {
    return url.replace(/\$\{AMZ_TAG\}/g, AFFILIATE_TAGS.AMZ_TAG);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function pickTools(role, topClass) {
    const out = [];
    // 1) role-specific addon picks first
    (TOOLS[role] || []).forEach(t => out.push(t));
    // 2) reference + service universals (cap to 3 of these)
    const refs = TOOLS.universal.filter(t => t.type === 'service' || t.type === 'reference');
    refs.slice(0, 3).forEach(t => out.push(t));
    // 3) one hardware pick
    const hw = TOOLS.universal.filter(t => t.type === 'hardware');
    if (hw[0]) out.push(hw[0]);
    return out.slice(0, 6);
  }

  function renderAffiliateTools(containerId, opts) {
    const el = document.getElementById(containerId);
    if (!el) return;
    opts = opts || {};
    const role = opts.role || 'dps';
    const topClass = opts.topClass || '';
    const items = pickTools(role, topClass);
    const headline = topClass
      ? `Tools I recommend for ${escapeHtml(topClass)}`
      : `Tools I recommend`;
    const html = `
      <div class="tools-card">
        <div class="tools-eyebrow">⚒ Recommended tools</div>
        <h3>${headline}</h3>
        <p class="tools-sub">Free addons + a few products I trust — picked for the role you matched on, not random affiliate spam.</p>
        <div class="tools-list">
          ${items.map(t => `
            <a class="tool-item" href="${escapeHtml(applyAffiliateTags(t.url))}" target="_blank" rel="noopener sponsored">
              <div class="tool-icon">${t.icon || '🔗'}</div>
              <div class="tool-body">
                <div class="tool-name">${escapeHtml(t.name)}</div>
                <div class="tool-desc">${escapeHtml(t.desc)}</div>
              </div>
            </a>
          `).join('')}
        </div>
        <div class="tools-disclaimer">Some links are affiliate links — I may earn a small commission at no extra cost to you. Helps keep this site free.</div>
      </div>
    `;
    el.innerHTML = html;
  }

  window.renderAffiliateTools = renderAffiliateTools;
  window.__AFFILIATE_TAGS__ = AFFILIATE_TAGS;
})();
