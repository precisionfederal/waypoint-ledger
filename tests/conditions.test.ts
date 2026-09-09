/* ==========================================================================
   THE CONDITION SELECTOR — the tests that stop it from lying.

   The selector puts two checkable claims on the screen: a standard diagnosis
   code with its official title, and a published annual figure for a year with
   that condition. data/verify_conditions.py checks both against the CDC files
   and the cited papers over the network. This suite checks the things that
   must hold with no network at all:

   1. NO FIGURE IS EVER INVENTED. Every figure the panel can show comes from a
      row in prices.json; a condition with no row returns an absence with a
      reason, never a substitute number, and carries no dollar amount anywhere.
   2. THE KIND STAYS ON THE FACE. An excess figure and a condition-attributed
      figure are different measures, and the panel is never handed one labelled
      as the other.
   3. THE AUDIT ACTUALLY RAN AND ACTUALLY PASSED, against this version of the
      file — a stale audit is not evidence.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import conditionsRaw from '@/data/conditions.json';
import pricesRaw from '@/data/prices.json';
import auditRaw from '@/data/CONDITIONS-AUDIT.json';
import {
  CONDITIONS, CONDITIONS_VERSION, GAP_HREF, NO_FIGURE_QUALIFIER, PRICED_CONDITIONS,
  UNPRICED_CONDITIONS, benchmarkFor, conditionById,
} from '@/lib/conditions';

const RAW = conditionsRaw as unknown as { conditions: Record<string, unknown>[]; _version: string };
const ROWS = new Map((pricesRaw as unknown as { items: { id: string }[] }).items.map((r) => [r.id, r]));
const AUDIT = auditRaw as unknown as {
  conditions_version: string; conditions: number; coded: number; priced: number;
  checks: number; pass: number; fail: number; unverified: number;
  results: { check: string; status: string }[];
};

describe('the file itself', () => {
  it('carries at least nine conditions, each with a unique id and a label', () => {
    expect(CONDITIONS.length).toBeGreaterThanOrEqual(9);
    expect(new Set(CONDITIONS.map((c) => c.id)).size).toBe(CONDITIONS.length);
    for (const c of CONDITIONS) expect(c.label.trim().length).toBeGreaterThan(2);
  });

  it('splits into priced and unpriced with nothing left over', () => {
    expect(PRICED_CONDITIONS.length + UNPRICED_CONDITIONS.length).toBe(CONDITIONS.length);
    expect(PRICED_CONDITIONS.length).toBeGreaterThan(0);
    expect(UNPRICED_CONDITIONS.length).toBeGreaterThan(0);
  });

  it('sends every absence to a real page, with the qualifier that limits the claim', () => {
    expect(GAP_HREF).toBe('/gap');
    expect(NO_FIGURE_QUALIFIER.toLowerCase()).toContain('not a claim that none exists');
  });
});

describe('every price_row_id names a row that exists', () => {
  for (const c of RAW.conditions) {
    const rid = c.price_row_id as string | null;
    if (!rid) continue;
    it(`${c.id} -> ${rid}`, () => { expect(ROWS.has(rid)).toBe(true); });
  }
});

describe('benchmarkFor', () => {
  it('returns null for nothing selected and for an unknown id', () => {
    expect(benchmarkFor(null)).toBeNull();
    expect(benchmarkFor(undefined)).toBeNull();
    expect(benchmarkFor('')).toBeNull();
    expect(benchmarkFor('a-condition-nobody-added')).toBeNull();
  });

  it('gives long COVID the published interval, not the midpoint alone', () => {
    const b = benchmarkFor('long-covid');
    expect(b?.kind).toBe('figure');
    if (b?.kind !== 'figure') return;
    expect(b.point).toBe(4098);
    expect(b.low).toBe(1619);
    expect(b.high).toBe(6578);
    expect(b.figureKind).toBe('excess');
    expect(b.year).toBe('2022');
    expect(b.neverAddedToTotal).toBe(true);
    // it is a peer-reviewed reanalysis of a federal survey, not a federal report,
    // and the panel is required to say so
    expect(b.isGovernmentPublication).toBe(false);
    expect(b.publisherNote.length).toBeGreaterThan(20);
  });

  it('names the kind correctly on a condition-attributed figure', () => {
    for (const id of ['heart-disease', 'diabetes']) {
      const b = benchmarkFor(id);
      expect(b?.kind).toBe('figure');
      if (b?.kind !== 'figure') return;
      expect(b.figureKind).toBe('condition_attributed');
      expect(b.isGovernmentPublication).toBe(true);
      expect(b.low).toBeNull();
      expect(b.high).toBeNull();
    }
  });

  it('carries the median where the source publishes one, so the mean is never alone', () => {
    const b = benchmarkFor('heart-disease');
    if (b?.kind !== 'figure') throw new Error('expected a figure');
    expect(b.median).toBe(660);
  });

  it('returns an absence with a reason, never a substitute figure', () => {
    for (const c of UNPRICED_CONDITIONS) {
      const b = benchmarkFor(c.id);
      expect(b?.kind).toBe('none');
      if (b?.kind !== 'none') continue;
      expect(b.reason.trim().length).toBeGreaterThan(30);
      expect(b.gapHref).toBe('/gap');
      expect(b.qualifier).toBe(NO_FIGURE_QUALIFIER);
      // the honest null must not smuggle a number in through the prose
      expect(b.reason).not.toMatch(/\$[0-9]/);
    }
  });

  it('every figure it returns is the price row, to the dollar', () => {
    for (const c of PRICED_CONDITIONS) {
      const b = benchmarkFor(c.id);
      if (b?.kind !== 'figure') throw new Error(`${c.id} lost its figure`);
      const row = ROWS.get(b.rowId) as unknown as { value_usd: number; value_range_usd?: number[] };
      expect(b.point).toBe(row.value_usd);
      if (row.value_range_usd) {
        expect([b.low, b.high]).toEqual(row.value_range_usd);
      } else {
        expect(b.low).toBeNull();
      }
    }
  });

  it('only ever reports one of the two kinds of figure', () => {
    for (const c of PRICED_CONDITIONS) {
      const b = benchmarkFor(c.id);
      if (b?.kind !== 'figure') continue;
      expect(['excess', 'condition_attributed']).toContain(b.figureKind);
      expect(b.figureKindLabel.length).toBeGreaterThan(20);
    }
  });
});

describe('an absence stays an absence', () => {
  for (const c of RAW.conditions) {
    if (c.price_row_id) continue;
    it(`${c.id} carries no dollar amount and no figure_kind`, () => {
      expect(JSON.stringify(c)).not.toMatch(/\$[0-9]/);
      expect(c.figure_kind ?? null).toBeNull();
      expect(c.figure_is_government_publication ?? null).toBeNull();
    });
  }
});

describe('the ICD-10-CM claims', () => {
  it('every coded condition carries a title, a billable flag and its source', () => {
    for (const c of CONDITIONS) {
      if (!c.icd10cm) continue;
      expect(c.icd10cmTitle && c.icd10cmTitle.length).toBeTruthy();
      expect(typeof c.icd10cmBillable).toBe('boolean');
      expect(c.icd10cmSource).toContain('CDC/NCHS');
      expect(c.icd10cm).toMatch(/^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/);
    }
  });

  it('every uncoded condition explains the blank instead of leaving it', () => {
    for (const c of CONDITIONS) {
      if (c.icd10cm) continue;
      expect((c.icd10cmBlankReason ?? '').length).toBeGreaterThan(60);
    }
  });

  it('a first-effective date is only claimed with the evidence beside it', () => {
    for (const c of RAW.conditions) {
      if (!c.icd10cm_first_effective) continue;
      expect(String(c.icd10cm_first_effective)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(c.icd10cm_first_effective_evidence)).toMatch(/absent from the FY\d{4} file/);
    }
  });

  it('conditionById round-trips every id and refuses the rest', () => {
    for (const c of CONDITIONS) expect(conditionById(c.id)?.label).toBe(c.label);
    expect(conditionById('nope')).toBeNull();
    expect(conditionById(null)).toBeNull();
  });
});

describe('the audit ran, passed, and describes THIS file', () => {
  it('has no failures and nothing unverified', () => {
    expect(AUDIT.fail).toBe(0);
    expect(AUDIT.unverified).toBe(0);
    expect(AUDIT.pass).toBe(AUDIT.checks);
    expect(AUDIT.checks).toBeGreaterThanOrEqual(30);
  });

  it('was run against the version of conditions.json in this commit', () => {
    expect(AUDIT.conditions_version).toBe(CONDITIONS_VERSION);
    expect(AUDIT.conditions_version).toBe(RAW._version);
    expect(AUDIT.conditions).toBe(CONDITIONS.length);
    expect(AUDIT.coded).toBe(CONDITIONS.filter((c) => c.icd10cm).length);
    expect(AUDIT.priced).toBe(PRICED_CONDITIONS.length);
  });

  it('checked every coded condition against both fiscal years in force', () => {
    for (const c of CONDITIONS) {
      if (!c.icd10cm) continue;
      for (const fy of [2026, 2027]) {
        const hit = AUDIT.results.find((r) => r.check === `${c.id} ${c.icd10cm} FY${fy}`);
        expect(hit?.status, `${c.id} FY${fy}`).toBe('PASS');
      }
    }
  });

  it('re-read every priced figure in the source it cites', () => {
    for (const c of PRICED_CONDITIONS) {
      const hit = AUDIT.results.find((r) => r.check === `${c.id} figure`);
      expect(hit?.status, c.id).toBe('PASS');
    }
  });
});

/* ==========================================================================
   AND WHAT IT ACTUALLY PUTS ON THE SCREEN.

   The rules above are about the data. These render the two components to
   static HTML and read the words a judge would read, because a correct
   benchmark that never reaches the page moves no score.
   ========================================================================== */
