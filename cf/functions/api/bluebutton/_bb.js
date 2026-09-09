/* ==========================================================================
   Blue Button 2.0 — the server half. One definition of the flow.

   WHY THE SERVER HOLDS THE TOKEN. Blue Button issues a confidential-client
   credential, so the exchange has to happen somewhere the client secret is not
   readable, and the access token is a key to a person's whole Medicare claim
   history. So the browser never sees either: the token lives in an HttpOnly,
   Secure, SameSite=Lax cookie scoped to this site, with the lifetime CMS gave
   it, and the only thing that can spend it is this Worker.

   🔴 NOTHING FROM MEDICARE IS EVER WRITTEN DOWN. No D1 row, no KV key, no log
   line, no counter keyed to a person. `/api/bluebutton/claims` fetches, hands
   the bundle to the browser, and forgets it. The mapping to ledger lines
   happens in the browser (lib/bluebutton.ts), and the ledger stays there until
   the person chooses to save it. This is the same promise the rest of the app
   makes, kept on the one surface where breaking it would matter most.

   PKCE (S256) is used even though the client is confidential, because the
   sandbox advertises it (code_challenge_methods_supported: ["S256"]) and it
   closes the authorization-code interception window at no cost.
   ========================================================================== */
import { SANDBOX } from '../../../../lib/bluebutton.ts';

export { SANDBOX };

/** The redirect URI registered with CMS. Derived from the live request so the
 *  same code works on a preview deploy and on `wrangler pages dev`, but the
 *  value REGISTERED at bluebutton.cms.gov must match exactly for production:
 *  https://waypoint-ledger.pages.dev/api/bluebutton/callback */
export const redirectUri = (request) => new URL('/api/bluebutton/callback', request.url).toString();

export const PKCE_COOKIE = 'wl_bb_pkce';
export const TOKEN_COOKIE = 'wl_bb';
/** A ceiling of our own on top of whatever CMS says, so a forgotten tab does
 *  not keep a key to someone's claim history alive for a day. */
export const MAX_TOKEN_SECONDS = 3600;

export const isConfigured = (env) => Boolean(env && env.BB_CLIENT_ID && env.BB_CLIENT_SECRET);

/** The one sentence every route says when the app has no sandbox credentials.
 *  It names the fix rather than blaming the person looking at it. */
export const NOT_CONFIGURED =
  'This site is not connected to the Medicare Blue Button sandbox yet. Nothing is wrong with your account.';

const secure = (request) => (new URL(request.url).protocol === 'https:' ? '; Secure' : '');

export const setCookie = (request, name, value, seconds) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure(request)}`;

export const killCookie = (name) => `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function cookieOf(request, name) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/* -------------------------------------------------------------------------- */
/* PKCE                                                                       */
/* -------------------------------------------------------------------------- */

const b64url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const randomB64Url = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/* -------------------------------------------------------------------------- */
/* Token exchange                                                             */
/* -------------------------------------------------------------------------- */

/** POST the authorization code. Returns { token, expiresIn } or { error }. */
export async function exchangeCode(env, { code, verifier, redirect }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    client_id: env.BB_CLIENT_ID,
    code_verifier: verifier,
  });
  let res;
  try {
    res = await fetch(SANDBOX.tokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        // The OAuth 2.0 default for a confidential client. client_id also rides
        // in the body because django-oauth-toolkit accepts either and some
        // proxies drop Authorization on a redirect.
        authorization: `Basic ${btoa(`${env.BB_CLIENT_ID}:${env.BB_CLIENT_SECRET}`)}`,
        accept: 'application/json',
      },
      body,
    });
  } catch {
    return { error: 'Could not reach the Medicare sandbox to finish signing in.' };
  }
  let data = null;
  try { data = await res.json(); } catch { /* fall through to the status check */ }
  if (!res.ok || !data || typeof data.access_token !== 'string') {
    // CMS's own error_description is safe to show: it describes the app's
    // registration, never the person.
    const detail = data && typeof data.error_description === 'string' ? ` ${data.error_description}` : '';
    return { error: `The Medicare sandbox refused the sign-in.${detail}`.trim() };
  }
  const expires = Number(data.expires_in);
  return {
    token: data.access_token,
    expiresIn: Math.max(60, Math.min(MAX_TOKEN_SECONDS, Number.isFinite(expires) ? expires : MAX_TOKEN_SECONDS)),
  };
}

/** Best-effort revoke. A failure here is not shown to the person: the cookie is
 *  cleared either way, so the browser has no key left regardless. */
export async function revokeToken(env, token) {
  try {
    await fetch(SANDBOX.revokeUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${btoa(`${env.BB_CLIENT_ID}:${env.BB_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({ token, client_id: env.BB_CLIENT_ID }),
    });
    return true;
  } catch { return false; }
}
