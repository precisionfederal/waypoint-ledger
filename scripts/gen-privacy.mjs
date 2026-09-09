/* ==========================================================================
   scripts/gen-privacy.mjs — the privacy page is generated from the schema.

   WHY THIS EXISTS. A privacy page written as prose drifts from the database
   the moment someone adds a column. On 2026-09-09 an adversary proved exactly
   that: /privacy said a correction records "no journey ... and no cookie",
   while the handler had been writing `journey_id` and, for a signed-in person,
   `user_id`, since migration 0003. Prose cannot be trusted to keep a promise
   that only SQL enforces.

   So the "what we keep" table on /privacy is not written. It is DERIVED, at
   build time, from the things that decide the answer:
     - every column that exists            -> cf/migrations/*.sql
     - what each write path accepts        -> the real validators, executed
     - what is inside the integrity chain  -> PUBLISHED in cf/functions/api/_hash.js
     - what leaves in the CSV              -> exportRows() in export/[kind].js
     - what a column means, in one line    -> data/column-glossary.json

   AND IT FAILS THE BUILD, on purpose, when:
     - a column has no gloss (a new field cannot ship undescribed)
     - a gloss names a column that no longer exists
     - a table is not attached to an endpoint on this page
     - a validator keeps a field this script cannot place in a column
     - a published or exported field cannot be mapped to a column
   `cf/build-static.sh` runs it with no error suppression, so a red generator
   is a red build.

   Output: app/privacy/generated.ts (committed, so `next build` and `tsc` never
   depend on this script having run).
   Run: node scripts/gen-privacy.mjs   [--check]
   ========================================================================== */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'app/privacy/generated.ts');
const GLOSSARY = join(ROOT, 'data/column-glossary.json');
/** The one line that legitimately differs between two runs on different days. */
export const GENERATED_ON_LINE = /PRIVACY_GENERATED_ON = "[^"]+"/;
/** Every failure below is a build failure. It throws so the test suite can plant a
 *  violation and prove the guard fires; the CLI at the bottom turns it into exit 1. */
const die = (msg) => { throw new Error(msg); };

/* ---------------------------------------------------------------- schema -- */

/** Split on commas at paren depth 0, so CHECK (x IN ('a','b')) stays one part. */
function splitTop(text) {
  const parts = []; let depth = 0, buf = '', q = null;
  for (const ch of text) {
    if (q) { buf += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; buf += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}

const CONSTRAINT = /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i;

/** Every table and column D1 actually has, in migration order. */
export function readSchema(dir = join(ROOT, 'cf/migrations')) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const tables = new Map();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8').replace(/^\s*--.*$/gm, '');
    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][\w]*)\s*\(([\s\S]*?)\)\s*;/g)) {
      const name = m[1];
      const cols = [];
      for (const part of splitTop(m[2])) {
        const line = part.trim().replace(/\s+/g, ' ');
        if (!line || CONSTRAINT.test(line)) continue;
        const col = line.split(' ')[0].replace(/["`]/g, '');
        cols.push({ column: col, notNull: /NOT NULL/i.test(line) || /PRIMARY KEY/i.test(line), since: f });
      }
      if (!tables.has(name)) tables.set(name, cols);
    }
    for (const m of sql.matchAll(/ALTER\s+TABLE\s+([A-Za-z_][\w]*)\s+ADD\s+COLUMN\s+([A-Za-z_][\w]*)([^;]*);/g)) {
      const t = tables.get(m[1]);
      if (!t) die(`${f} adds a column to ${m[1]}, a table no migration creates.`);
      if (!t.some((c) => c.column === m[2])) t.push({ column: m[2], notNull: /NOT NULL/i.test(m[3]), since: f });
    }
  }
  return { files, tables };
}

/* ------------------------------------------------- the real write paths -- */

/** Bundle the functions (they import JSON and TS) and import them, so the field
 *  lists below come from the code that runs, never from a copy of it. */
