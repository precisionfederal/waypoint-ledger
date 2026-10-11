/* ==========================================================================
   LIVED EXPERIENCE FROM PUBLISHED RESEARCH, MADE INTO COMPOSITE JOURNEYS.

   Bo, 2026-10-11: do the research on lived experience, project it onto our
   own information, and never call it live interviews or live feedback.

   The research is data/lived-experience-sources.json: published federal
   patient research (HHS Health+), National Academies reports, peer-reviewed
   studies, patient-organization surveys with published methods, and Senate
   testimony. Every quote in it is verbatim from the saved text whose sha256
   it records (tests/lived-experience.test.ts re-checks each one).

   A journey here is a composite: each phrase of its sentence is a step one
   of those sources documents, and the step names the finding that documents
   it. It is never a person, never an interview, never feedback. Its prices
   are not typed anywhere: the page runs the sentence through the same reader
   and price table a person's own sentence goes through
   (lib/conditions-catalog.ts priceSentence).

   Counts stay at one unless a source gives the number, so every ledger here
   understates what the research describes (e.g. POTS respondents averaged
   nine ER visits before diagnosis; the POTS journey carries one).
   ========================================================================== */
import raw from '../data/lived-experience-sources.json';
import unpriceableData from '../data/unpriceable.json';
import { priceSentence } from './conditions-catalog';
import { unpriceableFor } from './price-api';
import { SELECTABLE } from './table';

export const COMPOSITE_LABEL = 'A composite drawn from published patient research, not a real person';

export type SourceKind =
  | 'federal patient research'
  | 'national academies'
  | 'peer-reviewed qualitative/survey'
  | 'patient-organization survey'
  | 'public testimony';

export interface LivedFinding { id: string; theme: Theme; finding: string; quote: string; locator: string }
export interface LivedSource {
  id: string; title: string; publisher: string; year: number; url: string; landing?: string; fetchedFrom?: string; doi?: string;
  retrieved: string; textFile: string; sha256: string; conditions: string[]; kind: SourceKind; where: string; organization?: string;
  findings: LivedFinding[];
}

export type Theme =
  | 'dismissed' | 'many-doctors' | 'tests-normal' | 'years' | 'er' | 'stay' | 'out-of-pocket'
  | 'work' | 'waits' | 'gone-without' | 'insurance-denied' | 'travel' | 'believed' | 'child';

export const LIVED_SOURCES = (raw as unknown as { sources: LivedSource[] }).sources;
export const SOURCE_KINDS: SourceKind[] = ['federal patient research', 'national academies', 'patient-organization survey', 'peer-reviewed qualitative/survey', 'public testimony'];

const BY_FINDING = new Map<string, { source: LivedSource; finding: LivedFinding }>();
for (const s of LIVED_SOURCES) for (const f of s.findings) BY_FINDING.set(f.id, { source: s, finding: f });
export const findingById = (id: string) => BY_FINDING.get(id) ?? null;
export const sourceById = (id: string) => LIVED_SOURCES.find((s) => s.id === id) ?? null;

/** What the product already does, one line each, with the page that does it. */
export interface Feature { line: string; href: string; page: string }
export const FEATURES = {
  priced: { line: 'Every visit and test becomes its own line, priced at one published CMS figure that carries its code and year.', href: '/journey', page: 'Price my journey' },
  dismissed: { line: 'Being told it was anxiety, stress or nothing stays on the ledger in your words: a real event with no billing code, counted and never priced.', href: '/journey', page: 'Price my journey' },
  searched: { line: 'Say how long the search took and the ledger shows the years searching and the clinicians named beside the total.', href: '/ledger', page: 'My ledger' },
  gap: { line: 'The care you waited for, were refused or went without is counted on its own, because no federal file records it.', href: '/gap', page: 'What the data never recorded' },
  work: { line: 'Work you lost goes on the workdays card, priced only from your own pay or a published weekly wage, never added to the medical total.', href: '/ledger', page: 'My ledger' },
  trips: { line: 'A trip to care is counted on the Trips card and never priced as care.', href: '/ledger', page: 'My ledger' },
  stay: { line: 'A hospital stay stays on the ledger by name, unpriced: Medicare pays a stay from a file this table does not hold, and nothing is guessed.', href: '/method', page: 'How every figure is made' },
  reference: { line: 'Care insurance did not cover is still priced at the published Medicare reference for that visit, labelled as a reference, never as what you paid.', href: '/method', page: 'How every figure is made' },
  thumbs: { line: 'Every line carries a thumb: where the federal figure does not describe you, that lands as a counted correction on its row, published on the register.', href: '/register', page: 'The register' },
  sheet: { line: 'One printed page to hand the next clinician: what happened, what each line costs and where each figure comes from.', href: '/sheet', page: 'Appointment sheet' },
  survey: { line: 'The burden survey asks which cost weighed most, with a path for a parent answering about a child.', href: '/survey', page: 'Burden survey' },
} satisfies Record<string, Feature>;
export type FeatureKey = keyof typeof FEATURES;

