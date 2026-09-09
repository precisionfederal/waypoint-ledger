/* ==========================================================================
   THE REGISTER'S PROMISES, AS TESTS.

   1. A state health department can find itself in the instrument.
   2. A count too small to publish without identifying somebody is withheld,
      and what was withheld is still counted.
   3. Every priced row resolves to the body that published it, so no correction
      can ever be printed without an addressee.
   4. A correction leaves here as a citation block and a CSV a person at that
      body can act on with no join to anything of ours — and the CSV can never
      execute in their spreadsheet.
   ========================================================================== */

import { describe, it, expect } from 'vitest';
import { CONTEXT, CONTEXT_KEYS, STATES, SMALL_CELL_MIN, suppressSmallCells, dictionary } from '../lib/survey';
import { TABLE } from '../lib/table';
import {
  publisherOf, documentOf, fitRate, citationText, correctionsCsv, csvCell, basisLabel,
  CORRECTIONS_CSV_HEADER, BASIS_LABEL, PUBLISHER_FULL, PUBLISHER_ROUTE, type CiteRow,
} from '../lib/register-cite';

const CTX = CONTEXT as Record<string, { label: string; options: string[] }>;

describe('a state or territory can find itself', () => {
  it('carries the 50 states, DC and the five territories', () => {
    expect(STATES).toHaveLength(56);
    for (const s of ['Iowa', 'District of Columbia', 'Puerto Rico', 'Guam', 'American Samoa', 'Northern Mariana Islands', 'U.S. Virgin Islands', 'Wyoming']) {
      expect(STATES).toContain(s);
    }
    expect(new Set(STATES).size).toBe(STATES.length);
  });

  it('is an optional context field on the instrument, so the API validates it', () => {
    expect(CONTEXT_KEYS).toContain('state');
    expect(CTX.state.options).toEqual(STATES);
    expect(CTX.state.label).toMatch(/state/i);
  });

  it('is described in the published data dictionary, with the suppression rule', () => {
    const row = dictionary().find((r) => r.field === 'ctx_state');
    expect(row).toBeTruthy();
    expect(row!.values).toContain('50 states');
    expect(row!.note).toContain(String(SMALL_CELL_MIN));
    expect(row!.note.toLowerCase()).toContain('withheld');
  });
});

describe('small cells are withheld, and the withholding is counted', () => {
  it('publishes a cell at the threshold and withholds the one below it', () => {
    const r = suppressSmallCells({ Iowa: 12, Texas: 11, Ohio: 10, Maine: 1 });
    expect(r.shown).toEqual({ Iowa: 12, Texas: 11 });
    expect(r.suppressedCells).toBe(2);
    expect(r.suppressedTotal).toBe(11);
    expect(r.min).toBe(SMALL_CELL_MIN);
  });

  it('never counts an empty cell as withheld, and survives no input at all', () => {
    expect(suppressSmallCells({ Iowa: 0 })).toMatchObject({ shown: {}, suppressedCells: 0, suppressedTotal: 0 });
    expect(suppressSmallCells({})).toMatchObject({ shown: {}, suppressedCells: 0, suppressedTotal: 0 });
  });

  it('takes an explicit threshold', () => {
    expect(suppressSmallCells({ Iowa: 3 }, 3).shown).toEqual({ Iowa: 3 });
    expect(suppressSmallCells({ Iowa: 3 }, 4).shown).toEqual({});
  });
});

describe('every priced row has an addressee', () => {
  it('resolves each of the table rows to a publisher we can name in full', () => {
    for (const it of TABLE) {
      const p = publisherOf(it.sourceTitle);
      expect(PUBLISHER_FULL[p], `${it.id} → ${it.sourceTitle}`).toBeTruthy();
      expect(PUBLISHER_ROUTE[p]).toBeTruthy();
    }
  });

  it('reads the publisher off the row exactly as the table writes it', () => {
    expect(publisherOf('CMS, CY2026 National Physician Fee Schedule')).toBe('CMS');
    expect(publisherOf('AHRQ, MEPS Statistical Brief #484')).toBe('AHRQ');
    expect(publisherOf('U.S. Bureau of Labor Statistics, Usual Weekly Earnings, Q2 2026')).toBe('BLS');
    expect(publisherOf('Neba R, Pedaprolu LS, et al., 2024')).toBe('Published research');
  });

  it('splits the document out of the source title', () => {
    expect(documentOf('AHRQ, MEPS Statistical Brief #484')).toBe('MEPS Statistical Brief #484');
    expect(documentOf('No comma here')).toBe('No comma here');
  });

  it('assigns every publisher in the shipped table to a federal body or says it is not one', () => {
    const pubs = new Set(TABLE.map((t) => publisherOf(t.sourceTitle)));
    expect(pubs.has('CMS')).toBe(true);
    expect(pubs.has('AHRQ')).toBe(true);
  });
});

