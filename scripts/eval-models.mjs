/* ==========================================================================
   WHICH MODEL READS A PATIENT'S OWN WORDS BEST — AND FAST ENOUGH

   The same corpus (data/test-fixtures/map-eval.json) through the same prompt
   (lib/map-model.ts) and the same guarantees (applyModel: only a phrase the
   rules left blank, only an id the catalog holds, never a price), once per
   model. What comes out is the table in data/test-fixtures/READER-EVAL.md:
   precision, recall, F1, false positives, p50/p95 latency and tokens.

   This harness talks to OpenAI directly rather than through the running
   worker, because the question is the MODEL, and going direct is the only way
   to time one call and read its token usage. The pieces it imports are the
   ones the worker runs: parseJourney, catalogFor, candidatesOf, rulesReadOf,
   SYSTEM_PROMPT, buildUserPrompt, parseModelJson, applyModel. The one thing it
   rebuilds is the table, because lib/table.ts imports JSON through the '@/'
   alias that only the bundler resolves; the rebuild is the same two lines
   (summable, priced) and the same synonym merge, and the row count is asserted
   against the count the app ships with, so a divergence fails loudly.

   No figure in here is a price and no price is ever sent to a model.

   Usage:
     set -a; . ~/.config/precision-federal/openai.env; set +a
     node scripts/eval-models.mjs                          # all four models
     node scripts/eval-models.mjs --models gpt-5.4-mini    # one
     node scripts/eval-models.mjs --limit 40 --concurrency 6
     node scripts/eval-models.mjs --effort medium --append   # a second table under the first
   ========================================================================== */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseJourney } from '../lib/mapper.ts';
import { catalogFor, candidatesOf, rulesReadOf, SYSTEM_PROMPT, buildUserPrompt, parseModelJson, applyModel } from '../lib/map-model.ts';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const MODELS = arg('models', 'gpt-5.4-nano,gpt-5.4-mini,gpt-5.4,gpt-5.5').split(',').map((s) => s.trim()).filter(Boolean);
const EFFORT = arg('effort', 'low');
const LIMIT = Number(arg('limit', '0')) || 0;
const CONCURRENCY = Number(arg('concurrency', '6')) || 6;
const TIMEOUT_MS = Number(arg('timeout', '30000')) || 30000;
const OUT = arg('out', null);
const MD = arg('md', fileURLToPath(new URL('../data/test-fixtures/READER-EVAL.md', import.meta.url)));
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('no OPENAI_API_KEY in the environment: set -a; . ~/.config/precision-federal/openai.env; set +a'); process.exit(2); }

/* ---- the table, exactly as lib/table.ts builds it (SELECTABLE) ---- */
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
// lib/table.ts concatenates data/prices.json with every additions file before it filters. Any
// additions file this harness does not read is a row the app can price and the eval cannot, so
// the fixture check below fails loudly rather than quietly scoring against a smaller catalog.
const ADDITIONS = ['../data/prices-additions-2026-09-09.json'];
const raw = JSON.parse(readFileSync(here('../data/prices.json'), 'utf8'));
for (const a of ADDITIONS) {
  try { raw.items.push(...JSON.parse(readFileSync(here(a), 'utf8')).items); }
  catch (e) { console.error(`additions file ${a} could not be read: ${e.message}`); process.exit(2); }
}
const extra = JSON.parse(readFileSync(here('../data/synonyms.json'), 'utf8')).synonyms ?? {};
const synonymsFor = (r) => {
  const out = []; const seen = new Set();
  for (const s of [...(r.plain_language_synonyms ?? []), ...(extra[r.id] ?? [])]) {
    const k = s.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(s.trim());
  }
  return out;
};
const SELECTABLE = raw.items
  .filter((r) => r.summable !== false && r.value_usd !== null)
  .map((r) => ({ id: r.id, label: r.label, synonyms: synonymsFor(r), valueUsd: r.value_usd, outOfPocketUsd: r.out_of_pocket_usd ?? null, basis: 'allowed', attribution: 'gross', year: r.year, geography: r.geography ?? '', population: r.population ?? '', coverage: r.coverage_statement ?? '', sourceTitle: r.source_title ?? '', sourceUrl: r.source_url ?? '', confidence: r.confidence ?? 'REPORTED', code: r.code }));
