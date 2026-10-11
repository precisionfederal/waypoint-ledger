/* AN ILLUSTRATIVE SAMPLE OF THE REGISTER — never real, never stored, never exported.

   Bo, 2026-09-09: "populate this page with realistic mock data ... think through real data
   simulated". The live register shows only what people actually sent. This file builds a
   plausible payload at N≈200 so the page can be SEEN at scale — by us, by a designer, by an
   agency asking "what does this become". It is rendered only at /register/preview under a
   banner that says so, and nothing here ever touches D1, KV, an export or the live route.
   Deterministic (seeded), so a screenshot is reproducible. */
import { TABLE } from './table';
import { BURDEN_IDS, DECIDER_IDS, CONTEXT, STATES } from './survey-def';
import gapData from '@/data/invisible-events.json';

export const SAMPLE_BANNER = 'Illustrative sample: not real answers. Simulated to show the page at scale. Nothing here was sent by anyone, and none of it is stored or exported.';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Draw n ranked orders of the five burdens from a soft preference, return the count table. */
function rankings(r: () => number, n: number, weights: number[]) {
  const first = Array(5).fill(0), last = Array(5).fill(0), sum = Array(5).fill(0);
  for (let k = 0; k < n; k++) {
    const keyed = weights.map((w, i) => ({ i, key: w * (0.35 + r()) }));
    keyed.sort((a, b) => b.key - a.key);
    keyed.forEach((e, pos) => { sum[e.i] += pos + 1; if (pos === 0) first[e.i]++; if (pos === 4) last[e.i]++; });
  }
  return BURDEN_IDS.map((burden, i) => ({ burden, rankedFirstBy: first[i], rankedLastBy: last[i], meanRank: n ? Math.round((sum[i] / n) * 10) / 10 : null }));
}

function spread(r: () => number, n: number, options: string[], weights: number[], notStated: number) {
  const out: Record<string, number> = {};
  const tot = weights.reduce((a, b) => a + b, 0);
  let left = n - notStated;
  options.forEach((o, i) => { const c = i === options.length - 1 ? left : Math.round(((n - notStated) * weights[i]) / tot); out[o] = Math.max(0, c); left -= out[o]; });
  if (notStated > 0) out['not stated'] = notStated;
  return out;
}

