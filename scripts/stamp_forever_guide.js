#!/usr/bin/env node
/**
 * stamp_forever_guide.js — render the per-class sections of the Forever class
 * guide from scripts/forever-data.js into wow-forever-classes.html.
 *
 * The four Forever quizzes read forever-data.js in the browser, which is fine
 * for a quiz result but wrong for a guide page whose whole value is being
 * indexed. Crawlers need the class facts in the HTML. So this writes them
 * there, between sentinel comments, from the same data the quizzes use. One
 * source of truth, static output.
 *
 * Run after editing forever-data.js:
 *     node scripts/stamp_forever_guide.js          # rewrite in place
 *     node scripts/stamp_forever_guide.js --check  # exit 1 if stale
 *
 * Node rather than Python because the data is a JS module. CI does not run
 * this; it is a local step, like editing the data itself.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.dirname(__dirname);
const PAGE = path.join(REPO, 'wow-forever-classes.html');

global.window = {};
require(path.join(REPO, 'scripts', 'forever-data.js'));
const F = global.window.FOREVER;
const e = F.escapeHtml;

function raceTags(list) {
  if (!list.length) return '<span class="race-note">Not available on this faction</span>';
  return list.map(r => `<span class="race-tag">${e(r.name)}${r.isNew && !r.paid ? '<span class="new">NEW</span>' : ''}${r.paid ? '<span class="paid">PAID RACE</span>' : ''}</span>`).join('');
}
function roleBadge(r) {
  const cls = /tank/i.test(r) ? 'role-tank' : /heal/i.test(r) ? 'role-heal' : 'role-dps';
  return `<span class="badge ${cls}">${e(r)}</span>`;
}

function classSection(c) {
  const races = F.racesFor(c.key);
  return `
<article class="guide-class" id="${c.key}" style="--class-color:${c.color}">
  <div class="card-accent"></div>
  <header class="gc-head">
    <span class="gc-icon">${c.icon}</span>
    <div>
      <h2>${e(c.name)} in WoW Forever</h2>
      <p class="card-tagline">${e(c.tagline)}</p>
      <div class="card-badges">${c.roles.map(roleBadge).join('')}<span class="badge">${c.specs.length} specs</span></div>
    </div>
  </header>
  <p class="gc-fantasy">${e(c.fantasy)}</p>
  <div class="gc-grid">
    <div class="full">
      <div class="section-title">Races <span class="hint">· NEW = not possible in Classic · Skyborne need a paid pack</span></div>
      <div class="race-grid">
        <div class="race-group"><div class="race-group-label a">Alliance</div>${raceTags(races.alliance)}</div>
        <div class="race-group"><div class="race-group-label h">Horde</div>${raceTags(races.horde)}</div>
      </div>
    </div>
    <div class="full">
      <div class="section-title">Specs</div>
      <div class="block"><div class="spec-list">${c.specs.map(s => `<div class="spec-item"><div class="spec-name">${e(s.name)}<small>${e(s.role)}</small></div><div class="spec-note">${e(s.note)}</div></div>`).join('')}</div></div>
    </div>
    <div class="full">
      <div class="section-title">What changed in Forever</div>
      <div class="block"><ul>${c.whatsNew.map(w => `<li>${e(w)}</li>`).join('')}</ul></div>
    </div>
    <div class="full">
      <div class="section-title">How leveling feels</div>
      <div class="block"><p>${e(c.leveling)}</p><p style="margin-top:6px"><strong style="color:var(--text)">Moves:</strong> ${e(c.mobility)}</p><p style="margin-top:4px"><strong style="color:var(--text)">Brings:</strong> ${e(c.utility)}</p></div>
    </div>
    <div class="full">
      <div class="section-title">Professions Wowhead and Warcraft Tavern recommend</div>
      ${c.professions.forever.map(p => `<div class="prof-item"><div class="prof-pair">${e(p.pair)}</div><div class="prof-why">${e(p.why)}</div></div>`).join('')}
    </div>
    <div class="full pros-cons">
      <div class="pros"><div class="pc-label">Why you'll love it</div>${c.loveIt.map(p => `<div class="pc-item">${e(p)}</div>`).join('')}</div>
      <div class="cons"><div class="pc-label">Know going in</div>${c.knowGoingIn.map(p => `<div class="pc-item">${e(p)}</div>`).join('')}</div>
    </div>
    <div class="full gc-cta">
      <a href="wow-forever-class-quiz.html" class="qc-btn">Is ${e(c.name)} the most fun class for you? Take the quiz →</a>
    </div>
  </div>
</article>`;
}

function raceGrid() {
  const head = F.order.map(k => `<th>${e(F.CLASSES[k].name)}</th>`).join('');
  const rows = Object.keys(F.RACES).map(rk => {
    const r = F.RACES[rk];
    const cells = F.order.map(k => {
      const ok = r.classes.indexOf(k) !== -1;
      const isNew = !!F.NEW_COMBOS[rk + ':' + k];
      return `<td class="${ok ? (isNew ? 'yes new' : 'yes') : 'no'}">${ok ? (isNew ? 'NEW' : '✓') : '·'}</td>`;
    }).join('');
    return `<tr><th scope="row">${e(r.name)}${r.paid ? ' <span class="paid">paid</span>' : ''}<small>${r.faction === 'alliance' ? 'Alliance' : 'Horde'}</small></th>${cells}</tr>`;
  }).join('');
  return `<table class="grid"><thead><tr><th>Race</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function main() {
  const check = process.argv.includes('--check');
  let html = fs.readFileSync(PAGE, 'utf8');
  const blocks = {
    classes: F.order.map(k => classSection(F.CLASSES[k])).join('\n'),
    racegrid: raceGrid(),
    toc: F.order.map(k => { const c = F.CLASSES[k]; return `<a class="class-chip" style="--class-color:${c.color}" href="#${k}"><span class="dot"></span>${e(c.name)}</a>`; }).join('')
  };
  let changed = 0;
  Object.entries(blocks).forEach(([key, body]) => {
    const open = `<!--${key}-->`, close = `<!--/${key}-->`;
    const re = new RegExp(open.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&') + '[\\s\\S]*?' + close.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&'));
    if (!re.test(html)) { console.error(`missing sentinel ${open}`); process.exit(2); }
    const next = html.replace(re, open + body + close);
    if (next !== html) { changed++; html = next; console.log(`${check ? 'STALE ' : 'stamped'} ${key}`); }
  });
  if (check) { console.log(changed ? `\n${changed} block(s) stale. Run: node scripts/stamp_forever_guide.js` : 'guide is current.'); process.exit(changed ? 1 : 0); }
  if (changed) fs.writeFileSync(PAGE, html);
  console.log(`\n${changed} block(s) updated.`);
}
main();
