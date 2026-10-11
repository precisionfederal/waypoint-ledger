/* The ledger's sheet card says "One printed page" only when it is true.
   Merge round 5: SHEET3 measured (pdfinfo, Letter) the home example at 1 page;
   the example with paid amounts, the example for an uninsured person in IA-00
   (figures carry their own labels) and a 23-row journey at 2.
   JUDGE-6 #8 (SHEET4): the daughter story printed on 2 pages. SHEET4 tightened
   the paper layout and re-measured every sheet below on Letter and A4, light and
   dark (winloop/BETA-2026-10-01/VISUAL-4b-sheet4.md); the check now adds up the
   printed height part by part, and each sheet is pinned with its measured height. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { exampleEntries, EXAMPLE_UNPRICED } from '../components/sheet/example';
import { fitOf, type Ctx, type Fit } from '../lib/fit';
import { priceJourney } from '../lib/pricing';
import { PRINT, gapSummary, sheetFitsOnePage, sheetPrintPx } from '../lib/sheet';
import { sheetSizeOf } from '../components/sheet/sheet-size';
import { EMPTY_BURDENS, type BurdenCounts } from '../lib/burdens';
import { DIAGNOSIS_REASON } from '../lib/diagnosis-line';
import { UNPRICEABLE } from '../lib/store';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE, TABLE } from '../lib/table';
import type { JourneyEntry } from '../lib/types';

function size(entries: JourneyEntry[], ctx: Ctx = {}, opts: { paid?: boolean; unpriced?: string[]; burdens?: BurdenCounts; child?: boolean } = {}) {
  const fits = new Map<string, Fit>();
  for (const e of entries) if (e.item) fits.set(e.key, fitOf(e.item, ctx, !!opts.child));
  const lines = priceJourney(entries, (e) => (e.item ? fits.get(e.key)?.figureUsd ?? null : undefined));
  const gaps = gapSummary(entries, (opts.unpriced ?? []).map((id) => UNPRICEABLE.find((u) => u.id === id)!.label));
  return sheetSizeOf({ entries, lines, fits, gaps, burdens: opts.burdens ?? EMPTY_BURDENS, paid: !!opts.paid, locality: !!ctx.locality });
}

type Row = [raw: string, itemId: string | null, times: number, gapCategory: string | null, months: number | null];
/* The stories as the ledger stored them after they were typed on /journey (the AI
   reader on for the journey-ai three). A line the reader named as the diagnosis
   carries its reason, as the store holds it, so it prints in her own words. */
const DIAGNOSIS = /it was Crohn|dx with MS|it was POTS/;
const journey = (rows: Row[]): JourneyEntry[] => rows.map(([raw, id, times, gapCategory, months], i) => ({
  key: `s${i}`, raw, item: id ? TABLE.find((t) => t.id === id) ?? null : null, times, gapCategory, months, source: 'rules', modelWhy: null,
  ...(DIAGNOSIS.test(raw) ? { reason: DIAGNOSIS_REASON } : {}),
})) as unknown as JourneyEntry[];