const byIdAll = new Set(SELECTABLE.map((i) => i.id));
const CATALOG = catalogFor(SELECTABLE);

const fixture = JSON.parse(readFileSync(here('../data/test-fixtures/map-eval.json'), 'utf8'));
// Every expectation must name a row the app can actually price, or the score is measured against
// a catalog that does not exist.
const orphan = [...new Set(fixture.cases.flatMap((c) => c.expect))].filter((id) => !byIdAll.has(id));
if (orphan.length) { console.error(`the fixture expects ${orphan.length} id(s) the table does not hold: ${orphan.join(', ')}`); process.exit(2); }
console.log(`catalog: ${SELECTABLE.length} selectable rows (data/prices.json + ${ADDITIONS.length} additions file(s))`);
const CASES = LIMIT ? fixture.cases.slice(0, LIMIT) : fixture.cases;

/* ---- one call ---- */
async function ask(model, system, user) {
  const started = Date.now();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        reasoning_effort: EFFORT,
        response_format: { type: 'json_object' },
        max_completion_tokens: 1500,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    const ms = Date.now() - started;
    if (!r.ok) return { ms, error: `${r.status} ${(await r.text()).slice(0, 160)}` };
    const data = await r.json();
    return {
      ms,
      text: data?.choices?.[0]?.message?.content || '',
      model: data.model || model,
      promptTokens: data?.usage?.prompt_tokens ?? null,
      completionTokens: data?.usage?.completion_tokens ?? null,
    };
  } catch (e) {
    return { ms: Date.now() - started, error: String(e.message || e).slice(0, 160) };
  } finally { clearTimeout(t); }
}

const pct = (n, d) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);
const quantile = (xs, q) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1) + 0.5))];
};

