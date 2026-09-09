/* POST/GET /api/survey — Node mirror of cf/functions/api/survey.js (one validator, one aggregate). JSONL store for local runs. */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { readRows } from '../_rows';
import path from 'node:path';
import { validateSurvey, aggregateSurvey } from '../../../cf/functions/api/survey.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const STORE = path.join(process.cwd(), 'data', 'survey-responses.jsonl');
export async function POST(req: NextRequest) {
  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Body must be JSON.' }, { status: 400 }); }
  const v = validateSurvey(body);
  if (v.error) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  try { await fs.mkdir(path.dirname(STORE), { recursive: true }); await fs.appendFile(STORE, JSON.stringify(v.record) + '\n', 'utf8'); }
  catch { return NextResponse.json({ ok: false, error: 'Could not record the response. Nothing was saved.' }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
export async function GET() { return NextResponse.json(aggregateSurvey(await readRows(STORE))); }