/* JUDGE-6 journey-ai story 1, the daughter story */
const DAUGHTER: Row[] = [["My daughter is 14.", null, 1, null, null], ["we took her to the pediatrician probably six times", "cms-99213", 6, null, null], ["they said it was anxiety.", null, 1, "dismissed", null], ["Then the ER twice when it got really bad", "cms-ed-99284-complete", 2, null, null], ["they did a CT scan once.", null, 1, null, null], ["A GI doctor finally did an endoscopy", "cms-proc-egd-biopsy", 1, null, null], ["GI doctor finally did an", "cms-99204", 1, null, null], ["a colonoscopy", "cms-proc-colonoscopy", 1, null, null], ["it was Crohn's.", null, 1, null, null], ["All in all it took about four years.", null, 1, "time-searching", 48]];
const MS: Row[] = [["ive been sick for 7 yrs.", null, 1, null, null], ["seen my pcp a dozen times", "cms-99213", 12, null, null], ["3 diffrent neurologists", "cms-99204", 3, null, null], ["2 mri's of brain", "cms-img-mri-brain-nc", 1, null, null], ["one of my spine", null, 1, null, null], ["a lumbar puncture", "cms-proc-lumbar-puncture", 1, null, null], ["eeg", "cms-test-eeg-awake-drowsy", 1, null, null], ["so much bloodwork i lost count.", "cms-lab-cbc", 1, null, null], ["finally dx with MS last spring", null, 1, null, null]];
const HUSBAND: Row[] = [["My husband had chest pain", null, 1, null, null], ["went to urgent care", "cms-99203", 1, null, null], ["they sent him to the ER by ambulance", "cms-ed-99284-complete", 1, null, null], ["he was admitted for two nights", null, 1, null, null], ["had an echo", "cms-img-echo", 1, null, null], ["a stress test", "cms-test-stress-test", 1, null, null], ["saw a cardiologist three times after", "cms-99204", 1, null, null], ["saw a cardiologist three times after", "cms-99214", 2, null, null]];
/* SHEET4's caregiver stories */
const SON: Row[] = [["My son is 7.", null, 1, null, null], ["We saw his pediatrician 5 times", "cms-99213", 5, null, null], ["they said he would grow out of it.", null, 1, null, null], ["We went to the ER 3 times", "cms-ed-99284-complete", 3, null, null], ["he had an EEG twice", "cms-test-eeg-awake-drowsy", 2, null, null], ["an MRI of his brain", "cms-img-mri-brain-nc", 1, null, null], ["saw a neurologist 4 times", "cms-99204", 1, null, null], ["saw a neurologist 4 times", "cms-99214", 3, null, null], ["had blood work twice", "cms-lab-cbc", 2, null, null], ["a sleep study.", "cms-test-sleep-study", 1, null, null], ["It took two years to find out it was epilepsy.", null, 1, "time-searching", 24]];
const MOM: Row[] = [["I take care of my mom.", null, 1, null, null], ["She saw her primary care doctor 8 times", "cms-99213", 8, null, null], ["a cardiologist twice", "cms-99204", 1, null, null], ["a cardiologist twice", "cms-99214", 1, null, null], ["had an echo", "cms-img-echo", 1, null, null], ["a stress test", "cms-test-stress-test", 1, null, null], ["a holter monitor", "cms-test-holter", 1, null, null], ["a chest x-ray", "cms-img-cxr", 1, null, null], ["blood work 4 times", "cms-lab-cbc", 4, null, null], ["went to urgent care twice", "cms-99203", 2, null, null], ["the ER once", "cms-ed-99284-complete", 1, null, null], ["they told her it was just her age.", null, 1, null, null], ["It took 18 months.", null, 1, "time-searching", 18]];
const POTS: Row[] = [["My 16 year old daughter fainted at school.", null, 1, null, null], ["We saw her pediatrician 3 times", "cms-99213", 3, null, null], ["a cardiologist twice", "cms-99204", 1, null, null], ["a cardiologist twice", "cms-99214", 1, null, null], ["she had an EKG", "cms-test-ecg", 1, null, null], ["an echo", "cms-img-echo", 1, null, null], ["a tilt table test", "cms-test-tilt-table", 1, null, null], ["blood work", "cms-lab-cbc", 1, null, null], ["neurologist", "cms-99204", 1, null, null], ["a neurologist visit with an EEG.", "cms-test-eeg-awake-drowsy", 1, null, null], ["They said she was not drinking enough water.", null, 1, null, null], ["After a year it was POTS.", null, 1, null, null]];
const B = (o: Partial<BurdenCounts>): BurdenCounts => ({ ...EMPTY_BURDENS, ...o });

/* [name, size, printed height on Letter in CSS px (Playwright, print media, 720 px), pages Letter and A4] */
const MEASURED = (): [string, ReturnType<typeof size>, number, number][] => [
  ['example', size(exampleEntries(), {}, { unpriced: EXAMPLE_UNPRICED }), 852, 1],
  ['daughter (journey-ai 1)', size(journey(DAUGHTER), {}, { burdens: B({ dismissed: 1 }), child: true }), 922, 1],
  ['MS (journey-ai 2)', size(journey(MS)), 800, 1],
  ['husband (journey-ai 3)', size(journey(HUSBAND)), 807, 1],
  ['son, 11 rows', size(journey(SON), {}, { child: true }), 951, 1],
  ['POTS daughter, 10 rows', size(journey(POTS), {}, { child: true }), 890, 1],
  ['mother, 13 rows', size(journey(MOM)), 1007, 2],
  ['mother, 13 rows, 3 burden cards', size(journey(MOM), {}, { burdens: B({ careHours: 40, trips: 12, dismissed: 1 }) }), 1257, 2],
  ['son, 11 rows, 4 burden cards', size(journey(SON), {}, { burdens: B({ workdays: 9, careHours: 40, trips: 12, dismissed: 2 }), child: true }), 1250, 2],
];

