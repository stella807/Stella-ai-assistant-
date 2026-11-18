/**
 * The chat box a business pastes onto its own website: one script tag, no dependencies. It draws inside a shadow
 * root so the host page's styles cannot break it, and it writes visitors' and answers' text with textContent, never
 * as markup, so nothing typed by anyone can run as script.
 *
 *   <script src="https://safehubby.com/widget.js" data-business="biz_..." async></script>
 */
export const WIDGET_JS = `(function () {
  var tag = document.currentScript || document.querySelector('script[data-business]');
  if (!tag) return;
  var id = tag.getAttribute('data-business');
  if (!id || window.__shAssistant === id) return;
  window.__shAssistant = id;
  var base = new URL(tag.src).origin;
  var api = base + '/api/widget/' + encodeURIComponent(id);
  fetch(api + '/config').then(function (r) { return r.ok ? r.json() : null; }).then(function (cfg) {
    if (!cfg) return;
    var host = document.createElement('div');
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;';
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' +
      '*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      'button{cursor:pointer;font:inherit}' +
      '.fab{background:#1f2a44;color:#fff;border:0;border-radius:999px;padding:12px 18px;font-size:15px;box-shadow:0 4px 16px rgba(0,0,0,.25)}' +
      '.panel{display:none;width:min(360px,calc(100vw - 32px));height:min(480px,calc(100vh - 96px));background:#fff;color:#1b1b1b;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.3);flex-direction:column;overflow:hidden;margin-bottom:10px}' +
      '.panel.open{display:flex}' +
      '.head{background:#1f2a44;color:#fff;padding:12px 14px;font-weight:600;display:flex;justify-content:space-between;align-items:center}' +
      '.head button{background:none;border:0;color:#fff;font-size:20px;line-height:1}' +
      '.log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f6f7fa}' +
      '.m{max-width:85%;padding:8px 11px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}' +
      '.bot{background:#fff;border:1px solid #e1e4ec;align-self:flex-start}' +
      '.me{background:#1f2a44;color:#fff;align-self:flex-end}' +
      '.note{font-size:11px;color:#667;padding:6px 12px;background:#fff;border-top:1px solid #e1e4ec}' +
      'form{display:flex;gap:6px;padding:10px;background:#fff;border-top:1px solid #e1e4ec}' +
      'input{flex:1;padding:9px 10px;border:1px solid #c9cedb;border-radius:8px;font-size:14px}' +
      'form button{background:#1f2a44;color:#fff;border:0;border-radius:8px;padding:0 14px}' +
      '</style>' +
      '<div class="panel" role="dialog" aria-label="Chat"><div class="head"><span class="t"></span><button type="button" class="x" aria-label="Close">\\u00d7</button></div>' +
      '<div class="log" aria-live="polite"></div><div class="note"></div>' +
      '<form><input class="q" maxlength="500" aria-label="Your question" autocomplete="off"><button type="submit">Send</button></form></div>' +
      '<button type="button" class="fab"></button>';
    var $ = function (s) { return root.querySelector(s); };
    var panel = $('.panel'), log = $('.log'), q = $('.q'), fab = $('.fab');
    $('.t').textContent = cfg.name;
    $('.note').textContent = 'AI assistant for ' + cfg.business + '. Messages may be saved by the business.';
    fab.textContent = 'Chat with ' + cfg.name;
    function add(text, who) {
      var d = document.createElement('div'); d.className = 'm ' + who; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
    }
    function toggle(open) { panel.classList.toggle('open', open); fab.style.display = open ? 'none' : ''; if (open) { if (!log.children.length) add(cfg.welcome, 'bot'); q.focus(); } }
    fab.addEventListener('click', function () { toggle(true); });
    $('.x').addEventListener('click', function () { toggle(false); });
    root.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var text = q.value.trim(); if (text.length < 2) return;
      q.value = ''; add(text, 'me');
      var wait = add('\\u2026', 'bot');
      fetch(api + '/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: text }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) { wait.textContent = res.ok ? res.j.answer : (res.j && res.j.error) || 'Sorry, something went wrong.'; log.scrollTop = log.scrollHeight; })
        .catch(function () { wait.textContent = 'Sorry, something went wrong. Please contact the business directly.'; });
    });
    document.body.appendChild(host);
  }).catch(function () {});
})();
`;
