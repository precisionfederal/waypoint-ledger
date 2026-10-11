/* Waypoint Ledger: a "Price your diagnostic journey" button for a clinic, a
   patient organization or an agency website.

     <script src="https://waypointledger.org/embed.js" async></script>

   Put the line where the button should appear. It draws one link, inside its
   own shadow root so the host page's styles cannot bend it, and the link opens
   Waypoint Ledger in a new tab. It sets no cookie, reads nothing from the host
   page, stores nothing and sends nothing: the only request it causes is this
   file. Public domain (CC0 1.0), like the rest of our own work on the site.

   Optional: data-label="..." changes the words on the button. */
(function () {
  'use strict';
  var me = document.currentScript;
  if (!me || !me.parentNode) return;
  var origin;
  try { origin = new URL(me.src).origin; } catch (e) { origin = 'https://waypointledger.org'; }
  var words = (me.getAttribute('data-label') || '').trim().slice(0, 60) || 'Price your diagnostic journey';

  var host = document.createElement('span');
  host.setAttribute('data-waypoint-ledger', '');
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  var css = document.createElement('style');
  css.textContent =
    'a{display:inline-flex;align-items:center;gap:.5em;min-height:44px;box-sizing:border-box;padding:12px 20px;'
    + 'border-radius:999px;background:#0e2a3a;color:#fff;font:600 16px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;'
    + 'text-decoration:none;border:2px solid #0e2a3a}'
    + 'a:hover{background:#163d54}'
    + 'a:focus-visible{outline:3px solid #1d6a8f;outline-offset:3px}';
  root.appendChild(css);

  var a = document.createElement('a');
  a.href = origin + '/';
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = words;
  var sr = document.createElement('span');
  sr.textContent = ' (opens Waypoint Ledger in a new tab)';
  sr.setAttribute('style', 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap');
  a.appendChild(sr);
  root.appendChild(a);

  me.parentNode.insertBefore(host, me.nextSibling);
})();
