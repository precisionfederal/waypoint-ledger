/* ==========================================================================
   THE REGISTER'S INTEGRITY CHAIN — one definition, pure where it can be.

   Every public row the register keeps is bound to the row before it:

       row_hash = SHA-256( prev_hash + canonical(published fields) )

   `prev_hash` is always 64 lower-case hex characters, so the concatenation is
   unambiguous and needs no separator. The first row of a table chains to
   GENESIS (64 zeros). `integrity_heads` holds the current head and the count.

   WHAT THE CHAIN COVERS. Exactly the fields we publish for that table — the
   columns of the CSV export, nothing more. A third party who downloads the CSV
   can recompute every hash and the head themselves. Private fields (an
   optional note, an encrypted sentence, interview answers) are deliberately
   OUTSIDE the chain: we never publish them, so nobody could ever check them,
   and a hash over data nobody can see proves nothing to anybody.

   WHAT IT PROVES: no published row was edited, deleted or reordered after it
   was written without the head changing. WHAT IT DOES NOT PROVE: that the
   people who wrote the rows are distinct people, or that we published every
   row we received. Those are different claims and /integrity says so.
   ========================================================================== */

export const GENESIS = '0'.repeat(64);

/** Canonical JSON: object keys sorted at every level, undefined written as null.
 *  Deterministic in any language that sorts strings by code point. */
export function canonical(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

/** Lower-case hex SHA-256 of a UTF-8 string. WebCrypto: Workers and Node alike. */
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The chain step. Pure: same inputs, same hash, on any machine. */
export async function rowHash(prevHash, publishedFields) {
  return sha256Hex(String(prevHash || GENESIS) + canonical(publishedFields));
}

/* --------------------------------------------------------------------------
   The published projection per table: the exact field set the chain covers.
   Keep these frozen. Changing one changes every future hash, so a change gets
   a new table_version and a line on /integrity — never a silent edit.
   -------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------
   THE SURVEY'S CONTEXT PROJECTION, BY VERSION.

   The CSV published `ctx_state` while the chain covered only age, insurance,
   region and stage — so the field a policy shop reads first was the one field
   nobody could prove had not been edited. Widening the projection cannot be a
   silent edit: every row already written was chained over the narrower field
   set, and a walk that used today's field set would call those rows broken
   when they are not.

   So the projection is a function of the row's OWN instrument version. A row
   states which version it was collected under; the walk uses that version's
   field set; old rows verify exactly as they were written, new rows carry the
   state, and a third party can reproduce both from this table alone.
   -------------------------------------------------------------------------- */

/** Newest first. `from` is the instrument version at which the field set began. */
export const SURVEY_PROJECTIONS = [
  {
    from: '2026-09-09.2',
    keys: ['age', 'insurance', 'region', 'state', 'stage'],
    note: 'adds the state or territory — published in the CSV since the instrument carried it, and chained from this version on.',
  },
  {
    from: null,
    keys: ['age', 'insurance', 'region', 'stage'],
    note: 'the original field set. Rows collected under it published ctx_state without chaining it; the walk of those rows uses these four fields, which is what was actually hashed.',
  },
];

/** Compare two instrument versions of the form YYYY-MM-DD.N. An unrecognisable
 *  version is treated as older than any known one — never as newer, so a
 *  malformed value can never widen a chain by accident. */
export function versionAtLeast(version, floor) {
  const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})\.(\d+)$/.exec(String(s || '')); return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null; };
  const a = parse(version); const b = parse(floor);
  if (!a || !b) return false;
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

/** The context fields the chain covers for a row collected under `version`. */
export function surveyCtxKeysFor(version) {
  for (const p of SURVEY_PROJECTIONS) if (p.from && versionAtLeast(version, p.from)) return p.keys;
  return SURVEY_PROJECTIONS[SURVEY_PROJECTIONS.length - 1].keys;
}

/** The field set in force today. */
export const SURVEY_CTX_KEYS = SURVEY_PROJECTIONS[0].keys;

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strOrNull = (v) => (typeof v === 'string' && v ? v : null);
const pick = (obj, keys) => { const o = {}; for (const k of keys) o[k] = strOrNull(obj && obj[k]); return o; };

