/* ==========================================================================
   GET  /api/health — is the system of record answering, which price table is
   live, and WHICH BUILD is answering. Public, uncached, no identifiers.
   POST /api/health — the write canary (admin token only): prove that D1 can
   actually be written to, without leaving a row anywhere the public reads.

   Why the canary exists: every register table can read 200 and still be a
   system that has never successfully stored anything. An INSERT and a DELETE
   in ONE D1 batch is one transaction — it either both applies or neither does,
   and it lands in `canary`, a table outside every chain, outside every export
   and outside every aggregate. So the write path is proven with no test row in
   the public register, ever.
   ========================================================================== */
import { json, bad } from './_http.js';
import { one, isAdmin } from './_db.js';
import prices from '../../../data/prices.json';
import build from '../../../public/build.json';

const VERSION = prices._version || 'unknown';
/* One row of scalar sub-selects: D1 caps the number of terms in a compound
   SELECT, so counts are never taken with UNION ALL. */
export const TABLES = { corrections: 'corrections', gap: 'gap_reports', survey: 'survey_responses', interviews: 'interviews', changes: 'changes', journeys: 'journeys' };
export const countSql = (tables) => 'SELECT ' + Object.entries(tables).map(([k, t]) => `(SELECT COUNT(*) FROM ${t}) AS ${k}`).join(', ');

/** The build stamp, exactly as generated into public/build.json. Exported so a
 *  test can hold the shape and so nothing hand-writes a second copy. */
export const BUILD = {
  commit: build.shortCommit || 'unknown',
  fullCommit: build.commit || 'unknown',
  dirty: Boolean(build.dirty),
  builtAt: build.builtAt || null,
  tableVersion: build.tableVersion || VERSION,
  surveyVersion: build.surveyVersion || 'unknown',
  publishedFigures: Number(build.publishedFigures || 0),
};

const WRITE_OK_KEY = 'health:lastWriteOkAt';

/* THE WRITE PROOF A STRANGER CAN CHECK.
   Round 4's gate was red for every honest outsider: /adopt invites an agency to
   run cf/verify-live.sh, and the one check that proves an INSERT reaches D1
   needed ADMIN_TOKEN — a secret we can never hand them. So the gate failed
   structurally on every run they made, on the page that asks them to trust us.
   The canary already stamps KV on every successful write. This turns that stamp
   into something readable: WHEN the write happened, how long AFTER the artifact
   that is answering was published, and how old it is now. No secret, no
   identifier, no row.

   `provenForThisBuild` is deliberately strict. A stamp that predates `builtAt`
   proves the write path of some earlier artifact, not the one answering this
   request, and 24 h is the widest gap we will call the same deployment. It is a
   claim about THIS build or it is not made at all. */
export function writeProof(lastWriteOkAt, builtAt, nowMs = Date.now()) {
  const wrote = lastWriteOkAt ? Date.parse(lastWriteOkAt) : NaN;
  const built = builtAt ? Date.parse(builtAt) : NaN;
  const secondsAfterBuild = Number.isFinite(wrote) && Number.isFinite(built) ? Math.round((wrote - built) / 1000) : null;
  return {
    lastWriteOkAt: Number.isFinite(wrote) ? lastWriteOkAt : null,
    ageSeconds: Number.isFinite(wrote) ? Math.max(0, Math.round((nowMs - wrote) / 1000)) : null,
    secondsAfterBuild,
    provenForThisBuild: secondsAfterBuild !== null && secondsAfterBuild >= 0 && secondsAfterBuild <= 86400,
  };
}

export async function onRequestGet({ env }) {
  const tables = {};
  let db = 'ok';
  try {
    const row = await one(env, countSql(TABLES));
    if (!row) throw new Error('no row');
    for (const k of Object.keys(TABLES)) tables[k] = Number(row[k]);
  } catch { db = 'down'; }
  let lastWriteOkAt = null;
  try { lastWriteOkAt = (await env.LEDGER?.get(WRITE_OK_KEY)) || null; } catch { lastWriteOkAt = null; }
  return json({
    ok: db === 'ok',
    version: VERSION,
    tableVersion: VERSION,
    db,
    build: BUILD,
    tables,
    lastWriteOkAt,
    canary: writeProof(lastWriteOkAt, BUILD.builtAt),
    generatedAt: new Date().toISOString(),
  }, db === 'ok' ? 200 : 503);
}

export async function onRequestPost({ request, env }) {
  if (!isAdmin(env, request)) return bad('Not authorised.', 401);
  const started = Date.now();
  const rid = crypto.randomUUID();
  try {
    const res = await env.DB.batch([
      env.DB.prepare('INSERT INTO canary (id, at) VALUES (?1, ?2)').bind(rid, new Date().toISOString()),
      env.DB.prepare('DELETE FROM canary WHERE id=?1').bind(rid),
    ]);
    const wrote = Number(res?.[0]?.meta?.changes || 0) === 1;
    const left = await one(env, 'SELECT COUNT(*) AS n FROM canary');
    const at = new Date().toISOString();
    if (wrote) { try { await env.LEDGER?.put(WRITE_OK_KEY, at); } catch { /* the stamp is best effort */ } }
    return json({
      ok: wrote,
      writePath: { ok: wrote, ms: Date.now() - started, rowsLeftBehind: Number(left?.n || 0), at },
      build: BUILD,
      note: 'An INSERT and a DELETE in one D1 batch, in a table outside every chain, every export and every aggregate. No row reaches the public register.',
    }, wrote ? 200 : 503);
  } catch {
    return json({ ok: false, writePath: { ok: false, ms: Date.now() - started, error: 'The database refused the write.' }, build: BUILD }, 503);
  }
}