function loadWritePaths() {
  const esbuild = join(ROOT, 'node_modules/.bin/esbuild');
  if (!existsSync(esbuild)) die('node_modules/.bin/esbuild is missing. Run npm install.');
  const tmp = mkdtempSync(join(tmpdir(), 'wl-privacy-'));
  const p = (rel) => JSON.stringify(join(ROOT, rel));
  const entry = join(tmp, 'entry.mjs');
  writeFileSync(entry, [
    `export { validateCorrection, PRICE_IDS } from ${p('cf/functions/api/corrections.js')};`,
    `export { validateGap, CATEGORY_IDS } from ${p('cf/functions/api/gap.js')};`,
    `export { changeOf } from ${p('cf/functions/api/changes.js')};`,
    `export { validateSurvey } from ${p('cf/functions/api/survey.js')};`,
    `export { validateInterview } from ${p('cf/functions/api/interview.js')};`,
    `export { exportRows } from ${p('cf/functions/api/export/[kind].js')};`,
    `export { PUBLISHED, SURVEY_CTX_KEYS } from ${p('cf/functions/api/_hash.js')};`,
    `export { validateJourney } from ${p('lib/price-api.ts')};`,
    `export { TABLE, TABLE_VERSION } from ${p('lib/table.ts')};`,
    `export * as DEF from ${p('lib/survey-def.js')};`,
  ].join('\n'));
  const out = join(tmp, 'bundle.mjs');
  try {
    execFileSync(esbuild, [entry, '--bundle', '--format=esm', '--platform=node', '--log-level=error', '--outfile=' + out], { stdio: ['ignore', 'ignore', 'inherit'] });
  } catch { rmSync(tmp, { recursive: true, force: true }); die('esbuild could not bundle the write paths.'); }
  return import(pathToFileURL(out).href).then((m) => { rmSync(tmp, { recursive: true, force: true }); return m; });
}

/* ------------------------------------------------------------ the maps --- */

/* A validator names its fields in camelCase; a column is snake_case, and some
   fields deliberately do not survive the trip (submitterId becomes a one-way
   per-figure hash). This is the only hand-written map in the file, and every
   entry is checked against the schema below: an unmapped field is a build
   failure, never a silent omission from the page. */
const LANDS_IN = {
  corrections: { priceId: 'price_id', verdict: 'verdict', believedValueUsd: 'believed_usd', note: 'note', priceTableVersion: 'table_version', journeyId: 'journey_id', submitterId: 'submitter_hash', receivedAt: 'received_at' },
  gap_reports: { counts: 'counts_json', ranking: 'ranking_json', note: 'note', context: 'context_json', tableVersion: 'table_version', receivedAt: 'received_at' },
  survey_responses: { ranking: 'ranking_json', unasked: 'unasked', lead: 'lead', decide: 'decide', clinicians: 'clinicians', context: 'context_json', sentence: 'sentence_enc', channel: 'channel', surveyVersion: 'survey_version', receivedAt: 'received_at' },
  interviews: { consent: 'consent', name: 'name_enc', answers: 'answers_enc', followUp: 'follow_up', email: 'email_enc', channel: 'channel', receivedAt: 'received_at' },
  journeys: { entries: 'entries_json', title: 'title' },
};

/** A field of the published projection (_hash.js) -> its column. */
const CHAINED_AS = {
  corrections: { received_at: 'received_at', price_id: 'price_id', verdict: 'verdict', believed_usd: 'believed_usd', table_version: 'table_version' },
  gap_reports: { received_at: 'received_at', counts: 'counts_json', ranking: 'ranking_json', table_version: 'table_version' },
  survey_responses: { received_at: 'received_at', channel: 'channel', ranking: 'ranking_json', unasked: 'unasked', lead: 'lead', decide: 'decide', clinicians: 'clinicians', context: 'context_json', survey_version: 'survey_version' },
  interviews: { received_at: 'received_at', consent: 'consent', channel: 'channel', follow_up: 'follow_up' },
};

/** A CSV header (export/[kind].js) -> its column. */
function csvColumn(table, header, categoryIds) {
  if (header === 'row_hash') return 'row_hash';
  if (/^rank_\d+$/.test(header)) return 'ranking_json';
  if (header.startsWith('ctx_')) return 'context_json';
  if (table === 'gap_reports' && categoryIds.includes(header)) return 'counts_json';
  return CHAINED_AS[table]?.[header] ?? null;
}