export const PUBLISHED = {
  corrections: (r) => ({
    received_at: r.receivedAt,
    price_id: r.priceId,
    verdict: r.verdict,
    believed_usd: numOrNull(r.believedValueUsd),
    table_version: strOrNull(r.priceTableVersion),
  }),
  gap_reports: (r) => ({
    received_at: r.receivedAt,
    counts: r.counts || {},
    ranking: r.ranking || [],
    table_version: strOrNull(r.tableVersion),
  }),
  survey_responses: (r) => ({
    received_at: r.receivedAt,
    channel: r.channel || 'direct',
    ranking: r.ranking || [],
    unasked: r.unasked,
    lead: r.lead,
    decide: r.decide,
    clinicians: numOrNull(r.clinicians),
    context: pick(r.context, surveyCtxKeysFor(r.surveyVersion)),
    survey_version: strOrNull(r.surveyVersion),
  }),
  /* Nothing an interviewee wrote is published, so nothing an interviewee wrote
     is in the chain. What is chained is that an interview arrived, when, under
     which consent, through which channel — the only interview facts
     /api/interview ever serves. */
  interviews: (r) => ({
    received_at: r.receivedAt,
    consent: r.consent,
    channel: r.channel || 'direct',
    follow_up: r.followUp ? 1 : 0,
  }),
};

export const CHAINED_TABLES = Object.keys(PUBLISHED);

/** A one-way, per-figure submitter key. The raw browser id never leaves the
 *  browser and is never stored: what is stored is a truncated hash bound to
 *  this figure and this table version, so two rows from one browser cannot be
 *  linked to each other, and a repeat thumb on the SAME figure is refused.
 *
 *  `pepper` is a server-side secret (REGISTER_PEPPER). Without it, anyone
 *  holding a browser id could recompute the stored key and learn whether that
 *  browser had spoken about a given figure. With it, the stored value is
 *  useless to everyone but this server, and the dedupe still works because the
 *  server computes both sides. It is deliberately NOT the browser id, not the
 *  IP, and not derived from either: it adds nothing about the person.
 */
export async function submitterHash(submitterId, priceId, tableVersion, pepper = '') {
  if (!submitterId) return null;
  return (await sha256Hex(submitterId + ' ' + priceId + ' ' + (tableVersion || '') + ' ' + (pepper || ''))).slice(0, 32);
}

/* --------------------------------------------------------------------------
   THE NETWORK KEY — what a rate limit is allowed to know.

   One definition, used by the middleware's per-path limiter AND by the
   per-figure cooldown in corrections.js. It is a truncated SHA-256 of the
   caller's IP with a salt that rolls every day and carries a server secret, so
   it cannot be reversed to an address by anybody holding the key, and it stops
   being comparable across days. Nothing derived from it is ever stored in a
   published row or served to anyone.

   Round 3's finding was that the salt was only the date plus ADMIN_TOKEN: if
   ADMIN_TOKEN were unset, the whole IPv4 space is 4 billion hashes, which is
   minutes of work. REGISTER_PEPPER is the dedicated secret; ADMIN_TOKEN
   remains a fallback so an existing deployment does not lose the limiter, and
   /api/health reports which one is in force.
   -------------------------------------------------------------------------- */
export const pepperOf = (env) => String((env && (env.REGISTER_PEPPER || env.ADMIN_TOKEN)) || '');

export async function networkKey(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '0.0.0.0';
  const salt = new Date().toISOString().slice(0, 10) + ' ' + pepperOf(env);
  return (await sha256Hex(ip + ' ' + salt)).slice(0, 24);
}

/** The bucket one network's votes on ONE figure are counted in. Bound to the
 *  figure and the table version so a cooldown on one row never silences a
 *  person about a different row. */
export async function figureBucket(request, env, priceId, tableVersion) {
  return (await sha256Hex((await networkKey(request, env)) + ' ' + priceId + ' ' + (tableVersion || ''))).slice(0, 24);
}