/** The findings table: what patients report, by theme, and the feature that answers it. */
export const THEMES: { theme: Theme; report: string; features: FeatureKey[] }[] = [
  { theme: 'dismissed', report: 'Being told it was anxiety, stress or nothing', features: ['dismissed', 'sheet'] },
  { theme: 'many-doctors', report: 'A long string of doctors and specialists', features: ['priced', 'searched'] },
  { theme: 'tests-normal', report: 'Tests that come back normal, and then more tests', features: ['priced', 'sheet'] },
  { theme: 'years', report: 'Years before anyone names it', features: ['searched'] },
  { theme: 'er', report: 'Emergency visits, long waits and being doubted there', features: ['priced', 'thumbs'] },
  { theme: 'stay', report: 'Hospital stays', features: ['stay'] },
  { theme: 'out-of-pocket', report: 'Paying out of pocket for care insurance did not cover', features: ['reference', 'thumbs'] },
  { theme: 'work', report: 'Losing work and income', features: ['work'] },
  { theme: 'waits', report: 'Waiting months, up to a year, for a clinic', features: ['gap'] },
  { theme: 'gone-without', report: 'Care skipped for lack of insurance or money, or given up on', features: ['gap'] },
  { theme: 'insurance-denied', report: 'Prior authorization and denials', features: ['gap'] },
  { theme: 'travel', report: 'Travelling hundreds of miles for a specialist', features: ['trips'] },
  { theme: 'believed', report: 'Doubting themselves after being doubted', features: ['sheet', 'survey'] },
  { theme: 'child', report: 'Illness that starts in childhood', features: ['survey'] },
];

export interface Step { said: string; findings: string[] }
export interface ResearchJourney {
  id: string;
  condition: string;
  title: string;
  label: typeof COMPOSITE_LABEL;
  /** Each phrase is a step a source documents; the sentence is the phrases joined. */
  steps: Step[];
  /** What the sources report for time, as a range when they differ. null where the journey is one year of care. */
  years: { low: number; high: number; measure: string; findings: string[] } | null;
  /** Shown when years is null. */
  span?: string;
  whatTheResearchSays: string[];
  whatWaypointDoes: FeatureKey[];
}

export const storyOf = (j: Pick<ResearchJourney, 'steps'>) => j.steps.map((s) => s.said).join('; ');
export const sourceIdsOf = (j: Pick<ResearchJourney, 'steps' | 'years' | 'whatTheResearchSays'>) => {
  const ids = [...j.steps.flatMap((s) => s.findings), ...(j.years?.findings ?? []), ...j.whatTheResearchSays];
  return [...new Set(ids.map((f) => findingById(f)?.source.id).filter((x): x is string => !!x))];
};

const J = (j: Omit<ResearchJourney, 'label'>): ResearchJourney => ({ ...j, label: COMPOSITE_LABEL });

