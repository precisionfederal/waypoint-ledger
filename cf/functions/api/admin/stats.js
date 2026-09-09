/* GET /api/admin/stats — counts per table and the aggregate event counters for
   the last 30 days. Counters carry no identifier: a day, a name, a number. */
import { json, bad } from '../_http.js';
import { all, one } from '../_db.js';
import { countSql } from '../health.js';
import { requireAdmin } from './_admin.js';

const TABLES = { corrections: 'corrections', gap: 'gap_reports', survey: 'survey_responses', interviews: 'interviews', changes: 'changes', journeys: 'journeys', users: 'users', sessions: 'sessions' };

export async function onRequestGet({ request, env }) {
  const stop = requireAdmin(env, request); if (stop) return stop;
  try {
    const row = await one(env, countSql(TABLES));
    const tables = {};
    for (const k of Object.keys(TABLES)) tables[k] = Number(row?.[k] ?? 0);
    const reviewed = await one(env, 'SELECT COUNT(*) AS n FROM interviews WHERE reviewed_at IS NOT NULL');
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const rows = await all(env, 'SELECT day, name, count FROM events WHERE day >= ?1 ORDER BY day DESC, name ASC', since);
    const eventsByName = {};
    for (const r of rows) eventsByName[r.name] = (eventsByName[r.name] || 0) + Number(r.count);
    return json({
      ok: true,
      tables,
      unreviewedInterviews: tables.interviews - Number(reviewed?.n || 0),
      since,
      eventsByName,
      events: rows.map((r) => ({ day: r.day, name: r.name, count: Number(r.count) })),
      generatedAt: new Date().toISOString(),
    });
  } catch { return bad('Stats could not be read.', 500); }
}
