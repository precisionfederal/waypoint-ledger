/* GET /api/export/{corrections|gap|survey} — de-identified CSV. Node mirror of cf/functions/api/export/[kind].js */
import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { exportRows } from '../../../../cf/functions/api/export/[kind].js';
import { readRows } from '../../_rows';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const FILES: Record<string, string> = { corrections: 'corrections.jsonl', gap: 'gap-reports.jsonl', survey: 'survey-responses.jsonl' };
export async function GET(_req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const kind = (await ctx.params).kind.replace(/\.csv$/, '');
  if (!FILES[kind]) return NextResponse.json({ ok: false, error: 'Unknown export. Use corrections, gap or survey.' }, { status: 404 });
  const rows = (await readRows(path.join(process.cwd(), 'data', FILES[kind]))).sort((a, b) => (String(a.receivedAt) < String(b.receivedAt) ? -1 : 1));
  return new NextResponse(exportRows(kind, rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="waypoint-ledger-${kind}.csv"` } });
}