/* ---- one model over the whole corpus ---- */
async function runModel(model) {
  const rows = new Array(CASES.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const k = next++;
      if (k >= CASES.length) return;
      const c = CASES[k];
      const segments = parseJourney(c.story, SELECTABLE);
      const candidates = candidatesOf(segments);
      const alreadyRead = rulesReadOf(segments);
      const rulesIds = new Set(segments.filter((s) => s.result.item).map((s) => s.result.item.id));
      if (!candidates.length) {
        rows[k] = { id: c.id, kind: c.kind, story: c.story, expect: c.expect, rules: [...rulesIds], both: [...rulesIds], added: [], flags: [], ms: 0, skipped: 'the rules read every phrase' };
        continue;
      }
      const user = buildUserPrompt(CATALOG, candidates.map((i) => segments[i].raw), c.story, alreadyRead);
      const out = await ask(model, SYSTEM_PROMPT, user);
      if (out.error) {
        rows[k] = { id: c.id, kind: c.kind, story: c.story, expect: c.expect, rules: [...rulesIds], both: [...rulesIds], added: [], flags: [], ms: out.ms, error: out.error };
        continue;
      }
      const applied = applyModel(segments, candidates, parseModelJson(out.text), SELECTABLE, alreadyRead);
      const both = new Set(applied.segments.filter((s) => s.result.item).map((s) => s.result.item.id));
      rows[k] = {
        id: c.id, kind: c.kind, story: c.story, expect: c.expect,
        rules: [...rulesIds], both: [...both], added: [...both].filter((x) => !rulesIds.has(x)),
        refused: applied.refused, flags: applied.flags.map((f) => ({ raw: f.raw, ruleId: f.ruleId, flag: f.flag })),
        ms: out.ms, promptTokens: out.promptTokens, completionTokens: out.completionTokens, servedBy: out.model,
      };
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const t = { rules: { tp: 0, fp: 0, fn: 0 }, both: { tp: 0, fp: 0, fn: 0 } };
  const falsePositives = [];
  const perKind = {};
  // A flag is scored against the same expectations: a flag on a rules id the sentence does NOT
  // name is a true report; a flag on a unit the sentence really does name is a false alarm.
  let flagTrue = 0, flagFalse = 0;
  const flagList = [];
  for (const r of rows) {
    const exp = new Set(r.expect);
    for (const [which, ids] of [['rules', r.rules], ['both', r.both]]) {
      const set = new Set(ids);
      const tp = [...set].filter((x) => exp.has(x)).length;
      t[which].tp += tp; t[which].fp += set.size - tp; t[which].fn += [...exp].filter((x) => !set.has(x)).length;
    }
    for (const f of r.flags ?? []) {
      const right = f.ruleId != null && exp.has(f.ruleId);
      if (right) flagFalse++; else flagTrue++;
      flagList.push({ id: r.id, kind: r.kind, raw: f.raw, ruleId: f.ruleId, flag: f.flag, rulesWasWrong: !right });
    }
    const wrong = r.both.filter((x) => !exp.has(x));
    if (wrong.length) falsePositives.push({ id: r.id, kind: r.kind, story: r.story, wrong, expect: r.expect, fromModel: wrong.filter((x) => r.added.includes(x)) });
    const k = perKind[r.kind] ??= { cases: 0, tp: 0, fp: 0, fn: 0 };
    k.cases++;
    const set = new Set(r.both);
    const tp = [...set].filter((x) => exp.has(x)).length;
    k.tp += tp; k.fp += set.size - tp; k.fn += [...exp].filter((x) => !set.has(x)).length;
  }
  const lat = rows.filter((r) => r.ms > 0 && !r.error).map((r) => r.ms);
  const report = (x) => ({ precision: pct(x.tp, x.tp + x.fp), recall: pct(x.tp, x.tp + x.fn), f1: pct(2 * x.tp, 2 * x.tp + x.fp + x.fn), ...x });
  return {
    model, effort: EFFORT, cases: rows.length,
    rulesOnly: report(t.rules), modelPlusRules: report(t.both),
    errors: rows.filter((r) => r.error).length,
    errorSamples: rows.filter((r) => r.error).slice(0, 3).map((r) => r.error),
    idsRefusedAsOffCatalog: rows.flatMap((r) => r.refused ?? []),
    flagsRaised: rows.flatMap((r) => r.flags ?? []).length,
    flagsOnAWrongRulesAnswer: flagTrue, flagsOnARightRulesAnswer: flagFalse,
    flagPrecision: pct(flagTrue, flagTrue + flagFalse),
    flagRecallOfKnownWrong: pct(flagTrue, rows.filter((r) => r.rules.some((x) => !new Set(r.expect).has(x))).length),
    flagList,
    latencyMs: { p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), max: lat.length ? Math.max(...lat) : null, calls: lat.length },
    tokens: {
      prompt: rows.reduce((a, r) => a + (r.promptTokens || 0), 0),
      completion: rows.reduce((a, r) => a + (r.completionTokens || 0), 0),
    },
    perKind: Object.fromEntries(Object.entries(perKind).map(([k, v]) => [k, { ...v, precision: pct(v.tp, v.tp + v.fp), recall: pct(v.tp, v.tp + v.fn) }])),
    falsePositives, rows,
  };
}

const results = [];
for (const m of MODELS) {
  process.stdout.write(`\n${m} (effort ${EFFORT}) over ${CASES.length} sentences … `);
  const r = await runModel(m);
  results.push(r);
  console.log(`F1 ${r.modelPlusRules.f1}%  precision ${r.modelPlusRules.precision}%  recall ${r.modelPlusRules.recall}%  fp ${r.modelPlusRules.fp}  p50 ${r.latencyMs.p50}ms  p95 ${r.latencyMs.p95}ms  errors ${r.errors}`);
}