const ROW: CiteRow = {
  priceId: 'cms-99213',
  label: "Doctor's office visit, established patient, low complexity",
  code: 'CPT 99213',
  valueUsd: 95.19,
  year: '2026',
  basis: 'allowed',   // the normalised PriceItem value; lib/table.ts maps 'allowed_amount' to it
  geography: 'United States, national',
  population: 'Medicare Part B fee-for-service beneficiaries',
  sourceTitle: 'CMS, CY2026 National Physician Fee Schedule',
  sourceUrl: 'https://www.cms.gov/example',
  confirmedRight: 7,
  flaggedWrong: 3,
  medianBelievedUsd: 210,
};

describe('a correction leaves here in a form the publisher can act on', () => {
  it('reports the fit rate over the thumbs actually given, and nothing when there are none', () => {
    expect(fitRate(7, 3)).toBe(70);
    expect(fitRate(1, 2)).toBe(33);
    expect(fitRate(0, 0)).toBeNull();
  });

  it('writes a citation block carrying the row, the code, the figure and the count', () => {
    const t = citationText(ROW, '2026-09-09T12:00:00.000Z', 'https://waypoint-ledger.pages.dev');
    expect(t).toContain('cms-99213');
    expect(t).toContain('CPT 99213');
    expect(t).toContain('$95.19');
    expect(t).toContain('https://www.cms.gov/example');
    expect(t).toContain('Centers for Medicare & Medicaid Services');
    expect(t).toContain('10 responses');
    expect(t).toContain('7 say the figure describes them, 3 say it does not');
    expect(t).toContain('70% say it fits');
    expect(t).toContain('$210.00');
    expect(t).toContain('allowed (the negotiated or fee-schedule amount)');
    expect(t).toContain('2026-09-09T12:00:00.000Z');
    expect(t).toContain('https://waypoint-ledger.pages.dev/method');
  });

  it('invents no dollar figure: every $ in the block is one of the row\'s own numbers', () => {
    const t = citationText(ROW, '2026-09-09T12:00:00.000Z', '');
    const dollars = t.match(/\$[\d,]+\.\d{2}/g) ?? [];
    expect(dollars.sort()).toEqual(['$210.00', '$95.19']);
  });

  it('says so plainly when a row has no published value and nobody reported paying anything', () => {
    const t = citationText({ ...ROW, valueUsd: null, medianBelievedUsd: null }, '2026-09-09', '');
    expect(t).toContain('not published');
    expect(t).toContain('none reported');
    expect(t).not.toContain('$0');
  });

  it('exports a CSV with the provenance a stranger needs to act, and no join to us', () => {
    const csv = correctionsCsv([ROW], '2026-09-09T12:00:00.000Z');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(CORRECTIONS_CSV_HEADER.join(','));
    expect(lines).toHaveLength(2);
    for (const field of ['source_agency', 'source_document', 'source_url', 'published_value_usd', 'basis', 'basis_label', 'fit_rate_pct', 'counted_as_of']) {
      expect(CORRECTIONS_CSV_HEADER).toContain(field);
    }
    expect(lines[1]).toContain('CMS');
    expect(lines[1]).toContain('CY2026 National Physician Fee Schedule');
    expect(lines[1]).toContain('95.19');
    expect(lines[1]).toContain('70');
  });

  it('gives the basis code and what the code means, and never invents a third thing', () => {
    expect(basisLabel('allowed')).toBe('allowed (the negotiated or fee-schedule amount)');
    expect(basisLabel('wage')).toBe('wage (earnings, used for valuing time)');
    expect(basisLabel('something-new')).toBe('something-new');
    for (const b of new Set(TABLE.map((t) => t.basis))) expect(BASIS_LABEL[b], `basis ${b}`).toBeTruthy();
  });

  it('never lets a cell run as a formula when the agency opens it', () => {
    expect(csvCell('=cmd|/c calc')).toBe("'=cmd|/c calc");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    const csv = correctionsCsv([{ ...ROW, label: '=HYPERLINK("http://x")' }], '2026-09-09');
    expect(csv).toContain('"\'=HYPERLINK(""http://x"")"');
  });
});
