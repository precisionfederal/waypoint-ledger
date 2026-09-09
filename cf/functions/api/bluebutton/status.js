/* GET /api/bluebutton/status — can this site talk to Medicare, and is this
   browser connected right now?

   🔴 THIS ROUTE IS THE SWITCH THE WHOLE FEATURE HANGS ON. Until CMS has issued
   sandbox credentials and a real sign-in has round-tripped, `configured` is
   false, and the import component renders nothing at all — no button, no
   heading, not the words. A capability we have not proved does not get to
   appear on the page describing itself. */
import { json } from '../_http.js';
import { isConfigured, cookieOf, TOKEN_COOKIE, SANDBOX } from './_bb.js';

export function onRequestGet({ request, env }) {
  return json({
    ok: true,
    configured: isConfigured(env),
    connected: Boolean(cookieOf(request, TOKEN_COOKIE)),
    environment: 'sandbox',
    issuer: SANDBOX.issuer,
    scopes: SANDBOX.scopes,
    // What this site will and will not do with the connection, in the response
    // itself, so an auditor reading the API sees the same promise the page makes.
    retention: 'none — claims are fetched, mapped in your browser and never stored on this server',
  });
}
