/* ==========================================================================
   DOES THE AI READER ACTUALLY READ BETTER THAN THE RULES?

   Every sentence in data/test-fixtures/map-eval.json (185 of them as of
   2026-09-09), each with the set of units of care a careful reader would say
   it names. Every sentence goes to
   POST /api/map once. That one answer carries both readings, because the AI
   reader is only ever allowed to FILL a phrase the rules left blank and is
   never allowed to overrule one they answered:

     rules only   = the ids on segments whose source is 'rules'
     model + rules = every id on the answer

   So the difference between the two columns is exactly what the model added,
   and any id it added that should not be there shows up as lost precision.

   Counts and order are ignored. Segmentation differs between the two readers
   and the question here is which units were found, not how the sentence was
   cut. Thirty-seven cases expect NOTHING — a wait, a symptom, a feeling, care
   refused or denied or skipped, care someone else had, care only wondered
   about. A unit produced there is a false positive, which is the right and
   loudest way for an override failure to show up in a number.

   The `kind` on each case groups the sentences (lay, count, wait, symptom,
   not-received, mixed, typo, place, hypothetical, demo) so precision can be
   read per category rather than as one blurred average. Cases 1-30 are the
   original set, kept verbatim so a number measured tonight is comparable with
   one measured before the corpus grew: --thirty scores that subset alone.

   Usage: WL_BASE=http://127.0.0.1:8862 node scripts/eval-mapper.mjs
          [--out runs/…/eval.json] [--limit N] [--kind lay,typo] [--thirty]
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = (process.env.WL_BASE || 'http://127.0.0.1:8862').replace(/\/$/, '');
const outAt = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
const argOf = (n) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : null);
const fixture = JSON.parse(readFileSync(new URL('../data/test-fixtures/map-eval.json', import.meta.url), 'utf8'));
const onlyKinds = argOf('kind') ? new Set(argOf('kind').split(',').map((s) => s.trim())) : null;
const limit = Number(argOf('limit') || 0) || 0;
let CASES = fixture.cases;
if (process.argv.includes('--thirty')) CASES = CASES.filter((c) => c.id <= 30);
if (onlyKinds) CASES = CASES.filter((c) => onlyKinds.has(c.kind));
if (limit) CASES = CASES.slice(0, limit);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function map(story) {
  const res = await fetch(`${BASE}/api/map`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ story }),
  });
  if (!res.ok) throw new Error(`/api/map -> ${res.status}`);
  const body = await res.json();
  if (!body.ok) throw new Error(`/api/map -> ${JSON.stringify(body).slice(0, 120)}`);
  return body;
}

/** The rules alone, straight from the pricing endpoint — a second witness that
 *  the 'rules' half of /api/map is the same computation the product prices with. */
async function price(story) {
  const res = await fetch(`${BASE}/api/price`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ story }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return new Set((body.segments || []).map((s) => s.itemId).filter(Boolean));
}

const score = (produced, expected) => {
  const tp = [...produced].filter((x) => expected.has(x)).length;
  return { tp, fp: produced.size - tp, fn: [...expected].filter((x) => !produced.has(x)).length };
};
const pct = (n, d) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

const totals = { rules: { tp: 0, fp: 0, fn: 0 }, both: { tp: 0, fp: 0, fn: 0 } };
const rows = [];
const perKind = {};
const falsePositives = [];
const flagsRaised = [];
let modelAnswered = 0, modelsSeen = new Set(), filled = 0, refused = 0, disagreed = 0;

