/* ==========================================================================
   POST /api/gap  — a report of what federal health data could not see
   GET  /api/gap  — the aggregate: the measured shape of the gap

   🔴 WHAT THIS ENDPOINT IS FOR.

   MEPS, HCUP and CMS claims record care that was DELIVERED AND BILLED. A
   person who needed care and did not get it produces no row in any of them.
   Dr. John Phillips (Senior Advisor on Health Economic Research, Office of the
   NIH Director) named this at the TOPx Cost of Illness office hours on
   2026-08-20:

     "naturally a lot of the things that will be showing up on patient need
      come from individuals who have actually received service of some way,
      shape or form. And a neat thing about this is the potential to identify
      folks who want service, but don't get it. And so that I think is going to
      be the... data challenge."

   Every other tool in this track prices what the federal data already contains.
   This endpoint collects what it does not, in a structured, countable form —
   so the absence becomes a measurement instead of a silence.

   And the ranking payload answers his other, more insistent ask — the first
   question he put to the cohort and returned to three more times: weights
   elicited from the affected community rather than assigned by an analyst.

   🔴 PRIVACY IS THE PRECONDITION, NOT A FEATURE. No name, no date of birth,
   no diagnosis, no free-text health detail beyond a short optional note, no
   IP, no cookie, no identifier of any kind. A gap report must be safe to send
   from a person who is frightened of their insurer, or it will not be sent.
   ========================================================================== */

/* The rules live in cf/functions/api/gap.js — one validator, one aggregate,
   shared with the Cloudflare function and the tests. This Node route exists for
   `next dev` only and keeps a JSONL store; production is D1. */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateGap, aggregateGap } from '../../../cf/functions/api/gap.js';
import { readRows } from '../_rows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STORE = path.join(process.cwd(), 'data', 'gap-reports.jsonl');

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Body must be JSON.' }, { status: 400 }); }
  const v = validateGap(body);
  if (v.error || !v.record) return NextResponse.json({ ok: false, error: v.error ?? 'Body must be JSON.' }, { status: 400 });
  try {
    await fs.mkdir(path.dirname(STORE), { recursive: true });
    await fs.appendFile(STORE, JSON.stringify(v.record) + '\n', 'utf8');
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not record the report. Nothing was saved.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** The aggregate: the measured shape of the gap. */
export async function GET() {
  return NextResponse.json(aggregateGap(await readRows(STORE)));
}