/* Every endpoint that writes, and the one table it writes. Every table in the
   schema must appear here exactly once, so a new table cannot ship without a
   place on this page. `accepts` is filled by running the real validator. */
const ENDPOINTS = [
  { id: 'corrections', method: 'POST', path: '/api/corrections', table: 'corrections', handler: 'cf/functions/api/corrections.js', validator: 'correction',
    what: 'You mark a published federal figure right or wrong.',
    publicly: 'The count for each figure is public at /api/corrections and every published field is in the CSV. Your note is not.' },
  { id: 'gap', method: 'POST', path: '/api/gap', table: 'gap_reports', handler: 'cf/functions/api/gap.js', validator: 'gap',
    what: 'You report care you needed and did not get.',
    publicly: 'The counts and the ranking are public at /api/gap and in the CSV. Your note is not.' },
  { id: 'survey', method: 'POST', path: '/api/survey', table: 'survey_responses', handler: 'cf/functions/api/survey.js', validator: 'survey',
    what: 'You rank which burden weighed most.',
    publicly: 'The counts are public at /api/survey and in the CSV. Your sentence is not, and a cell too small to be safe is withheld.' },
  { id: 'interview', method: 'POST', path: '/api/interview', table: 'interviews', handler: 'cf/functions/api/interview.js', validator: 'interview',
    what: 'You write out your own story in the interview form.',
    publicly: 'Only the number of interviews, their dates and how many people chose each consent are public. Nothing you wrote is served by any endpoint or carried by any export.' },
  { id: 'journeys', method: 'POST', path: '/api/journeys', table: 'journeys', handler: 'cf/functions/api/journeys.js', validator: 'journey',
    what: 'You press Save on a ledger to get a link to it.',
    publicly: 'Nothing here is public. A saved ledger opens for whoever holds its link, and for nobody else.' },
  { id: 'account', method: 'POST', path: '/api/auth/password/signup', table: 'users', handler: 'cf/functions/api/auth/password/signup.js',
    what: 'You make an optional account so a ledger follows you between devices.',
    publicly: 'Nothing about an account is public, ever.' },
  { id: 'passkey', method: 'POST', path: '/api/auth/register/verify', table: 'credentials', handler: 'cf/functions/api/auth/register/verify.js',
    what: 'You add a passkey to that account.',
    publicly: 'Nothing here is public.' },
  { id: 'session', method: 'POST', path: '/api/auth/password/login', table: 'sessions', handler: 'cf/functions/api/auth/password/login.js',
    what: 'You sign in, and the browser holds one cookie until you sign out.',
    publicly: 'Nothing here is public.' },
  { id: 'changes', method: 'POST', path: '/api/admin/changes', table: 'changes', handler: 'cf/functions/api/admin/changes.js',
    what: 'We publish "someone said this, so we changed that" on the register. Written by us, not by you.',
    publicly: 'The date, what was said, what changed and who is credited are shown on /register. Which interview it came from is not.' },
  { id: 'events', method: '—', path: 'every request', table: 'events', handler: 'cf/functions/api/_http.js',
    what: 'A daily count of how many times each endpoint was called. One number per day, nothing about who.',
    publicly: 'These totals are not public. They are a daily count with nothing about anyone in them.' },
  { id: 'agg', method: '—', path: 'every accepted row', table: 'agg', handler: ['cf/functions/api/_counters.js', 'cf/migrations/0006_agg.sql'],
    what: 'Nobody sends this. It is the register\'s own public totals, kept ready so the page reads as fast at a hundred thousand rows as at ten.',
    publicly: 'These are the same counts the register already serves. The table is a cache of them and holds nothing else.' },
  { id: 'canary', method: 'POST', path: '/api/health', table: 'canary', handler: 'cf/functions/api/health.js',
    what: 'Nobody sends this either. We write one row and delete it in the same breath, to prove the database is accepting writes.',
    publicly: 'Nothing here is public, and nothing here comes from anyone using the site.' },
  { id: 'integrity_heads', method: '—', path: 'every accepted row', table: 'integrity_heads', handler: 'cf/functions/api/_hash.js',
    what: 'The head of each tamper-evidence chain, so an outsider can check the register was not edited.',
    publicly: 'Every head is public at /api/integrity. Publishing it is the whole point: it is what an outsider recomputes to check we did not edit the register.' },
];

