/* GET /api/bluebutton/start — send the person to CMS to sign in.

   Nothing about the person exists yet at this point. The only state created is
   a ten-minute, HttpOnly cookie holding the CSRF `state` and the PKCE verifier,
   both random, both meaningless to anyone who steals them without also holding
   the authorization code. */
import { bad } from '../_http.js';
import {
  SANDBOX, isConfigured, NOT_CONFIGURED, redirectUri,
  PKCE_COOKIE, setCookie, randomB64Url, challengeFor,
} from './_bb.js';

export async function onRequestGet({ request, env }) {
  if (!isConfigured(env)) return bad(NOT_CONFIGURED, 503);

  const state = randomB64Url(16);
  const verifier = randomB64Url(48);
  const challenge = await challengeFor(verifier);

  const url = new URL(SANDBOX.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.BB_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri(request));
  url.searchParams.set('scope', SANDBOX.scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return new Response(null, {
    status: 302,
    headers: {
      location: url.toString(),
      'set-cookie': setCookie(request, PKCE_COOKIE, JSON.stringify({ state, verifier }), 600),
      'cache-control': 'no-store',
    },
  });
}
