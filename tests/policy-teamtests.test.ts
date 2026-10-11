/* Temporary check of the proposed cf/functions/api/policy.js patch (NOT committed). */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { appendChained } from '../cf/functions/api/_hash.js';
import { onRequestPost as annotate } from '../cf/functions/api/admin/annotations.js';
import { onRequestGet as policyGet } from '../cf/functions/api/policy.js';
import { onRequestGet as correctionsGet } from '../cf/functions/api/corrections.js';

function d1(db: DatabaseSync) {
  const val = (v: unknown) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  const isRead = (sql: string) => /^\s*(SELECT|WITH)\b/i.test(sql);
  const exec = (sql: string, bound: unknown[]) => { const st = db.prepare(sql); const args = bound.map(val) as (string | number | null)[];
    if (isRead(sql)) return { results: st.all(...args), meta: { changes: 0 } }; const r = st.run(...args); return { results: [], meta: { changes: Number(r.changes) } }; };
  const prepare = (sql: string) => { const st = { sql, bound: [] as unknown[], bind(...a: unknown[]) { st.bound = a; return st; },
    async first() { return (exec(st.sql, st.bound).results[0] as Record<string, unknown>) ?? null; }, async all() { return exec(st.sql, st.bound); }, async run() { return exec(st.sql, st.bound); } }; return st; };
  const batch = async (sts: { sql: string; bound: unknown[] }[]) => { db.exec('BEGIN'); try { const o = sts.map((s) => exec(s.sql, s.bound)); db.exec('COMMIT'); return o; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  return { prepare, batch };
}
const kv = () => { const m = new Map<string, string>([['snd:survey:people', '9']]); return { async get(k: string) { return m.get(k) ?? null; }, async put(k: string, v: string) { m.set(k, v); } }; };

describe('policy.js patch', () => {
  it('disputes leave our marked thumbs out and say how many; survey claims no sender count while rows are marked', async () => {
    const db = new DatabaseSync(':memory:');
    for (const f of readdirSync('cf/migrations/').filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync('cf/migrations/' + f, 'utf8'));
    const env = { DB: d1(db), ADMIN_TOKEN: 't', LEDGER: kv() } as Record<string, unknown>;
    const add = (priceId: string, verdict: string, at: string, sub: string) => appendChained(env, 'corrections',
      { price_id: priceId, verdict, believed_usd: null, table_version: 'v1', received_at: at, submitter_hash: sub },
      { receivedAt: at, priceId, verdict, believedValueUsd: null, priceTableVersion: 'v1' });
    const ours = await add('cms-99213', 'wrong', '2026-09-10T10:00:00.000Z', 'a'.repeat(32));
    await add('cms-img-echo', 'wrong', '2026-10-01T08:49:12.622Z', 'b'.repeat(32));
    const R = ['forgone', 'time', 'work', 'oop', 'unpaid'];
    const sv = (at: string) => appendChained(env, 'survey_responses', { ranking_json: JSON.stringify(R), unasked: 'unpaid', lead: 'forgone', decide: 'patients', clinicians: 3, context_json: '{}', channel: 'direct', survey_version: '2026-10-01.1', received_at: at },
      { receivedAt: at, channel: 'direct', ranking: R, unasked: 'unpaid', lead: 'forgone', decide: 'patients', clinicians: 3, context: {}, surveyVersion: '2026-10-01.1' });
    await sv('2026-09-10T10:00:00.000Z'); const s2 = await sv('2026-10-01T10:00:00.000Z');
    const post = (table: string, rowHash: string) => annotate({ request: new Request('https://x.test/api/admin/annotations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify({ table, rowHash }) }), env } as never);
    await post('corrections', ours.rowHash); await post('survey', s2.rowHash);
    const p = await (await policyGet({ env } as never)).json();
    const c = await (await correctionsGet({ env } as never)).json();
    expect(p.disputes.sends).toBe(c.sends);
    expect(p.disputes.sends).toBe(1);
    expect(p.disputes.teamTests).toBe(1);
    expect(p.uncounted.survey).toMatchObject({ answers: 1, senders: 1, senderBasis: 'sends' });
  });
});
