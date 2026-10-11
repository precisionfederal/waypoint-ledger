/* Merge round 6 (rehearsal, 2026-10-01): what the round asked for on the
   merged line of FLOW6 (one story is one patient) and JUDGE-6.

   (a) the home preview's blank chip quotes the words as the ledger does.
   (b) JUDGE-6 #10 leftover: at 320 the (i) stood alone on its own line.
   (c) child / caregiver strata and the register headline, re-read under the
       one-patient rule, on the three stories the round named. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJourney } from '../lib/mapper';
import { ITEMS } from '../lib/store';
import { patientFromWords } from '../lib/patient';
import { gapSummary, sheetFitsOnePage, sheetPrintPx } from '../lib/sheet';
import { fitOf, type Fit } from '../lib/fit';
import { priceJourney } from '../lib/pricing';
import { sheetSizeOf } from '../components/sheet/sheet-size';
import { EMPTY_BURDENS } from '../lib/burdens';
import { SELECTABLE, TABLE } from '../lib/table';
import type { JourneyEntry } from '../lib/types';
import { aggregateSurvey } from '../cf/functions/api/survey.js';
import { RESPONDENT_CHILD, RESPONDENT_SELF } from '../lib/survey-def.js';

const SHE_13 = 'got sick when she was 9, shes 13 now';
const CELIAC = 'my son had stomach pain for 2 years before they found celiac. we took him to his pediatrician four times, then a GI doctor, blood work twice and an endoscopy';
const WIFE = 'my wife had seizures for a year. she saw her regular doctor 4 times, a neurologist, and 2 EEGs';
const WIFE_ONSET = 'my wife got sick when she was 9, shes 34 now. she saw a neurologist twice';

const lines = (s: string) => parseJourney(s, ITEMS).filter((g) => !g.absorbed);
const priced = (s: string) => lines(s).filter((g) => g.result.item).map((g) => [g.result.item!.id, g.times]);
const months = (s: string) => gapSummary(lines(s).map((x, i) => ({ key: String(i), raw: x.raw, item: x.result.item, times: x.times, gapCategory: x.result.gapCategory, months: x.result.months }))).months;

describe('(a) the blank chip quotes the words through saidQuote', () => {
  it('LivePreview prints a blank line\'s words as the ledger does', () => {
    const src = readFileSync('components/LivePreview.tsx', 'utf8');
    expect(src).toContain("import { saidQuote } from '@/lib/said-quote';");
    expect(src).toContain('<b>{saidQuote(s.raw)}</b>');
    expect(src).not.toContain('<b>{s.raw}</b>');
  });
});

describe('(b) the (i) stays with the words it belongs to', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  it('a fine-print row never wraps the (i) onto a line of its own', () => {
    expect(css).toContain('.fp-row{flex-wrap:nowrap}.fp-row>p{min-width:0}.fp-row>.fp{flex:none}');
  });
  it('opened on a phone, the (i) stays beside the words and the note spans the row under both', () => {
    expect(css).toContain('.fp-row:has(>.fp[open]){display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:.55rem}');
    expect(css).toContain('.fp-row>.fp[open]{display:contents}.fp-row>.fp[open]>.fp-body{grid-column:1/-1}');
    expect(css).not.toContain('.fp-row>.fp[open]{flex-basis:100%}');
  });
});

describe('(c) strata and the headline under "one story is one patient"', () => {
  it(`"${SHE_13}": a girl of 13, a child's ledger, 4 years searching`, () => {
    expect(patientFromWords(SHE_13)).toBe('caregiver-child');
    expect(months(SHE_13)).toBe(48);
    expect(priced(SHE_13)).toEqual([]);
  });
  it('the celiac child: a child\'s ledger, every line his, 2 years searching', () => {
    expect(patientFromWords(CELIAC)).toBe('caregiver-child');
    expect(months(CELIAC)).toBe(24);
    expect(priced(CELIAC)).toEqual([['cms-99213', 4], ['cms-99204', 1], ['cms-lab-cbc', 2], ['cms-proc-egd-biopsy', 1]]);
  });
  it('"my wife ... she ...": her care, and never a child\'s ledger or the writer\'s own onset', () => {
    /* JUDGE-7 #5 (2026-10-01): these were null, "no stratum". An adult relative's
       story now reads caregiver-adult, which is still never a child's ledger and
       never the writer's own onset, and names her as the wife. */
    expect(patientFromWords(WIFE)).toBe('caregiver-adult');
    expect(priced(WIFE)).toEqual([['cms-99213', 4], ['cms-99204', 1], ['cms-test-eeg-awake-drowsy', 2]]);
    expect(patientFromWords(WIFE_ONSET)).toBe('caregiver-adult');
    expect(patientFromWords('my wife got sick when she was 9 and was diagnosed at 30')).toBe('caregiver-adult');
    expect(priced(WIFE_ONSET)).toEqual([['cms-99204', 1], ['cms-99214', 1]]);
  });
  it('the writer\'s own ages still set the writer\'s own strata', () => {
    expect(patientFromWords('got sick at 12 and im 19 now')).toBe('pediatric-onset');
    expect(patientFromWords('I got sick at 30. I\'m 34 now.')).toBe('adult-onset');
    expect(patientFromWords('I got sick at 8 and my mom took me to the pediatrician 6 times')).toBe('pediatric-onset');
  });
  it('the register headline counts the answers about one\'s own illness; a parent\'s answers for these children stay out', () => {
    const BURDENS = ['forgone', 'time', 'oop', 'unpaid', 'dismissed'];
    const row = (ctx: Record<string, string> | undefined) => ({ ranking: BURDENS, unasked: 'time', lead: 'oop', decide: 'clinician', clinicians: 3, context: ctx, receivedAt: '2026-10-01T05:00:00.000Z' });
    const a = aggregateSurvey([row({ respondent: RESPONDENT_CHILD }), row({ respondent: RESPONDENT_CHILD }), row({ respondent: RESPONDENT_SELF }), row(undefined)]) as { n: number; headline: { n: number } };
    expect(a.n).toBe(4);
    expect(a.headline.n).toBe(2);
  });
});

