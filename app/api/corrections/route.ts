/* ==========================================================================
   POST /api/corrections   — the demand signal back to government
   GET  /api/corrections   — aggregate counts per federal source row

   🔴 WHY THIS ENDPOINT EXISTS. At the TOPx Cost of Illness office hours on
   2026-08-20, Dr. Kristen Honey (Chief Partnerships Officer, DPCPSI, Office of
   the Director, NIH) said this to Waypoint Ledger directly:

     "if every data point for transparency is cited, imagine if you added in a
      functionality that could be a thumbs up or thumbs down, because sometimes
      our data and price data is wrong. And the engaged public using this tool
      might be a great demand signal for us in government to realize where there
      are errors or gaps... if we get enough thumbs down, like maybe we pay
      attention and focus in on that."

   A correction is therefore not a UI preference. It is a public assertion about
   a specific published federal figure, and it must be bound to the exact source
   row it concerns so it can be routed to the agency that published it. That
   binding is the whole point, and it is why this cannot live in localStorage.

   🔴 PRIVACY. Nothing here identifies a person. No name, no journey, no
   diagnosis, no IP, no cookie. A correction is: which figure, right or wrong,
   optionally what the person believes the real number is.
   ========================================================================== */

/* The rules live in cf/functions/api/corrections.js — one validator, one
   aggregate, shared with the Cloudflare function and the tests. This Node route
   exists for `next dev` only and keeps a JSONL store; production is D1. */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateCorrection, aggregateCorrections } from '../../../cf/functions/api/corrections.js';
import { readRows } from '../survey/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STORE = path.join(process.cwd(), 'data', 'corrections.jsonl');

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Body must be JSON.' }, { status: 400 }); }
  const v = validateCorrection(body);
  if (v.error || !v.record) return NextResponse.json({ ok: false, error: v.error ?? 'Body must be JSON.' }, { status: 400 });
  try {
    await fs.mkdir(path.dirname(STORE), { recursive: true });
    await fs.appendFile(STORE, JSON.stringify(v.record) + '\n', 'utf8');
  } catch {
    // A correction that cannot be stored must not be reported as stored.
    return NextResponse.json({ ok: false, error: 'Could not record the correction. Nothing was saved.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recorded: v.record.priceId });
}

/** Aggregate view — what the public is telling the government about each figure. */
export async function GET() {
  return NextResponse.json(aggregateCorrections(await readRows(STORE)));
}