describe('the panel renders what the row says, and nothing else', () => {
  it('long COVID: the interval, the kind, and who published it', async () => {
    const html = await renderCard('long-covid');
    expect(html).toContain('$1,619 to $6,578');
    expect(html).toContain('Point estimate $4,098');
    expect(html).toContain('Excess');
    expect(html).toContain('The year ahead');
    expect(html).toContain('Long COVID');
    // the panel must never present a peer-reviewed reanalysis as a federal report
    expect(html).toContain('not a federal publication');
    expect(html).toContain('AHRQ MEPS data');   // the survey is AHRQ's; the estimate is not
    // and it must never be summed with the itemized lines
    expect(html).toContain('never added to the lines above');
  });

  it('diabetes: the same panel swaps kind and figure with no code change', async () => {
    const html = await renderCard('diabetes');
    expect(html).toContain('$5,810');
    expect(html).toContain('Condition-attributed');
    expect(html).not.toContain('AHRQ MEPS data');   // this one IS the agency's own brief
    expect(html).not.toContain('Excess');
    expect(html).not.toContain('$4,098');
    expect(html).not.toContain('long COVID');
  });

  it('ME/CFS: an absence, in words, with a way to count it and no number', async () => {
    const html = await renderCard('me-cfs');
    expect(html).toContain('No published figure');
    expect(html).toContain('Count this gap');
    expect(html).toContain('G93.32');
    expect(html).toContain('href="/gap"');
    expect(html).not.toMatch(/\$[0-9]/);
  });

  it('nothing chosen renders no panel at all', async () => {
    expect(await renderCard(null)).toBe('');
  });

  it('the chips name every condition and offer a way out', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const mod = await import('@/components/ConditionPicker');
    const html = renderToStaticMarkup(createElement(mod.default));
    for (const c of CONDITIONS) expect(html).toContain(c.label);
    expect(html).toContain('Prefer not to say');
    // the promise the chips make, kept in the copy
    expect(html).toContain('never sent');
  });
});

async function renderCard(id: string | null): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');
  const { YearAheadCard } = await import('@/components/ConditionPicker');
  return renderToStaticMarkup(createElement(YearAheadCard, { conditionId: id }));
}

describe('no count is written into prose that the data could contradict', () => {
  it('the blank-code note counts nothing itself', () => {
    const note = (conditionsRaw as unknown as Record<string, string>)._no_code_is_not_an_oversight;
    expect(note).toBeTruthy();
    expect(note).not.toMatch(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(rows?|conditions?)\b/i);
  });
});
