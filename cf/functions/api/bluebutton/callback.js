/* GET /api/bluebutton/callback — CMS sends the person back here.

   Registered with CMS as, exactly:
     https://waypoint-ledger.pages.dev/api/bluebutton/callback

   Everything that can go wrong here ends the same way: the person lands back on
   the ledger with a plain sentence in the URL and no half-finished state. A
   failed connection must never look like a lost ledger. */
import {
  isConfigured, NOT_CONFIGURED, redirectUri, exchangeCode,
  PKCE_COOKIE, TOKEN_COOKIE, cookieOf, setCookie, killCookie,
} from './_bb.js';

const LANDING = '/ledger';

function back(request, params, cookies = []) {
  const url = new URL(LANDING, request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = new Headers({ location: url.toString(), 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  const clearPkce = killCookie(PKCE_COOKIE);
  if (!isConfigured(env)) return back(request, { medicare: 'unavailable', why: NOT_CONFIGURED }, [clearPkce]);

  const q = new URL(request.url).searchParams;

  // The person said no at CMS. That is a normal, complete answer, not an error.
  if (q.get('error')) {
    return back(request, { medicare: 'cancelled' }, [clearPkce]);
  }

  const code = q.get('code');
  const state = q.get('state');
  let saved = null;
  try { saved = JSON.parse(cookieOf(request, PKCE_COOKIE) || 'null'); } catch { saved = null; }

  if (!code || !state || !saved || typeof saved.state !== 'string' || typeof saved.verifier !== 'string') {
    return back(request, { medicare: 'failed', why: 'That sign-in link had expired. Please start again.' }, [clearPkce]);
  }
  // Constant-time is unnecessary here: both values are ours and single-use, and
  // a mismatch is a CSRF attempt, not a guessing game.
  if (saved.state !== state) {
    return back(request, { medicare: 'failed', why: 'That sign-in did not start on this site. Please start again.' }, [clearPkce]);
  }

  const out = await exchangeCode(env, { code, verifier: saved.verifier, redirect: redirectUri(request) });
  if (out.error) return back(request, { medicare: 'failed', why: out.error }, [clearPkce]);

  return back(request, { medicare: 'connected' }, [
    clearPkce,
    setCookie(request, TOKEN_COOKIE, out.token, out.expiresIn),
  ]);
}