/* Round 6, with SHEET4 (b07aad311d) merged after JUDGE-6 #6 (an age is never a
   sheet row) and FLOW6's clean residual ("GI doctor"): the daughter story as the
   reader stores it today prints shorter than SHEET4's frozen fixture of it, and
   is still claimed as one page, inside the 12.5 px margin. */
describe('the daughter sheet only gets shorter with JUDGE-6 #6 in', () => {
  const STORY = "My daughter is 14. She started getting stomach pains when she was 9 and we took her to the pediatrician probably six times, they said it was anxiety. Then the ER twice when it got really bad, they did a CT scan once. A GI doctor finally did an endoscopy and a colonoscopy and it was Crohn's. All in all it took about four years.";
  const FIXTURE: [string, string | null, number, string | null, number | null][] = [['My daughter is 14.', null, 1, null, null], ['we took her to the pediatrician probably six times', 'cms-99213', 6, null, null], ['they said it was anxiety.', null, 1, 'dismissed', null], ['Then the ER twice when it got really bad', 'cms-ed-99284-complete', 2, null, null], ['they did a CT scan once.', null, 1, null, null], ['A GI doctor finally did an endoscopy', 'cms-proc-egd-biopsy', 1, null, null], ['GI doctor finally did an', 'cms-99204', 1, null, null], ['a colonoscopy', 'cms-proc-colonoscopy', 1, null, null], ["it was Crohn's.", null, 1, null, null], ['All in all it took about four years.', null, 1, 'time-searching', 48]];
  const sizeOf = (entries: JourneyEntry[]) => {
    const fits = new Map<string, Fit>(); for (const e of entries) if (e.item) fits.set(e.key, fitOf(e.item, {}, true));
    const priced = priceJourney(entries, (e) => (e.item ? fits.get(e.key)?.figureUsd ?? null : undefined));
    return sheetSizeOf({ entries, lines: priced, fits, gaps: gapSummary(entries, []), burdens: { ...EMPTY_BURDENS, dismissed: 1 }, paid: false, locality: false });
  };
  it('fewer rows, the age printed as her words, a shorter page, still one page', () => {
    const fixture = FIXTURE.map(([raw, id, times, gapCategory, months], i) => ({ key: `f${i}`, raw, item: id ? TABLE.find((t) => t.id === id)! : null, times, gapCategory, months, ...(raw === "it was Crohn's." ? { reason: 'the name of a condition' } : {}) })) as unknown as JourneyEntry[];
    const real = parseJourney(STORY, SELECTABLE).filter((x) => !x.absorbed).map((x, i) => ({ key: `r${i}`, raw: x.raw, item: x.result.item ?? null, times: x.times, reason: x.result.reason ?? null, gapCategory: x.result.gapCategory ?? null, months: x.result.months ?? null })) as unknown as JourneyEntry[];
    const before = sizeOf(fixture), now = sizeOf(real);
    expect(now.rows.length).toBe(before.rows.length - 1);
    expect(now.rows.some((r) => /My daughter is 14/.test(r.words))).toBe(false);
    expect(sheetPrintPx(now)).toBeLessThan(sheetPrintPx(before));
    expect(sheetFitsOnePage(now)).toBe(true);
  });
});
