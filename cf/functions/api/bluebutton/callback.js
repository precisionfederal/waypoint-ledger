/* GET /api/bluebutton/callback — CMS sends the person back here.

   Registered with CMS as, exactly:
     https://waypoint-ledger.pages.dev/api/bluebutton/callback

   Everything that can go wrong here ends the same way: the person lands back on
   the ledger with a short reason code in the URL (`why`: expired,
   state-mismatch, unreachable, refused) and no half-finished state. The page
   maps the code to its own sentence (components/ImportClaims.tsx whyText), so
   the address bar never writes on the page (security S-16). When CMS itself
   refused, its own error and error_description travel in an HttpOnly cookie,
   never the URL, and only if CMS really sent them: in the token response, or on
   a redirect whose `state` matches the one this browser started with. A failed
   connection must never look like a lost ledger. */
import {
  isConfigured, NOT_CONFIGURED, redirectUri, exchangeCode, refusalOf,
  PKCE_COOKIE, TOKEN_COOKIE, REFUSAL_COOKIE, REFUSAL_SECONDS, cookieOf, setCookie, killCookie,
} from './_bb.js';

const LANDING = '/ledger';

function back(request, params, cookies = []) {
  const url = new URL(LANDING, request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = new Headers({ location: url.toString(), 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

const refusalCookie = (request, refusal) =>
  setCookie(request, REFUSAL_COOKIE, JSON.stringify({ e: refusal.code, d: refusal.cmsSaid }), REFUSAL_SECONDS);

export async function onRequestGet({ request, env }) {
  const clearPkce = killCookie(PKCE_COOKIE);
  if (!isConfigured(env)) return back(request, { medicare: 'unavailable', why: NOT_CONFIGURED }, [clearPkce]);

  const q = new URL(request.url).searchParams;
  const state = q.get('state');
  let saved = null;
  try { saved = JSON.parse(cookieOf(request, PKCE_COOKIE) || 'null'); } catch { saved = null; }
  const ours = Boolean(saved && typeof saved.state === 'string' && typeof saved.verifier === 'string');
  // Constant-time is unnecessary here: both values are ours and single-use, and
  // a mismatch is a CSRF attempt, not a guessing game.
  const stateMatches = ours && typeof state === 'string' && saved.state === state;

  const error = q.get('error');
  if (error) {
    // The person said no at CMS. That is a normal, complete answer, not an error.
    if (error === 'access_denied') return back(request, { medicare: 'cancelled' }, [clearPkce]);
    // Any other error is CMS refusing. Its words are shown only when the round
    // trip provably started here; otherwise this is a link someone else built.
    if (!stateMatches) return back(request, { medicare: 'failed', why: ours ? 'state-mismatch' : 'expired' }, [clearPkce]);
    const refusal = refusalOf(error, q.get('error_description'));
    return back(request, { medicare: 'failed', why: 'refused' }, refusal ? [clearPkce, refusalCookie(request, refusal)] : [clearPkce]);
  }

  const code = q.get('code');
  if (!code || !state || !ours) return back(request, { medicare: 'failed', why: 'expired' }, [clearPkce]);
  if (!stateMatches) return back(request, { medicare: 'failed', why: 'state-mismatch' }, [clearPkce]);

  const out = await exchangeCode(env, { code, verifier: saved.verifier, redirect: redirectUri(request) });
  if (out.why) {
    return back(request, { medicare: 'failed', why: out.why }, out.refusal ? [clearPkce, refusalCookie(request, out.refusal)] : [clearPkce]);
  }

  return back(request, { medicare: 'connected' }, [
    clearPkce,
    killCookie(REFUSAL_COOKIE),
    setCookie(request, TOKEN_COOKIE, out.token, out.expiresIn),
  ]);
}