/* --------------------------------------------------------------------------
   The chained append. Two statements in one D1 batch:
     1. INSERT ... SELECT ... WHERE EXISTS (the head is still what we read)
     2. UPDATE integrity_heads ... WHERE head_hash = the head we read
   Either both apply or neither does, so two writers in the same millisecond
   cannot fork the chain: the loser's INSERT matches nothing and it retries
   against the new head.
   -------------------------------------------------------------------------- */
export async function appendChained(env, table, row, record, attempts = 5) {
  const project = PUBLISHED[table];
  if (!project) throw new Error('No published projection for ' + table);
  for (let i = 0; i < attempts; i++) {
    const head = await env.DB.prepare('SELECT head_hash, row_count FROM integrity_heads WHERE table_name=?1').bind(table).first();
    const prev = (head && head.head_hash) || GENESIS;
    const hash = await rowHash(prev, project(record));
    const full = { id: row.id || crypto.randomUUID(), ...row, prev_hash: prev, row_hash: hash };
    const cols = Object.keys(full);
    const marks = cols.map((_, n) => '?' + (n + 1)).join(',');
    const res = await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO ' + table + ' (' + cols.join(',') + ') SELECT ' + marks +
        ' WHERE EXISTS (SELECT 1 FROM integrity_heads WHERE table_name=?' + (cols.length + 1) + ' AND head_hash=?' + (cols.length + 2) + ')',
      ).bind(...cols.map((c) => (full[c] === undefined ? null : full[c])), table, prev),
      env.DB.prepare('UPDATE integrity_heads SET head_hash=?1, row_count=row_count+1, updated_at=?2 WHERE table_name=?3 AND head_hash=?4')
        .bind(hash, new Date().toISOString(), table, prev),
    ]);
    const wrote = Number((res && res[0] && res[0].meta && res[0].meta.changes) || 0) > 0;
    if (wrote) return { id: full.id, prevHash: prev, rowHash: hash, position: Number((head && head.row_count) || 0) + 1 };
  }
  throw new Error('Could not extend the ' + table + ' chain after ' + attempts + ' attempts');
}

/** Every head, for GET /api/integrity and for the CSV stamp. */
export async function heads(env) {
  const rows = (await env.DB.prepare('SELECT table_name, head_hash, row_count, updated_at FROM integrity_heads ORDER BY table_name').all()).results || [];
  return rows.map((r) => ({ table: r.table_name, head: r.head_hash, rows: Number(r.row_count), updatedAt: r.updated_at }));
}

/** Recompute a chain from its rows, in order. Pure apart from the digest.
 *  Returns { ok, length, head, brokeAt } — the same walk a third party runs
 *  against the published CSV. */
export async function verifyChain(table, rows) {
  const project = PUBLISHED[table];
  let prev = GENESIS;
  for (let i = 0; i < rows.length; i++) {
    const expected = await rowHash(prev, project(rows[i]));
    if (rows[i].prevHash && rows[i].prevHash !== prev) return { ok: false, length: rows.length, head: prev, brokeAt: i, reason: 'prev_hash does not match the row before it' };
    if (rows[i].rowHash && rows[i].rowHash !== expected) return { ok: false, length: rows.length, head: prev, brokeAt: i, reason: 'row_hash does not match the published fields' };
    prev = rows[i].rowHash || expected;
  }
  return { ok: true, length: rows.length, head: prev, brokeAt: null };
}

/* --------------------------------------------------------------------------
   EVERY PUBLISHED COLUMN IS INSIDE THE CHAIN — provable, not asserted.

   `chainCoverage` maps each column of a published CSV to the projection field
   it comes from. A column that maps to nothing is a column we publish and
   cannot prove: `tests/chain-coverage.test.ts` fails the build on one. The
   only way past it is an explicit entry in UNCHAINED_CSV with a reason, which
   is a decision somebody wrote down rather than an omission nobody saw.
   -------------------------------------------------------------------------- */

/** Which D1 table each CSV export is drawn from. */
export const CSV_TABLE = { corrections: 'corrections', gap: 'gap_reports', survey: 'survey_responses' };

