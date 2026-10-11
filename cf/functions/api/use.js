/* GET  /api/use            — the public readout: counts of actions by week, since counting began.
   POST /api/use?a=<action> — the browser reports one action it does on its own (a ledger opened,
                              a sheet printed, a file exported). No body is read, ever: the action
                              is one word from a fixed list, and nothing else arrives.
   What is kept, and what is not: cf/functions/api/_use.js. */
import { json, bad, isDryRun } from './_http.js';
import { BEACON_IDS, recordUse, sourceOf, summarizeUse, loadUseRows } from './_use.js';

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const a = url.searchParams.get('a') || '';
  if (!BEACON_IDS.includes(a)) return bad(`Unknown action. One of: ${BEACON_IDS.join(', ')}.`);
  if (isDryRun(request)) return json({ ok: true, dryRun: true, action: a, note: 'Validated only. Nothing was counted.' });
  await recordUse(env, a, sourceOf(request));
  /* 200 with a two-field body, not 204: Chromium reports a fetch answered 204 as aborted,
     and a gate reading failed requests should never see this one. */
  return json({ ok: true, counted: a });
}

export async function onRequestGet({ env }) {
  try { return json(summarizeUse(await loadUseRows(env))); }
  catch { return json({ ok: false, error: 'The counts could not be read just now. They are unread, not zero.' }, 503); }
}