/* ------------------------------------------------------------- generate -- */

export async function model(opts = {}) {
  const { files, tables } = readSchema(opts.migrationsDir || join(ROOT, 'cf/migrations'));
  const M = await loadWritePaths();
  const DEF = M.DEF;

  const covered = ENDPOINTS.map((e) => e.table);
  for (const t of tables.keys()) {
    const n = covered.filter((x) => x === t).length;
    if (n !== 1) die(`table "${t}" is attached to ${n} endpoints on /privacy; it must be exactly 1. Add it to ENDPOINTS in scripts/gen-privacy.mjs.`);
  }
  for (const e of ENDPOINTS) if (!tables.has(e.table)) die(`ENDPOINTS names table "${e.table}", which no migration creates.`);
  for (const e of ENDPOINTS) {
    const candidates = Array.isArray(e.handler) ? e.handler : [e.handler];
    e.handler = candidates.find((h) => existsSync(join(ROOT, h)));
    if (!e.handler) die(`${e.id}: none of these files exists: ${candidates.join(', ')}`);
  }

  /* What each validator KEEPS, from the validator itself. These probe bodies are
     passed to pure functions and are never written anywhere; they exist so the
     code names its own fields instead of a human remembering to. */
  const priceId = [...M.PRICE_IDS][0];
  const ctxProbe = Object.fromEntries(Object.entries(DEF.CONTEXT).map(([k, v]) => [k, v.options[0]]));
  const probe = {
    correction: () => M.validateCorrection({ priceId, verdict: 'right', believedValueUsd: 1, note: 'probe', priceTableVersion: 'probe', journeyId: 'probe', submitterId: 'probe' }),
    gap: () => M.validateGap({ counts: { [M.CATEGORY_IDS[0]]: 1 }, ranking: [M.CATEGORY_IDS[0]], note: 'probe', context: { ageBand: 'probe', insurance: 'probe', region: 'probe', urbanicity: 'probe' }, tableVersion: 'probe' }),
    survey: () => M.validateSurvey({ ranking: DEF.BURDEN_IDS, unasked: DEF.BURDEN_IDS[0], lead: DEF.BURDEN_IDS[0], decide: DEF.DECIDER_IDS[0], clinicians: 1, context: ctxProbe, sentence: 'probe', channel: 'probe', surveyVersion: 'probe' }),
    interview: () => M.validateInterview({ consent: 'quote-by-name', name: 'probe', answers: { q1: 'probe', q2: 'probe', q3: 'probe' }, followUp: true, email: 'probe@example.org', channel: 'probe' }),
    journey: () => ({ record: M.validateJourney({ entries: [{ raw: 'probe', itemId: M.TABLE[0].id, times: 1 }], title: 'probe' }, M.TABLE) }),
  };

  const accepted = {};   // table -> [{ field, column|null }]
  for (const e of ENDPOINTS) {
    if (!e.validator) { accepted[e.table] = []; continue; }
    const r = probe[e.validator]();
    if (!r || r.error || !r.record) die(`${e.id}: the probe body was rejected by its own validator ("${r && r.error}"). Fix the probe in scripts/gen-privacy.mjs.`);
    const map = LANDS_IN[e.table] || {};
    accepted[e.table] = Object.keys(r.record).map((field) => {
      if (!(field in map)) die(`${e.id}: the validator keeps "${field}", which scripts/gen-privacy.mjs cannot place in a column. Add it to LANDS_IN and describe its column in data/column-glossary.json.`);
      const col = map[field];
      if (!tables.get(e.table).some((c) => c.column === col)) die(`${e.id}: LANDS_IN maps "${field}" to column "${col}", which ${e.table} does not have.`);
      return { field, column: col };
    });
  }

  /* Inside the chain, and out in the CSV — both read off the running code. */
  const chained = {}, exported = {};
  for (const [table, project] of Object.entries(M.PUBLISHED)) {
    chained[table] = new Set();
    for (const key of Object.keys(project({}))) {
      const col = CHAINED_AS[table]?.[key];
      if (!col) die(`_hash.js publishes "${key}" for ${table}; add it to CHAINED_AS in scripts/gen-privacy.mjs.`);
      chained[table].add(col);
    }
    chained[table].add('row_hash');
    chained[table].add('prev_hash');
  }
  /* The change log is served by changeOf() in changes.js, so ask that function which
     columns it hands out rather than remembering. Its keys ARE column names. */
  chained.changes = new Set(Object.keys(M.changeOf(Object.fromEntries(tables.get('changes').map((c) => [c.column, c.column])))));
  /* heads() in _hash.js serves all four of these at /api/integrity, which is the point of them. */
  chained.integrity_heads = new Set(['table_name', 'head_hash', 'row_count', 'updated_at']);
  /* The cached payload IS the public aggregate; the bookkeeping around it is not served. */
  chained.agg = new Set(['payload_json']);

  const CSV = { corrections: 'corrections', gap_reports: 'gap', survey_responses: 'survey' };
  for (const [table, kind] of Object.entries(CSV)) {
    exported[table] = new Set();
    for (const h of M.exportRows(kind, []).split('\n')[0].split(',')) {
      const col = csvColumn(table, h, M.CATEGORY_IDS);
      if (!col) die(`the ${kind} CSV publishes column "${h}"; teach csvColumn() in scripts/gen-privacy.mjs which database column it comes from.`);
      exported[table].add(col);
    }
  }

  /* One line of plain English per column, and no column without one. */
  const glossary = JSON.parse(readFileSync(opts.glossaryPath || GLOSSARY, 'utf8'));
  const gloss = glossary.columns || {};
  const missing = [], orphan = [];
  for (const [table, cols] of tables) for (const c of cols) if (!gloss[`${table}.${c.column}`]) missing.push(`${table}.${c.column}`);
  for (const k of Object.keys(gloss)) {
    const [t, c] = k.split('.');
    if (!tables.get(t) || !tables.get(t).some((x) => x.column === c)) orphan.push(k);
  }
  if (missing.length) die(`${missing.length} column(s) have no one-line description in data/column-glossary.json:\n  ` + missing.join('\n  ') + '\nA field nobody can describe is a field that must not ship.');
  if (orphan.length) die(`data/column-glossary.json describes column(s) that no longer exist:\n  ` + orphan.join('\n  '));

  /* THE ENCRYPTION COLUMN IS READ OFF THE HANDLER, NOT OFF THE COLUMN NAME.
     The dangerous direction is claiming protection we do not perform, so a column
     named _enc that its handler does not actually pass through encrypt() FAILS the
     build. The safe direction is free: a handler that encrypts a column with any
     other name is reported as encrypted without anyone remembering to say so.
     The chain hashes are not protection, they are the published proof itself, and a
     salt is random rather than secret; neither is dressed up as more than it is. */
  const CHAIN_COLUMNS = new Set(['prev_hash', 'row_hash', 'head_hash']);
  const encryptsIn = (source, col) => new RegExp('\\b' + col + '\\s*:\\s*(await\\s+)?encrypt\\s*\\(').test(source);
  const encryptionOf = (col, source, table) => {
    if (encryptsIn(source, col)) return 'encrypted at rest';
    if (col.endsWith('_enc')) die(`${table}.${col} is named as encrypted, but ${'its handler'} never passes it through encrypt(). Either encrypt it or rename the column: /privacy must not promise protection this code does not perform.`);
    if (CHAIN_COLUMNS.has(col) || col === 'password_salt') return 'no';
    return col.endsWith('_hash') ? 'one-way hash' : 'no';
  };

  const endpoints = ENDPOINTS.map((e) => {
    const cols = tables.get(e.table);
    const source = readFileSync(join(ROOT, e.handler), 'utf8');
    const notes = [];
    if (e.table === 'survey_responses') {
      const ctxExported = M.exportRows('survey', []).split('\n')[0].split(',').filter((h) => h.startsWith('ctx_')).map((h) => h.slice(4));
      const outside = ctxExported.filter((k) => !M.SURVEY_CTX_KEYS.includes(k));
      if (outside.length) notes.push(`The CSV publishes ${outside.map((k) => 'ctx_' + k).join(', ')}, which the integrity chain does not yet cover at this survey version. /integrity says which rows are covered.`);
    }
    return {
      id: e.id, method: e.method, path: e.path, table: e.table, handler: e.handler, what: e.what, publicly: e.publicly,
      fields: cols.map((c) => ({
        column: c.column,
        gloss: gloss[`${e.table}.${c.column}`],
        kept: c.notNull ? 'always' : 'only when it applies',
        encrypted: encryptionOf(c.column, source, e.table),
        published: (chained[e.table] || new Set()).has(c.column),
        exported: (exported[e.table] || new Set()).has(c.column),
        since: c.since,
      })),
      accepts: accepted[e.table],
      notes,
    };
  });

  const fingerprint = createHash('sha256')
    .update([...tables].map(([t, cs]) => t + ':' + cs.map((c) => c.column).join(',')).join('\n'))
    .digest('hex').slice(0, 12);
  const columnCount = [...tables.values()].reduce((n, cs) => n + cs.length, 0);

  return { files, tables, endpoints, fingerprint, columnCount, tableCount: tables.size };
}

