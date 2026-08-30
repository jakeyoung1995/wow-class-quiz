/**
 * support.js — "Need help?" in the footer of every page
 *
 * Posts to the same Apps Script endpoint the feedback widget already uses, so
 * there is no new infrastructure and nothing new to keep running.
 *
 * The payload sends `type: 'support'` AND the legacy feedback fields. The
 * deployed script routes anything that is not subscribe/unsubscribe to
 * handleFeedback, so this records correctly today; if handleSupport is later
 * deployed it takes over cleanly. Neither version loses a message.
 *
 * The point of a form rather than a bare mailto is context. Most support
 * messages are some variant of "it didn't work", and the answer depends on
 * which page, which browser, and whether the person actually has access —
 * facts they should not have to know to ask for help. Those are attached
 * automatically.
 *
 * What is deliberately NOT collected: the licence key itself (only whether one
 * exists), and anything the visitor did not type or that is not needed to
 * reproduce a problem.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwQS_lKQgT6yujyXOe29wgYl0bzmzpindk-_oN_OnPrlR6us4BZvkOEy4-dMClP4AnM6A/exec';
  var SUPPORT_EMAIL = 'support@wowclassquiz.com';

  var modal = null;

  function accent() {
    var cs = window.getComputedStyle(document.documentElement);
    return (cs.getPropertyValue('--gold') || cs.getPropertyValue('--cgold') || '').trim() || '#d4aa52';
  }

  function diagnostics() {
    var access = 'unknown';
    try {
      var raw = JSON.parse(localStorage.getItem('wowquiz_premium_v1') || '{}');
      if (raw.unlocked && raw.expiry > Date.now()) {
        access = raw.key ? 'pro (licence key)' : 'pro (unlock word)';
      } else {
        access = 'free';
      }
    } catch (e) { /* private browsing */ }

    return {
      page: window.location.pathname + window.location.search,
      access: access,
      screen: window.innerWidth + 'x' + window.innerHeight,
      ua: navigator.userAgent.slice(0, 180)
    };
  }

  function close() {
    if (!modal) return;
    modal.remove();
    modal = null;
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = '';
  }

  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

  function open() {
    if (modal) return;
    var a = accent();
    var d = diagnostics();
    document.body.style.overflow = 'hidden';

    modal = document.createElement('div');
    modal.id = 'supportModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Get help');
    modal.style.cssText =
      'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;' +
      'justify-content:center;padding:20px;background:rgba(0,0,0,0.72);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    modal.innerHTML =
      '<div id="supportCard" style="background:#14110a;border:1px solid #2e2a1e;' +
      'border-radius:14px;max-width:440px;width:100%;padding:26px 24px;position:relative;' +
      'box-shadow:0 20px 60px rgba(0,0,0,0.5);max-height:90vh;overflow-y:auto;">' +
        '<button type="button" data-sup-close aria-label="Close" style="position:absolute;' +
        'top:10px;right:12px;background:none;border:none;color:#7a6f58;font-size:22px;' +
        'line-height:1;cursor:pointer;padding:4px;">&times;</button>' +

        '<h2 style="margin:0 0 6px;font-size:19px;color:#f0e8d8;font-weight:700;">Something not working?</h2>' +
        '<p style="margin:0 0 18px;font-size:13.5px;color:#a89878;line-height:1.5;">' +
        'Tell me what happened and I\'ll look into it. I read every one.</p>' +

        '<label for="supEmail" style="display:block;font-size:12.5px;color:#a89878;margin-bottom:6px;">' +
        'Your email <span style="color:#6e6450;">(so I can reply)</span></label>' +
        '<input id="supEmail" type="email" autocomplete="email" placeholder="you@example.com" ' +
        'style="width:100%;background:#0a0800;border:1px solid #2e2a1e;color:#f0e8d8;' +
        'border-radius:8px;padding:11px 13px;font-size:13.5px;font-family:inherit;outline:none;">' +

        '<label for="supMsg" style="display:block;font-size:12.5px;color:#a89878;margin:14px 0 6px;">' +
        'What went wrong?</label>' +
        '<textarea id="supMsg" rows="4" placeholder="I bought Pro but the quiz is still locked…" ' +
        'style="width:100%;background:#0a0800;border:1px solid #2e2a1e;color:#f0e8d8;' +
        'border-radius:8px;padding:11px 13px;font-size:13.5px;font-family:inherit;' +
        'outline:none;resize:vertical;"></textarea>' +

        '<p id="supErr" role="alert" style="display:none;margin:9px 0 0;font-size:12.5px;color:#e07a6a;"></p>' +

        '<button type="button" data-sup-send style="width:100%;margin-top:14px;background:' + a + ';' +
        'color:#0a0800;border:none;border-radius:99px;padding:12px 18px;font-size:15px;' +
        'font-weight:700;cursor:pointer;font-family:inherit;">Send</button>' +

        '<p id="supOk" style="display:none;margin:14px 0 0;font-size:13px;color:' + a + ';' +
        'line-height:1.5;">Thanks — that\'s come through. I\'ll reply to the address you gave.</p>' +

        '<details style="margin-top:16px;">' +
          '<summary style="font-size:11.5px;color:#6e6450;cursor:pointer;">What gets sent with this</summary>' +
          '<p style="margin:8px 0 0;font-size:11.5px;color:#6e6450;line-height:1.6;">' +
          'Your message and email, plus the page you were on (<code>' + d.page + '</code>), ' +
          'whether you have Pro (<code>' + d.access + '</code>), your window size and browser ' +
          'version. Your licence key is never sent.</p>' +
        '</details>' +

        '<p style="margin:14px 0 0;font-size:11.5px;color:#6e6450;">' +
        'Prefer email? <a href="mailto:' + SUPPORT_EMAIL + '" style="color:' + a + ';">' + SUPPORT_EMAIL + '</a></p>' +
      '</div>';

    document.body.appendChild(modal);

    var card = modal.querySelector('#supportCard');
    var email = modal.querySelector('#supEmail');
    var msg = modal.querySelector('#supMsg');
    var err = modal.querySelector('#supErr');
    var ok = modal.querySelector('#supOk');
    var send = modal.querySelector('[data-sup-send]');

    function fail(t) { err.textContent = t; err.style.display = 'block'; }

    send.addEventListener('click', function () {
      var e = (email.value || '').trim();
      var m = (msg.value || '').trim();
      err.style.display = 'none';
      if (!m) { fail('Tell me what happened first.'); msg.focus(); return; }
      if (!e || e.indexOf('@') === -1) { fail('I need an email address to reply to.'); email.focus(); return; }

      send.disabled = true;
      send.textContent = 'Sending…';

      var d = diagnostics();
      var context = 'page=' + d.page + ' | access=' + d.access +
                    ' | screen=' + d.screen + ' | ua=' + d.ua;

      // no-cors: Apps Script does not send CORS headers, so the response is
      // opaque. Success cannot be read, which is why the address below is shown
      // as a fallback rather than assumed unnecessary.
      // A no-cors response is opaque, so an HTTP error is invisible — but a
      // genuine network failure still rejects the promise, and that is worth
      // catching. This was previously a synchronous try/catch, which cannot
      // catch an async rejection, so success was reported even when the request
      // never left the browser.
      fetch(ENDPOINT, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            type: 'support',
            email: e,
            message: m,
            context: context,
            // Legacy shape, so the currently deployed handleFeedback records it
            // correctly without needing a redeploy first.
            quizType: 'support',
            topClass: d.page,
            rating: '',
            recommend: e,
            comment: m + '  ||  ' + context,
            ts: new Date().toISOString()
          })
      }).then(function () {
        if (typeof window.wowTrack === 'function') {
          window.wowTrack('support_request', { page: d.page, access: d.access });
        }
        send.style.display = 'none';
        email.disabled = true;
        msg.disabled = true;
        ok.style.display = 'block';
        window.setTimeout(close, 3600);
      }).catch(function () {
        // Keep what they wrote on screen rather than discarding it on a retry.
        send.disabled = false;
        send.textContent = 'Try again';
        fail('That did not send — you may be offline. Your message is still here, ' +
             'so try again in a moment.');
      });
    });

    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    card.addEventListener('click', function (e) { e.stopPropagation(); });
    modal.querySelector('[data-sup-close]').addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    msg.focus();
  }

  function addLink() {
    if (document.getElementById('supportLink')) return;
    var footer = document.querySelector('.site-footer');
    if (!footer) return;
    var p = document.createElement('p');
    p.id = 'supportLink';
    p.style.cssText = 'margin:10px 0 0;font-size:12px;opacity:0.6;';
    var a = document.createElement('a');
    a.href = '#';
    a.textContent = 'Need help?';
    a.style.cssText = 'color:inherit;text-decoration:underline;cursor:pointer;';
    a.addEventListener('click', function (ev) { ev.preventDefault(); open(); });
    p.appendChild(a);
    footer.appendChild(p);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addLink);
  } else {
    addLink();
  }

  window.WowSupport = { open: open, close: close };
})();