describe('the sheet card says one printed page only when it is true', () => {
  /* The claim keeps PRINT.safetyPx (12.5 px) clear of the foot. The son's sheet prints on
     one page at 951 px but is estimated at 957 px, inside that margin, so it says "Ready
     to print": true at any length, and never a promise that might break. */
  const NEAR_FOOT = new Set(['son, 11 rows']);
  it('every sheet SHEET4 printed on two pages is never called one page; every one-page sheet is, unless it is within the margin of the foot', () => {
    for (const [name, s, , pages] of MEASURED()) expect([name, sheetFitsOnePage(s)]).toEqual([name, pages === 1 && !NEAR_FOOT.has(name)]);
    const son = MEASURED().find(([n]) => n === 'son, 11 rows')!;
    expect(sheetPrintPx(son[1])).toBeGreaterThan(PRINT.pagePx - PRINT.safetyPx);
    expect(sheetPrintPx(son[1])).toBeLessThanOrEqual(PRINT.pagePx);
  });
  it('the margin is at least three times the largest miss, and a sheet just under it is claimed while one just over it is not', () => {
    expect(PRINT.safetyPx).toBeGreaterThanOrEqual(3 * 4.1);
    const base = size(journey(HUSBAND));
    const row = { words: 'saw my doctor', unit: 'Office visit' };
    /* add one-line rows until the next would cross the budget */
    let rows = [...base.rows];
    while (sheetPrintPx({ ...base, rows: [...rows, row] }) <= PRINT.pagePx - PRINT.safetyPx) rows = [...rows, row];
    const under = { ...base, rows };
    const over = { ...base, rows: [...rows, row] };
    expect(sheetPrintPx(under)).toBeLessThanOrEqual(PRINT.pagePx - PRINT.safetyPx);
    expect(PRINT.pagePx - PRINT.safetyPx - sheetPrintPx(under)).toBeLessThan(PRINT.rowPx + PRINT.rowLinePx);
    expect(sheetFitsOnePage(under)).toBe(true);
    expect(sheetFitsOnePage(over)).toBe(false);
  });
  it('the child story (JUDGE-6 #8) is one page: 9 rows, her own words, a dismissal card, four years searching', () => {
    const s = size(journey(DAUGHTER), {}, { burdens: B({ dismissed: 1 }), child: true });
    expect(s.rows.length).toBe(9);
    expect(s.notes).toBe(1);
    expect(s.burdenCards).toBe(1);
    expect(sheetFitsOnePage(s)).toBe(true);
  });
  it('the estimate is never shorter than a measured page, and never far longer', () => {
    for (const [name, s, px] of MEASURED().slice(0, 7)) {
      const est = sheetPrintPx(s);
      expect([name, est >= px]).toEqual([name, true]);
      expect([name, est - px < 12]).toEqual([name, true]);
      expect([name, est - px > -4.2]).toEqual([name, true]);
    }
    expect(PRINT.pagePx).toBe(960);
  });
  it('the cases SHEET3 printed on 2 pages are never called one page', () => {
    expect(sheetFitsOnePage(size(exampleEntries(), {}, { unpriced: EXAMPLE_UNPRICED, paid: true }))).toBe(false);
    expect(sheetFitsOnePage(size(exampleEntries(), { coverage: 'uninsured', locality: 'IA-00' } as Ctx, { unpriced: EXAMPLE_UNPRICED }))).toBe(false);
    const heavy = parseJourney(
      'saw my regular doctor 6 times, a cardiologist, a neurologist twice, a rheumatologist, a GI doctor, an endocrinologist, blood work 5 times, a urine test, an EKG, a heart ultrasound, a holter monitor, a tilt table test, a brain MRI, a spine MRI, a chest x ray, a CT of my belly, an ultrasound of my belly, a colonoscopy, an endoscopy, a sleep study, a nerve conduction study, physical therapy 10 times, and the ER 3 times',
      SELECTABLE).filter((x) => !x.absorbed).map((x, i) => ({ key: `h${i}`, raw: x.raw, item: x.result.item ?? null, times: x.times })) as unknown as JourneyEntry[];
    expect(heavy.length).toBeGreaterThan(13);
    expect(sheetFitsOnePage(size(heavy))).toBe(false);
  });
  it('two burden cards are never claimed, whatever the rest', () => {
    expect(sheetFitsOnePage(size(journey(HUSBAND), {}, { burdens: B({ dismissed: 1, trips: 2 }) }))).toBe(false);
  });
  it('the ledger prints the computed claim, and no em-dash', () => {
    const src = readFileSync(new URL('../components/Ledger.tsx', import.meta.url), 'utf8');
    expect(src).toContain("{sheetOnePage ? 'One printed page' : 'Ready to print'}: every step so far");
    expect(src).not.toContain('<p>One printed page: every step so far');
  });
});