const rulesRow = results[0]?.rulesOnly;
const line = (r) => `| ${r.model} | ${r.modelPlusRules.precision}% | ${r.modelPlusRules.recall}% | **${r.modelPlusRules.f1}%** | ${r.modelPlusRules.fp} | ${r.latencyMs.p50} | ${r.latencyMs.p95} | ${r.tokens.prompt.toLocaleString()} / ${r.tokens.completion.toLocaleString()} | ${r.errors} |`;
const md = `${process.argv.includes('--append') ? '#' : ''}# The reader: which model, measured

Corpus: \`data/test-fixtures/map-eval.json\` — ${CASES.length} sentences, ${fixture.cases.reduce((a, c) => a + c.expect.length, 0)} expected units, ${fixture.cases.filter((c) => !c.expect.length).length} sentences that must produce nothing.
Harness: \`scripts/eval-models.mjs\`, reasoning effort \`${EFFORT}\`, run ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z.
Same prompt, same catalog (${SELECTABLE.length} selectable rows), same guarantees for every model: the model may only fill a phrase the rules left blank, only with an id the catalog holds, and never sees or returns a figure.

| reader | precision | recall | F1 | false positives | p50 ms | p95 ms | tokens in / out | errors |
|---|---|---|---|---|---|---|---|---|
| rules only (no model) | ${rulesRow?.precision}% | ${rulesRow?.recall}% | **${rulesRow?.f1}%** | ${rulesRow?.fp} | — | — | — | — |
${results.map(line).join('\n')}

Precision is the number that matters: a wrong unit puts a federal figure on the page for care the person never had.

## By kind of sentence (model + rules)

| kind | ${results.map((r) => r.model).join(' | ')} |
|---|${results.map(() => '---').join('|')}|
${[...new Set(results.flatMap((r) => Object.keys(r.perKind)))].map((k) => `| ${k} (${results[0].perKind[k]?.cases ?? 0}) | ${results.map((r) => `p ${r.perKind[k]?.precision ?? '—'}% / r ${r.perKind[k]?.recall ?? '—'}%`).join(' | ')} |`).join('\n')}

## Every false positive, per model

${results.map((r) => `### ${r.model} — ${r.falsePositives.length} sentence(s) carried a unit that should not be there\n\n${r.falsePositives.length ? r.falsePositives.map((f) => `- **${f.id}** (${f.kind}) \`${f.story}\`\n  - produced: ${f.wrong.join(', ')}${f.fromModel.length ? ` (from the model: ${f.fromModel.join(', ')})` : ' (from the rules)'}\n  - expected: ${f.expect.length ? f.expect.join(', ') : 'nothing'}`).join('\n') : '(none)'}`).join('\n\n')}

## Flags the model raised about the rules (report only, never applied)

| reader | flags | on a rules answer that IS wrong | on one that is right | flag precision | share of the ${'${'}results[0].falsePositives.filter((f) => !f.fromModel.length).length} wrong-rules sentences flagged |
|---|---|---|---|---|---|
${results.map((r) => `| ${r.model} | ${r.flagsRaised} | ${r.flagsOnAWrongRulesAnswer} | ${r.flagsOnARightRulesAnswer} | ${r.flagPrecision ?? '—'}% | ${r.flagRecallOfKnownWrong ?? '—'}% |`).join('\n')}

Every flag raised (the strongest reader):

${results.length ? (results.find((r) => r.flagList.length) ?? results[0]).flagList.map((f) => `- **${f.id}** (${f.kind}) rules said \`${f.ruleId}\` for "${f.raw}" — flag: *${f.flag}* ${f.rulesWasWrong ? '✅ the rules were wrong' : '❌ false alarm'}`).join('\n') || '(none)' : ''}

Full rows, including every flag with its phrase: ${OUT ?? '(re-run with --out <path>)'}
`;
if (process.argv.includes('--append')) appendFileSync(MD, `\n\n---\n\n${md}`); else writeFileSync(MD, md);
console.log(`\ntable -> ${MD}`);
if (OUT) { writeFileSync(OUT, JSON.stringify({ effort: EFFORT, cases: CASES.length, results }, null, 2)); console.log(`rows  -> ${OUT}`); }