export const RESEARCH_JOURNEYS: ResearchJourney[] = [
  J({
    id: 'long-covid', condition: 'Long COVID', title: 'The string of specialists',
    steps: [
      { said: 'saw my regular doctor', findings: ['hhs-longcovid-2022-f7'] },
      { said: 'went to urgent care', findings: ['hhs-longcovid-2022-f7'] },
      { said: 'a chest X-ray', findings: ['hhs-longcovid-2022-f2'] },
      { said: 'an EKG', findings: ['hhs-longcovid-2022-f2'] },
      { said: 'saw a pulmonologist', findings: ['hhs-longcovid-2022-f8'] },
      { said: 'saw a cardiologist', findings: ['hhs-longcovid-2022-f8'] },
      { said: 'blood work', findings: ['senate-heim-2024-f3'] },
      { said: 'was told it was anxiety', findings: ['hhs-longcovid-2022-f3', 'senate-vazquez-2024-f1'] },
      { said: 'waited a year', findings: ['hhs-longcovid-2022-f4'] },
      { said: 'a first visit at the long COVID clinic', findings: ['hhs-longcovid-2022-f9'] },
      { said: 'lost my job', findings: ['senate-beale-2024-f1', 'plrc-davis-2021-f2'] },
    ],
    years: { low: 0.67, high: 3, measure: 'how long the illness had lasted: more than 35 weeks for over 91% of one survey, almost three years in one Senate testimony', findings: ['plrc-davis-2021-f1', 'senate-beale-2024-f4'] },
    whatTheResearchSays: ['hhs-longcovid-2022-f1', 'hhs-longcovid-2022-f5', 'nasem-lc-definition-2024-f1', 'plrc-davis-2021-f2', 'lc-employment-2025-f2', 'senate-beale-2024-f2'],
    whatWaypointDoes: ['priced', 'dismissed', 'gap', 'work'],
  }),
  J({
    id: 'pots', condition: 'POTS', title: 'The racing heart that was called anxiety',
    steps: [
      { said: 'searched for two years', findings: ['dysautonomia-shaw-2019-f3'] },
      { said: 'saw my regular doctor', findings: ['dysautonomia-journey-2025-f2'] },
      { said: 'went to the ER when my heart was racing', findings: ['dysautonomia-shaw-2019-f4'] },
      { said: 'was told it was anxiety', findings: ['dysautonomia-shaw-2019-f2'] },
      { said: 'saw a neurologist', findings: ['dysautonomia-journey-2025-f2'] },
      { said: 'saw a cardiologist', findings: ['dysautonomia-journey-2025-f2'] },
      { said: 'blood tests', findings: ['pots-journey-2024-f1'] },
      { said: 'a tilt-table test', findings: ['pots-journey-2024-f2', 'pots-lived-2025-f1'] },
    ],
    years: { low: 2, high: 7.7, measure: 'time to diagnosis: a median of 24 months in a survey of 4,835 people with POTS, an average of 7.7 years across dysautonomia', findings: ['dysautonomia-shaw-2019-f3', 'dysautonomia-journey-2025-f1'] },
    whatTheResearchSays: ['dysautonomia-shaw-2019-f1', 'dysautonomia-shaw-2019-f2', 'dysautonomia-shaw-2019-f4', 'pots-lived-2025-f1', 'lc-pots-listen-2025-f1'],
    whatWaypointDoes: ['priced', 'dismissed', 'searched', 'sheet'],
  }),
  J({
    id: 'lyme-ptlds', condition: 'Lyme disease with lasting symptoms', title: 'Every test came back negative',
    steps: [
      { said: 'searched for two years', findings: ['lymedisease-johnson-2014-f1'] },
      { said: 'went to the ER and was told it was bursitis', findings: ['hirsch-lyme-2018-f2', 'hirsch-lyme-2018-f1'] },
      { said: 'saw my regular doctor', findings: ['hirsch-lyme-2018-f4'] },
      { said: 'blood work', findings: ['hhs-lyme-2021-f2'] },
      { said: 'a Lyme test', findings: ['lyme-journey-2026-f2'] },
      { said: 'the tests came back negative', findings: ['hhs-lyme-2021-f2'] },
      { said: 'saw a neurologist', findings: ['hhs-lyme-2021-f5'] },
      { said: 'was sent to a psychiatrist', findings: ['hhs-lyme-2021-f6'] },
      { said: 'saw an infectious disease doctor', findings: ['lyme-journey-2026-f3'] },
      { said: 'saw a Lyme specialist', findings: ['hhs-lyme-2021-f7', 'nasem-lyme-iaci-2025-f1'] },
    ],
    years: { low: 2, high: 7.5, measure: 'time to diagnosis: at least two years for 61.7% of one patient survey, seven and a half years for one patient in the HHS report', findings: ['lymedisease-johnson-2014-f1', 'hhs-lyme-2021-f1'] },
    whatTheResearchSays: ['hhs-lyme-2021-f3', 'hhs-lyme-2021-f4', 'nasem-lyme-iaci-2025-f1', 'nasem-lyme-iaci-2025-f2', 'lymedisease-johnson-2014-f2'],
    whatWaypointDoes: ['priced', 'dismissed', 'reference', 'thumbs'],
  }),
  J({
    id: 'heds', condition: 'Hypermobile Ehlers-Danlos syndrome', title: 'Fifteen clinicians before a name',
    steps: [
      { said: 'searched for ten years', findings: ['heds-odyssey-2023-f1'] },
      { said: 'saw my regular doctor', findings: ['heds-global-2025-f4'] },
      { said: 'went to the ER', findings: ['heds-global-2025-f4'] },
      { said: 'saw a GI specialist', findings: ['heds-global-2025-f4'] },
      { said: 'saw a cardiologist', findings: ['heds-global-2025-f4'] },
      { said: 'saw a neurologist', findings: ['heds-global-2025-f4'] },
      { said: 'was told it was anxiety', findings: ['heds-odyssey-2023-f2'] },
      { said: 'saw a rheumatologist', findings: ['heds-odyssey-2023-f4'] },
      { said: 'traveled 300 miles', findings: ['heds-global-2025-f2'] },
      { said: 'saw a genetics specialist', findings: ['heds-odyssey-2023-f3'] },
    ],
    years: { low: 10.39, high: 22.1, measure: 'time to diagnosis: 10.39 years on average in the Ehlers-Danlos Society registry survey, 22.1 years in a global survey of 3,360 people with hEDS', findings: ['heds-odyssey-2023-f1', 'heds-global-2025-f1'] },
    whatTheResearchSays: ['heds-odyssey-2023-f1', 'heds-global-2025-f3', 'eds-selfdoubt-2025-f1', 'eds-selfdoubt-2025-f2', 'eds-pain-2023-f1'],
    whatWaypointDoes: ['priced', 'searched', 'trips', 'dismissed'],
  }),
  J({
    id: 'lupus', condition: 'Lupus', title: 'Normal blood work, sent to a psychiatrist',
    steps: [
      { said: 'searched for almost seven years', findings: ['lupus-sloan-2020-f1'] },
      { said: 'saw my regular doctor about the fatigue', findings: ['lupus-sloan-2020-f4'] },
      { said: 'blood work', findings: ['lupus-sloan-2020-f3'] },
      { said: 'an ANA test', findings: ['lupus-sloan-2020-f5'] },
      { said: 'was told it was anxiety', findings: ['lupus-dos-2025-f1'] },
      { said: 'saw a rheumatologist', findings: ['lupus-sloan-2020-f4'] },
      { said: 'was sent to a psychiatrist', findings: ['lupus-sloan-2020-f3'] },
      { said: 'saw a neurologist', findings: ['lupus-sloan-2020-f4'] },
      { said: 'went to the ER', findings: ['lupus-sloan-2020-f4'] },
      { said: 'saw a second rheumatologist', findings: ['lupus-sloan-2020-f6'] },
    ],
    years: { low: 6.92, high: 13, measure: 'time to diagnosis: 6 years 11 months on average in a LUPUS UK survey, 13 years when the ANA test stayed negative', findings: ['lupus-sloan-2020-f1', 'lupus-sloan-2020-f5'] },
    whatTheResearchSays: ['lupus-sloan-2020-f2', 'lupus-sloan-2020-f3', 'lupus-dos-2025-f1', 'lupus-dos-2025-f2'],
    whatWaypointDoes: ['priced', 'dismissed', 'searched', 'sheet'],
  }),
  J({
    id: 'sickle-cell', condition: 'Sickle cell disease', title: 'A year of pain crises',
    steps: [
      { said: 'went to the ER twice for a pain crisis', findings: ['nasem-scd-ssa-2025-f2', 'nasem-scd-2020-f1'] },
      { said: 'stayed in the hospital five days', findings: ['nasem-scd-ssa-2025-f1'] },
      { said: 'saw my hematologist', findings: ['hhs-scd-2020-f4'] },
      { said: 'blood work', findings: ['hhs-scd-2020-f5'] },
    ],
    years: null,
    span: 'One year of care, at the one to two crises a year an adult with sickle cell disease described to the National Academies.',
    whatTheResearchSays: ['hhs-scd-2020-f1', 'nasem-scd-2020-f2', 'nasem-scd-ssa-2025-f3', 'scd-discrimination-2024-f1', 'hhs-scd-2020-f3'],
    whatWaypointDoes: ['priced', 'stay', 'thumbs', 'gap'],
  }),
];