export async function generate() {
  const { files, endpoints, fingerprint, columnCount, tableCount } = await model();
  const head = `/* GENERATED FILE — do not edit by hand. Written by scripts/gen-privacy.mjs.
 *
 * Every row below is read from cf/migrations/*.sql, from the write-path validators as they
 * actually run, from PUBLISHED in cf/functions/api/_hash.js and from exportRows() in
 * cf/functions/api/export/[kind].js. Change the database, run the generator; the page follows.
 * A column with no line in data/column-glossary.json fails the build (cf/build-static.sh).
 */
`;
  const body = [
    `export interface PrivacyField { column: string; gloss: string; kept: string; encrypted: string; published: boolean; exported: boolean; since: string }`,
    `export interface PrivacyAccepts { field: string; column: string }`,
    `export interface PrivacyEndpoint { id: string; method: string; path: string; table: string; handler: string; what: string; publicly: string; fields: PrivacyField[]; accepts: PrivacyAccepts[]; notes: string[] }`,
    ``,
    `export const PRIVACY_GENERATED_ON = ${JSON.stringify(new Date().toISOString().slice(0, 10))};`,
    `export const PRIVACY_MIGRATIONS = ${JSON.stringify(files)};`,
    `export const PRIVACY_SCHEMA_FINGERPRINT = ${JSON.stringify(fingerprint)};`,
    `export const PRIVACY_COLUMN_COUNT = ${columnCount};`,
    `export const PRIVACY_TABLE_COUNT = ${tableCount};`,
    `export const PRIVACY_ENDPOINTS: PrivacyEndpoint[] = ${JSON.stringify(endpoints, null, 1)};`,
    ``,
  ].join('\n');
  return head + body;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) await main();

async function main() {
 try {
  const text = await generate();
  if (process.argv.includes('--check')) {
    if (readFileSync(OUT, 'utf8').replace(GENERATED_ON_LINE, '') !== text.replace(GENERATED_ON_LINE, '')) {
      die('app/privacy/generated.ts is stale. Run: node scripts/gen-privacy.mjs');
    }
    console.log('privacy: generated.ts matches the schema');
  } else {
    writeFileSync(OUT, text);
    const columns = Number(text.match(/PRIVACY_COLUMN_COUNT = (\d+)/)[1]);
    const endpoints = (text.match(/"handler":/g) || []).length;
    console.log(`privacy: app/privacy/generated.ts — ${columns} columns across ${endpoints} endpoints`);
  }
 } catch (err) {
  console.error('gen-privacy: ' + err.message);
  process.exit(1);
 }
}
