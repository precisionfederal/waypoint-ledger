/* ==========================================================================
   LEDGER, ROUND 2 (beta night 2026-09-30). One test per finding the ledger
   fixer closed that the other test files do not already pin.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { csvCell } from '../lib/sheet';
import { sameJourney, savedRowsOf, splitSaved, UNPRICEABLE } from '../lib/store';
import { validateJourney } from '../lib/price-api';
import { TABLE } from '../lib/table';
import type { JourneyEntry } from '../lib/types';

const read = (p: string) => readFileSync(p, 'utf8');

describe('security S-06 — the client CSV cannot carry a live formula', () => {
  it('neutralises a cell a spreadsheet would execute', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('+1+1')).toBe(`"'+1+1"`);
    expect(csvCell('\tx')).toBe(`"'\tx"`);
  });
  it('leaves plain numbers and words alone', () => {
    expect(csvCell('-12.5')).toBe('"-12.5"');
    expect(csvCell('95.19')).toBe('"95.19"');
    expect(csvCell('saw my doctor')).toBe('"saw my doctor"');
  });
  it('the ledger builds every CSV cell through it', () => {
    expect(read('components/Ledger.tsx')).toContain("rows.map((r) => r.map(csvCell).join(','))");
  });
});

describe('security S-16 — the address bar never writes on the Medicare panel', () => {
  it('shows only reasons the callback sends', async () => {
    const { whyText } = await import('../components/ImportClaims');
    expect(whyText('state-mismatch')).toBe('That sign-in did not start on this site. Please start again.');
    expect(whyText('That sign-in link had expired. Please start again.')).toBe('That sign-in link had expired. Please start again.');
    expect(whyText('Your Medicare account is suspended, call 1-800-SCAM')).toBeNull();
    expect(whyText(null)).toBeNull();
    expect(whyText('__proto__')).toBeNull();
  });
});

describe('auth S5 — a saved link carries every line, blanks included', () => {
  const doc = TABLE.find((t) => t.id === 'cms-99213')!;
  const entries = [
    { key: 'a', raw: 'saw my regular doctor', item: doc, times: 3 },
    { key: 'b', raw: 'they put electrodes on my legs', item: null, times: 1 },
  ] as unknown as JourneyEntry[];
  const lostWork = UNPRICEABLE.find((u) => u.id === 'lost-work')!;

  it('sends the unpriced line and the named unpriceable cost, and the server accepts them', () => {
    const { rows, omitted } = savedRowsOf(entries, ['lost-work']);
    expect(omitted).toBe(0);
    expect(rows).toEqual([
      { raw: 'saw my regular doctor', itemId: 'cms-99213', times: 3 },
      { raw: 'they put electrodes on my legs', itemId: null, times: 1 },
      { raw: lostWork.label, itemId: null, times: 1 },
    ]);
    const v = validateJourney({ entries: rows }, TABLE) as { entries?: unknown[]; error?: string };
    expect(v.error).toBeUndefined();
    expect(v.entries).toHaveLength(3);
  });

  it('reads the same ledger back: the blank stays a line, the named cost goes back to its own list', () => {
    const { rows } = savedRowsOf(entries, ['lost-work']);
    const back = splitSaved(rows);
    expect(back.unpriced).toEqual(['lost-work']);
    expect(back.lines.map((l) => l.itemId)).toEqual(['cms-99213', null]);
  });

  it('never tells the ledger "Every line carries a published federal figure" when a blank came back', () => {
    // the stat is chosen from blankLines; a returned blank keeps it a count
    const src = read('components/Ledger.tsx');
    expect(src).toContain('const blankLines = (gaps.cats.find(([id]) => id === NO_FIGURE)?.[1].lines ?? 0) + gaps.named.length;');
    const back = splitSaved(savedRowsOf(entries, ['lost-work']).rows);
    expect(back.lines.some((l) => !l.itemId) || back.unpriced.length > 0).toBe(true);
  });
});

describe('auth S3 — opening a saved link never replaces a different ledger unasked', () => {
  it('knows when two journeys are the same', () => {
    const a = [{ raw: 'x', itemId: 'cms-99213', times: 2 }];
    expect(sameJourney(a, [{ raw: 'x', itemId: 'cms-99213', times: 2 }])).toBe(true);
    expect(sameJourney(a, [{ raw: 'x', itemId: 'cms-99213', times: 3 }])).toBe(false);
    expect(sameJourney(a, [])).toBe(false);
  });
  it('holds the link until the person chooses, and the ledger offers both', () => {
    const store = read('lib/store.tsx');
    expect(store).toContain('setPending({ entries: load(incoming.lines), unpriced: incoming.unpriced });');
    const ledger = read('components/Ledger.tsx');
    expect(ledger).toContain('Open the saved ledger');
    expect(ledger).toContain('Keep mine');
  });
});

describe('the drawer and the total', () => {
  it('desktop F22 — the drawer goes h2 then h3, never h2 then h4', () => {
    const d = read('components/LineDrawer.tsx');
    expect(d).not.toMatch(/<h4/);
    expect(d).toContain('<h3 className="cov-h">Describes</h3>');
  });
  it('desktop F07 — opening the source fold scrolls it into view', () => {
    expect(read('components/LineDrawer.tsx')).toContain('<details className="drawer-more" onToggle={revealMore}>');
  });
  it('desktop F05 — the count starts at $0, never at the answer, and never goes below it', () => {
    const t = read('components/TotalReveal.tsx');
    expect(t).not.toContain('useState(totalUsd)');
    expect(t).toContain('Math.max(0, (now - start) / DURATION_MS)');
  });
  it('desktop F06 — the static ledger holds a screen of space before it hydrates', () => {
    expect(read('components/Ledger.tsx')).toContain('<div className="ledger-loading" aria-busy="true">');
    expect(read('app/product.css')).toContain('.ledger-loading{min-height:100vh}');
  });
});

describe('the lines come first (desktop F02, phone UXM-09)', () => {
  const ledger = read('components/Ledger.tsx');
  it('the table follows the band and comes before every fold, the chart and the exports', () => {
    const band = ledger.indexOf('<CareGoneWithout />');
    const table = ledger.indexOf('<section className="card table-card" id="lines">');
    expect(band).toBeGreaterThan(0);
    expect(table).toBeGreaterThan(band);
    for (const later of ['<BurdenLedger />', 'Where the cost sits', 'FHIR R4', 'The year figure']) {
      expect(ledger.indexOf(later), later).toBeGreaterThan(table);
    }
  });
  it('counts are answers, never people, on the thumb reply', () => {
    expect(ledger).not.toMatch(/person to answer on this figure/);
    expect(ledger).toContain('answer on this figure');
  });
});
