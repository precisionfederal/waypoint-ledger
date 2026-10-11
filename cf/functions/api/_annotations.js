/* ==========================================================================
   OUR OWN TEST ROWS, MARKED IN PUBLIC, NEVER DELETED.

   The register's tables are append-only and hash-chained (_hash.js). A row we
   wrote ourselves while testing the form cannot be deleted without breaking
   the chain a stranger checks, and leaving it in the counts would publish our
   own clicks as public answers. So it is MARKED: one row in `annotations`
   (migration 0007), keyed by the marked row's row_hash, kind 'team-test'.

   What a mark does, and only this:
     - every published aggregate leaves the row out of its counts and rankings
       and says how many it left out, as `teamTests` (_counters.js);
     - the per-figure tally a person sees after a thumb leaves it out
       (corrections.js tallyFor);
     - every CSV and JSON export keeps the row and says team_test = true.
   What a mark never does: change the row, its hash, the chain head, or the
   walk at /api/integrity?verify=1, which still covers every row.

   Marks are written only through POST /api/admin/annotations. No row is
   marked by code: which rows were ours is a fact a person confirms.
   ========================================================================== */
import { all, one } from './_db.js';

export const TEAM_TEST = 'team-test';
export const ANNOTATION_KINDS = [TEAM_TEST];

/** Every name a caller may use for a chained table -> the D1 table. */
export const ANNOTATABLE = {
  corrections: 'corrections',
  gap: 'gap_reports', gap_reports: 'gap_reports',
  survey: 'survey_responses', survey_responses: 'survey_responses',
  interviews: 'interviews', interview: 'interviews',
};

export const NOTE_MAX = 200;
const HEX64 = /^[0-9a-f]{64}$/;

/** Pure validator for the admin POST. */
export function validateAnnotation(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Body must be a JSON object.' };
  const table = typeof b.table === 'string' ? ANNOTATABLE[b.table.trim()] : undefined;
  if (!table) return { error: 'table must be one of corrections, gap, survey or interviews.' };
  const rowHash = typeof b.rowHash === 'string' ? b.rowHash.trim().toLowerCase() : '';
  if (!HEX64.test(rowHash)) return { error: 'rowHash must be the 64-character row_hash of the row, as published in the CSV.' };
  const kind = b.kind === undefined ? TEAM_TEST : b.kind;
  if (!ANNOTATION_KINDS.includes(kind)) return { error: `kind must be ${ANNOTATION_KINDS.join(' or ')}.` };
  if (b.note !== undefined && b.note !== null && typeof b.note !== 'string') return { error: 'note must be text.' };
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length > NOTE_MAX) return { error: `note must be ${NOTE_MAX} characters or fewer.` };
  return { record: { table, rowHash, kind, note: note || null } };
}

/** The row_hashes marked team-test in one table. A register whose migration
 *  has not run yet has no marks: an unreadable table reads as none, so every
 *  count stays exactly what it was before this feature. */
export async function teamTestHashes(env, table) {
  try {
    const rows = await all(env, 'SELECT row_hash FROM annotations WHERE table_name=?1 AND kind=?2', table, TEAM_TEST);
    return new Set(rows.map((r) => r.row_hash));
  } catch { return new Set(); }
}

/** How many marks a table has, for the fold's fingerprint. 0 when unreadable. */
export async function teamTestCount(env, table) {
  try {
    const r = await one(env, 'SELECT COUNT(*) AS n FROM annotations WHERE table_name=?1 AND kind=?2', table, TEAM_TEST);
    return Number(r?.n || 0);
  } catch { return 0; }
}

/** Pure. Split loaded rows into the ones that count and our own tests. A row
 *  with no hash (written before the chain) can never be marked, so it counts. */
export function splitTeamTests(rows, marked) {
  if (!marked || !marked.size) return { counted: rows, teamTests: 0 };
  const counted = rows.filter((r) => !(r.rowHash && marked.has(r.rowHash)));
  return { counted, teamTests: rows.length - counted.length };
}

/** Pure. The same rows, each saying whether it is one of ours. For exports. */
export const flagTeamTests = (rows, marked) => rows.map((r) => ({ ...r, teamTest: !!(r.rowHash && marked && marked.has(r.rowHash)) }));

/** Load, then flag. For the export routes. */
export async function withTeamTestFlags(env, table, rows) {
  return flagTeamTests(rows, await teamTestHashes(env, table));
}