for (const c of CASES) {
  let body;
  try { body = await map(c.story); }
  catch (e) { console.log(`ERR   ${c.id}  ${e.message}`); continue; }

  const expected = new Set(c.expect);
  const segs = body.segments || [];
  const rulesIds = new Set(segs.filter((s) => s.source === 'rules' && s.itemId).map((s) => s.itemId));
  const bothIds = new Set(segs.filter((s) => s.itemId).map((s) => s.itemId));
  const added = [...bothIds].filter((x) => !rulesIds.has(x));

  if (body.model) { modelAnswered++; modelsSeen.add(body.model); }
  filled += body.filled || 0;
  refused += body.refused || 0;

  const viaPrice = await price(c.story);
  const agrees = viaPrice ? [...rulesIds].every((x) => viaPrice.has(x)) && [...viaPrice].every((x) => rulesIds.has(x)) : null;
  if (agrees === false) disagreed++;

  const r = score(rulesIds, expected);
  const b = score(bothIds, expected);
  for (const k of ['tp', 'fp', 'fn']) { totals.rules[k] += r[k]; totals.both[k] += b[k]; }
  const kind = c.kind || 'unlabelled';
  const pk = (perKind[kind] ??= { cases: 0, tp: 0, fp: 0, fn: 0 });
  pk.cases++; for (const k of ['tp', 'fp', 'fn']) pk[k] += b[k];
  const wrong = [...bothIds].filter((x) => !expected.has(x));
  if (wrong.length) falsePositives.push({ id: c.id, kind, story: c.story, wrong, expect: [...expected], fromModel: wrong.filter((x) => added.includes(x)) });
  for (const f of body.flags || []) flagsRaised.push({ id: c.id, ...f });

  rows.push({
    id: c.id, story: c.story, expect: [...expected], rules: [...rulesIds], both: [...bothIds],
    addedByModel: added, model: body.model, cached: Boolean(body.cached), note: body.note ?? null,
    rulesScore: r, bothScore: b, rulesMatchesPriceEndpoint: agrees,
  });
  const mark = added.length ? `  +model: ${added.join(', ')}` : '';
  console.log(`${String(c.id).padStart(2)}  rules ${r.tp}/${expected.size || 0}·fp${r.fp}   both ${b.tp}/${expected.size || 0}·fp${b.fp}${mark}`);
  await sleep(250);
}

const report = (t) => ({
  precision: pct(t.tp, t.tp + t.fp), recall: pct(t.tp, t.tp + t.fn),
  f1: pct(2 * t.tp, 2 * t.tp + t.fp + t.fn), ...t,
});
const summary = {
  base: BASE, cases: CASES.length, fixtureVersion: fixture._version,
  modelAnsweredOn: modelAnswered, models: [...modelsSeen],
  phrasesFilledByModel: filled, idsRefusedAsOffCatalog: refused,
  rulesHalfDisagreedWithPriceEndpoint: disagreed,
  rulesOnly: report(totals.rules), modelPlusRules: report(totals.both),
  perKind: Object.fromEntries(Object.entries(perKind).map(([k, v]) => [k, { ...v, precision: pct(v.tp, v.tp + v.fp), recall: pct(v.tp, v.tp + v.fn) }])),
  falsePositives, flagsRaised,
  rows,
};

console.log(`\n=== MICRO-AVERAGED OVER ${CASES.length} SENTENCES ===`);
console.log(`rules only     precision ${summary.rulesOnly.precision}%  recall ${summary.rulesOnly.recall}%  F1 ${summary.rulesOnly.f1}%  (tp ${totals.rules.tp} fp ${totals.rules.fp} fn ${totals.rules.fn})`);
console.log(`model + rules  precision ${summary.modelPlusRules.precision}%  recall ${summary.modelPlusRules.recall}%  F1 ${summary.modelPlusRules.f1}%  (tp ${totals.both.tp} fp ${totals.both.fp} fn ${totals.both.fn})`);
console.log(`the model answered on ${modelAnswered}/${CASES.length} sentences (${[...modelsSeen].join(', ') || 'none'}); it filled ${filled} phrase(s) and offered ${refused} id(s) the catalog does not hold`);
if (disagreed) console.log(`🔴 the rules half of /api/map disagreed with /api/price on ${disagreed} sentence(s)`);

console.log('\nby kind (model + rules):');
for (const [k, v] of Object.entries(summary.perKind).sort()) {
  console.log(`  ${k.padEnd(14)} ${String(v.cases).padStart(3)} sentences   precision ${String(v.precision ?? '—').padStart(5)}%  recall ${String(v.recall ?? '—').padStart(5)}%  (fp ${v.fp} fn ${v.fn})`);
}
if (falsePositives.length) {
  console.log(`\nFALSE POSITIVES — ${falsePositives.length} sentence(s) carried a unit that should not be there:`);
  for (const f of falsePositives) console.log(`  ${String(f.id).padStart(3)} [${f.kind}] ${f.wrong.join(', ')}${f.fromModel.length ? ' (model)' : ' (rules)'}  <- ${f.story.slice(0, 88)}`);
}
if (flagsRaised.length) {
  console.log(`\nflags the model raised about the rules (report only, never applied): ${flagsRaised.length}`);
  for (const f of flagsRaised.slice(0, 15)) console.log(`  ${String(f.id).padStart(3)} ${f.ruleId ?? '(blank)'} <- "${String(f.raw).slice(0, 50)}": ${f.flag}`);
}

if (outAt) { writeFileSync(outAt, JSON.stringify(summary, null, 2)); console.log(`\nfull rows -> ${outAt}`); }
