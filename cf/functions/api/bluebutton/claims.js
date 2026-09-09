/* GET /api/bluebutton/claims — fetch this person's Medicare claims and return
   only the care lines.

   🔴 WHAT CROSSES BACK TO THE BROWSER, AND WHAT DOES NOT.
   An ExplanationOfBenefit is a rich document: diagnoses, provider names,
   facility addresses, the beneficiary reference, every adjudicated amount. A
   ledger needs none of that. So the Worker reads the bundle, calls
   extractLines() from the same library the browser uses, and returns a service
   code, a date, and which kind of claim it was. The rest is dropped where it
   was read. Nothing is written to D1 or KV, and nothing is logged.

   The only counter this touches is the site-wide aggregate `bluebutton_claims`
   — a number per day, no person in it, the same shape every other route uses. */
import { json, bad, count } from '../_http.js';
import { isConfigured, NOT_CONFIGURED, cookieOf, TOKEN_COOKIE, killCookie, SANDBOX } from './_bb.js';
import { extractLines, nextPageUrl, claimCount } from '../../../../lib/bluebutton.ts';

/** 50 claims a page, four pages. Two hundred claims is a long odyssey, and a
 *  cap that is reached is reported rather than hidden. */
const PAGE_SIZE = 50;
const MAX_PAGES = 4;

export async function onRequestGet({ request, env }) {
  if (!isConfigured(env)) return bad(NOT_CONFIGURED, 503);

  const token = cookieOf(request, TOKEN_COOKIE);
  if (!token) return bad('Not connected to Medicare. Start at /api/bluebutton/start.', 401);

  const first = new URL(SANDBOX.fhirBase + SANDBOX.eobPath);
  first.searchParams.set('_count', String(PAGE_SIZE));
  first.searchParams.set('_format', 'application/fhir+json');

  let url = first.toString();
  const lines = [];
  let claims = 0;
  let pages = 0;
  let truncated = false;

  while (url && pages < MAX_PAGES) {
    let res;
    try {
      res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/fhir+json' } });
    } catch {
      return bad('Could not reach Medicare to read your claims. Please try again.', 502);
    }
    if (res.status === 401 || res.status === 403) {
      // The token expired or was revoked at CMS. Clear ours so the page can
      // offer a fresh sign-in instead of failing the same way forever.
      return json(
        { ok: false, error: 'Your Medicare connection has expired. Please connect again.' },
        401,
        { 'set-cookie': killCookie(TOKEN_COOKIE) },
      );
    }
    if (!res.ok) return bad(`Medicare returned an error reading your claims (${res.status}).`, 502);

    let bundle = null;
    try { bundle = await res.json(); } catch { return bad('Medicare sent a response this app could not read.', 502); }

    claims += claimCount(bundle);
    for (const l of extractLines(bundle)) lines.push(l);
    pages++;

    const next = nextPageUrl(bundle);
    if (next && pages >= MAX_PAGES) truncated = true;
    url = next && pages < MAX_PAGES ? next : null;
  }

  await count(env, 'bluebutton_claims');

  return json({
    ok: true,
    environment: 'sandbox',
    claimCount: claims,
    lines,
    pages,
    truncated,
    note: truncated
      ? `Showing the most recent ${PAGE_SIZE * MAX_PAGES} claims. Medicare holds more.`
      : null,
  });
}