/** Columns deliberately outside the chain, and why. */
export const UNCHAINED_CSV = {
  corrections: { row_hash: 'the hash itself: a value cannot be inside its own input.' },
  gap: { row_hash: 'the hash itself: a value cannot be inside its own input.' },
  survey: { row_hash: 'the hash itself: a value cannot be inside its own input.' },
};

/**
 * @param {string} kind        corrections | gap | survey
 * @param {string[]} header    the CSV header row, in order
 * @param {{ctxKeys?: string[], countKeys?: string[]}} opts
 *        ctxKeys   the survey context fields in force (default: today's)
 *        countKeys the gap category ids, passed in by the caller that owns them
 *                  so this module never keeps a second copy of that list
 */
export function chainCoverage(kind, header, opts = {}) {
  const table = CSV_TABLE[kind];
  const project = PUBLISHED[table];
  if (!project) return { covered: [], unchained: [], uncovered: header.slice(), error: 'no published projection for ' + kind };
  const fields = new Set(Object.keys(project({})));
  const ctxKeys = opts.ctxKeys || SURVEY_CTX_KEYS;
  const countKeys = opts.countKeys || [];
  const exempt = UNCHAINED_CSV[kind] || {};
  const covered = []; const unchained = []; const uncovered = [];
  for (const column of header) {
    if (Object.prototype.hasOwnProperty.call(exempt, column)) { unchained.push({ column, reason: exempt[column] }); continue; }
    if (fields.has(column)) { covered.push({ column, field: column }); continue; }
    if (/^rank_\d+$/.test(column) && fields.has('ranking')) { covered.push({ column, field: 'ranking' }); continue; }
    if (column.startsWith('ctx_') && fields.has('context')) {
      const k = column.slice(4);
      if (ctxKeys.includes(k)) covered.push({ column, field: 'context.' + k });
      else uncovered.push(column);
      continue;
    }
    if (fields.has('counts') && countKeys.includes(column)) { covered.push({ column, field: 'counts.' + column }); continue; }
    uncovered.push(column);
  }
  return { covered, unchained, uncovered };
}

/** How to recompute each published file, in the words a person outside would
 *  need. One recipe per file — not one recipe and two files without one. */
export const RECIPES = {
  corrections: {
    file: '/api/export/corrections.csv',
    projection: ['received_at', 'price_id', 'verdict', 'believed_usd', 'table_version'],
    steps: [
      'Download the CSV. The rows are in the order they were written, oldest first.',
      'Start with prev_hash = 64 zeros.',
      'For each row build the object {received_at, price_id, verdict, believed_usd, table_version}, using null for an empty believed_usd and for an empty table_version.',
      'Serialize it as JSON with the keys sorted, no whitespace, then take SHA-256 of prev_hash concatenated with that string, lower-case hex.',
      'That is the row_hash in the last column. Use it as prev_hash for the next row.',
      'The hash of the last row is the head published at /api/integrity.',
    ],
  },
  gap: {
    file: '/api/export/gap.csv',
    projection: ['received_at', 'counts', 'ranking', 'table_version'],
    steps: [
      'Download the CSV. The six category columns are the counts object, keyed by the column name; an empty cell means the key is absent, not zero.',
      'The rank_1 … rank_6 columns are the ranking array, in order, with empty cells dropped.',
      'Build {received_at, counts, ranking, table_version} and hash it exactly as for corrections.csv.',
    ],
  },
  survey: {
    file: '/api/export/survey.csv',
    projection: ['received_at', 'channel', 'ranking', 'unasked', 'lead', 'decide', 'clinicians', 'context', 'survey_version'],
    steps: [
      'Download the CSV. rank_1 … rank_5 are the ranking array in order.',
      'The context object holds the ctx_ columns for the field set in force at that row\'s survey_version: see the projection table at /api/integrity. Every field in that set is present, with null where the cell is empty.',
      'clinicians is a number or null. Build {received_at, channel, ranking, unasked, lead, decide, clinicians, context, survey_version} and hash it exactly as for corrections.csv.',
    ],
  },
};
