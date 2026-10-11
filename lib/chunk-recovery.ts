/* ==========================================================================
   A tab that stayed open across a deploy.

   Every deploy replaces the hashed files under /_next/static/. A page loaded
   before the deploy still names the old files, so the first chunk it asks for
   afterwards comes back 404 (as text/html), the chunk never runs, and the page
   looks fine while paste and Add do nothing. Found by the smoke on e8f2d3a6f:
   "/" asked for the previous build's 5005-15375d55f7bc6905.js.

   The fix is a reload: the HTML is never cached by the service worker on the
   way in (navigations go to the network first), so a reload fetches the new
   page and its new chunks. The ledger lives in localStorage, so nothing is lost.

   Four signals, because webpack does not raise one error for every case:
   - an 'error' or 'unhandledrejection' whose error is a ChunkLoadError (a lazy
     chunk that a handler awaited);
   - the resource 'error' of a <script> or stylesheet under /_next/static/. A
     chunk named in the HTML that 404s only fires this: webpack then waits on the
     dead tag, and a chunk that fails inside the router is caught by Next and
     only logged, so neither reaches window as a ChunkLoadError;
   - at 'load', a /_next/static/ stylesheet with no rules (a 404 still gets an
     empty sheet; a real one never is). React hoists the page's stylesheets
     above this script, so their errors fire before it runs.

   It reloads once per build. sessionStorage holds the stamp of the build that
   already reloaded; the same build failing again shows one plain line instead,
   so it can never loop. Storage that throws also shows the line. Offline, it
   does nothing: a reload would only trade the page for the offline notice.
   ========================================================================== */

export const CHUNK_RELOAD_KEY = 'wl-chunk-reload';

/** The matcher, as the source the inline script carries. Tests build the
 *  function from this same string, so what is tested is what ships. */
export const CHUNK_MATCHER_SRC =
  "function(e){if(!e)return false;if(e.name==='ChunkLoadError')return true;var m=e.message;return typeof m==='string'&&/Loading (CSS )?chunk \\d+ failed/.test(m)}";

export const STALE_LINE = 'This page was updated. Reload to continue.';

/** The inline script for the root layout's <head>. Plain ES5: it runs before
 *  any chunk, in every browser the site supports. */
export function chunkRecoveryScript(stamp: string): string {
  const v = String(stamp).replace(/[^a-z0-9-]/gi, '').slice(0, 64);
  return `(function(){var K='${CHUNK_RELOAD_KEY}',V='${v}',done=0,shown=0,M=${CHUNK_MATCHER_SRC};`
    + `function bar(){if(shown)return;shown=done=1;function put(){var d=document.createElement('div');d.setAttribute('role','alert');d.setAttribute('data-stale','');`
    + `d.style.cssText='position:fixed;left:0;right:0;top:0;z-index:2147483647;padding:10px 16px;text-align:center;font-size:16px;line-height:1.4;background:var(--surface,#fff);color:var(--ink,#111c27);border-bottom:1px solid var(--line,#e1e5ea)';`
    + `d.appendChild(document.createTextNode('This page was updated. '));var b=document.createElement('button');b.type='button';b.textContent='Reload';`
    + `b.style.cssText='font:inherit;color:var(--accent-ink,#0a6c65);background:none;border:0;padding:0;text-decoration:underline;cursor:pointer';`
    + `b.onclick=function(){location.reload()};d.appendChild(b);d.appendChild(document.createTextNode(' to continue.'));document.body.appendChild(d)}`
    + `if(document.body)put();else document.addEventListener('DOMContentLoaded',put)}`
    + `function go(){if(done||navigator.onLine===false)return;var s;try{s=sessionStorage.getItem(K)}catch(x){return bar()}if(s===V)return bar();`
    + `try{sessionStorage.setItem(K,V)}catch(x){return bar()}done=1;location.reload()}`
    + `addEventListener('error',function(e){var t=e.target;if(t&&t.tagName){var u=t.tagName==='SCRIPT'?t.src:t.tagName==='LINK'&&/stylesheet/i.test(t.rel)?t.href:'';if(u&&u.indexOf('/_next/static/')>-1)go();return}`
    + `if(M(e.error||{message:e.message}))go()},true);`
    + `addEventListener('unhandledrejection',function(e){if(M(e.reason))go()});`
    + `addEventListener('load',function(){var l=document.querySelectorAll('link[rel=stylesheet][href*="/_next/static/"]');for(var i=0;i<l.length;i++){var n=1;try{n=l[i].sheet.cssRules.length}catch(x){n=l[i].sheet?1:0}if(!n)return go()}})})()`;
}