export function sampleRegister(seed = 20260910) {
  const r = rng(seed);
  const N = 212;
  const first = '2026-09-09T14:12:00.000Z', last = '2026-09-10T13:48:00.000Z';
  // Burden preference: care gone without and time lead; unpaid care is most often last.
  const pref = [1.0, 1.5, 0.9, 0.6, 1.7]; // oop, time, work, unpaid, forgone
  const ranking = rankings(r, N, pref);
  const female = 131, male = 74; // + 3 intersex + 4 prefer not (withheld under 11)
  const groups = [
    { sex: 'Female', n: female, ranking: rankings(r, female, [1.0, 1.5, 0.8, 0.7, 1.8]) },
    { sex: 'Male', n: male, ranking: rankings(r, male, [1.1, 1.4, 1.1, 0.5, 1.5]) },
  ];
  const stateOpts = STATES as string[];
  // 11+ threshold: a handful of large states clear it; the rest are withheld and counted.
  const stateCounts: Record<string, number> = { California: 24, Texas: 19, Florida: 14, 'New York': 13, Iowa: 12, Pennsylvania: 11 };
  const stated = Object.values(stateCounts).reduce((a, b) => a + b, 0);
  const withheldStateResponses = 61, notStatedState = N - stated - withheldStateResponses;
  const coverage = {
    age: spread(r, N, CONTEXT.age.options, [22, 41, 29, 8], 18),
    sex: { Female: female, Male: male, 'not stated': N - female - male },
    insurance: spread(r, N, CONTEXT.insurance.options, [46, 12, 17, 13, 7, 5], 21),
    region: spread(r, N, CONTEXT.region.options, [19, 27, 34, 20, 2], 24),
    state: { ...stateCounts, withheld: withheldStateResponses, 'not stated': notStatedState },
    stage: spread(r, N, CONTEXT.stage.options, [38, 49, 13], 15),
  };
  void stateOpts;
  const survey = {
    ok: true, n: N, firstAt: first, lastAt: last,
    channels: { advocate: 63, clinic: 27, linkedin: 41, ames: 22, prolific: 48, direct: 11 },
    ranking,
    coverage,
    rankingBySex: { min: 11, stated: female + male + 7, notStated: N - female - male - 7, groups, withheldGroups: 2, withheldResponses: 7,
      why: 'A count under 11 in one answer can identify a person, so it is withheld.', method: 'Suppressed on the server before it is served.' },
    unasked: { forgone: 97, unpaid: 54, work: 31, time: 18, oop: 12 },
    lead: { forgone: 88, time: 52, oop: 39, work: 21, unpaid: 12 },
    decide: Object.fromEntries(DECIDER_IDS.map((id, i) => [id, [121, 38, 27, 26][i] ?? 0])),
    clinicians: { n: 198, median: 5, mean: 5.8, max: 19 },
    sentencesHeld: 0,
    method: 'Counts of responses exactly as entered; no weighting, imputation or extrapolation.',
  };
  // Corrections: thumbs on ~40 of the priced rows, more on the visits and imaging people meet most.
  const rows = TABLE.slice();
  const picked = rows.filter((_, i) => i % 3 === 0).slice(0, 41);
  const summary = picked.map((item, i) => {
    const right = 3 + Math.floor(r() * 14), wrong = 1 + Math.floor(r() * 9);
    const believed = wrong > 4 ? Math.round((item.valueUsd ?? 100) * (1.2 + r() * 1.6)) : null;
    return { priceId: item.id, confirmedRight: right, flaggedWrong: wrong, publicMedianBelievedUsd: i % 4 === 0 ? null : believed };
  });
  const sends = summary.reduce((a, s) => a + s.confirmedRight + s.flaggedWrong, 0);
  const corrections = { ok: true, summary, senders: 143, sends, figures: summary.length };
  const cats = (gapData as unknown as { categories: { id: string }[] }).categories.map((c) => c.id);
  const gapRespondents = 87;
  const perCat: Record<string, [number, number]> = { 'care-not-sought': [61, 2.4], 'care-denied': [44, 1.6], dismissed: [58, 3.1], 'wrong-track': [37, 1.9], 'time-searching': [79, 14.2], 'life-lost': [33, 2.2] };
  const gap = {
    ok: true, respondents: gapRespondents, firstAt: first, lastAt: last,
    gap: cats.map((category) => { const [n, mean] = perCat[category] ?? [10, 1]; return { category, respondentsReporting: n, totalReported: Math.round(n * mean), meanPerRespondent: mean }; }),
    communityWeights: BURDEN_IDS.map((category, i) => ({ category, rankedFirstBy: ranking[i].rankedFirstBy, rankedAtAllBy: N })),
    coverage: { insurance: spread(r, gapRespondents, CONTEXT.insurance.options, [40, 10, 20, 12, 12, 6], 9) },
  };
  const interviews = { ok: true, n: 14, firstAt: first, lastAt: last, consent: { notes: 6, 'quote-anonymously': 5, 'quote-by-name': 3 } };
  const changes = [
    { id: 's1', date: '2026-09-09', said: 'A user said the ledger read "$0" for care she never got and it felt like being told her loss was worth nothing.', changed: 'The gap counter now says "no row at all", never $0, and the home page leads with the sentence, not the numeral.', who: 'quoted anonymously' },
    { id: 's2', date: '2026-09-09', said: 'A user said the source drawer was "a wall" on his phone in dark mode.', changed: 'The drawer was rebuilt in seven blocks with the figure first and the hash as a copy chip; dark-mode contrast re-set to 7:1 body text.', who: 'notes only' },
    { id: 's3', date: '2026-09-10', said: 'A user asked why "time searching" was a count of months and not dollars.', changed: 'The gap page now says, beside the months, that BLS publishes the hours and the wage but never their product, so the line stays blank and named.', who: 'quoted anonymously' },
  ];
  return { ok: true, corrections, gap, survey, interviews, changes, firstAt: first, lastAt: last, generatedAt: '2026-09-10T14:00:00.000Z', sample: true };
}