/* 🔴 THE CARD AND THE LEDGER CAN NEVER DISAGREE. The reader's lines
   (priceSentence) are passed through the same named-cost check the ledger's
   add applies (lib/store.tsx addStory: unpriceableHit, which is unpriceableFor
   over data/unpriceable.json), so a phrase the ledger keeps by name, unpriced,
   is kept that way here too. tests/lived-experience.test.ts replays the
   store's own functions and fails if the totals ever differ. */
const UNPRICEABLE = (unpriceableData as { items: Parameters<typeof unpriceableFor>[1] }).items;
export interface CardLine { raw: string; times: number; itemId: string | null; code: string | null; year: string | null; lineUsd: number | null; reason: string | null }
export function ledgerOf(story: string): { lines: CardLine[]; pricedTotalUsd: number; pricedCount: number; unpricedCount: number } {
  const lines: CardLine[] = priceSentence(story, SELECTABLE).lines.map((l) => {
    const un = unpriceableFor(l.raw, UNPRICEABLE);
    if (un) return { raw: l.raw, times: l.times, itemId: null, code: null, year: null, lineUsd: null, reason: `${un.label}: a real cost kept on the ledger by name, never priced here` };
    return { raw: l.raw, times: l.times, itemId: l.itemId, code: l.code, year: l.year, lineUsd: l.lineUsd, reason: l.reason };
  });
  const priced = lines.filter((l) => l.lineUsd !== null);
  return {
    lines,
    pricedTotalUsd: Math.round(priced.reduce((a, l) => a + (l.lineUsd as number), 0) * 100) / 100,
    pricedCount: priced.length,
    unpricedCount: lines.length - priced.length,
  };
}

/** The ledger a journey opens: the sentence goes into the journey box, read live by the same reader. */
export const JOURNEY_BOX = '/journey';
