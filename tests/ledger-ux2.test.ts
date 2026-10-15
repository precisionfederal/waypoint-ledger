/* UX-2 · the ledger lane.

   The UX-1 adversary scored the live build 3/5 and named five faults on this
   page: two nouns for one count, the same Save button twice on one phone screen,
   the strongest fact printed as a zero, the third step buried in a tray, an
   export labelled with a word the file did not earn, and a drawer that argued
   about provenance before it offered it.

   Every fault below is pinned by the words the fix ships, so a later edit that
   walks one of them back fails here instead of on a judge's screen. These are
   source assertions on purpose: the browser proof lives in
   ../winloop/UX-2/after/ledger-*.jpg, and this is the part that has to keep
   holding after those screenshots are stale. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ledger = readFileSync('components/Ledger.tsx', 'utf8');
const drawer = readFileSync('components/LineDrawer.tsx', 'utf8');
const at = (hay: string, needle: string) => {
  const i = hay.indexOf(needle);
  expect(i, `not found in source: ${needle}`).toBeGreaterThan(-1);
  return i;
};

describe('UX-2 fix 6 — one noun for one number, one button per action', () => {
  it('the stat above the bar uses the same noun the bar uses', () => {
    /* FLOW patient-14 (core): the count moved from its own stat card into the
       total's line ("5 priced lines · 6 visits and tests"); the noun is unchanged. */
    expect(readFileSync('components/TotalReveal.tsx', 'utf8')).toContain("'visits and tests'");
    expect(ledger).toContain('visits={appointments}');
    expect(ledger).toContain("'visits and tests'");
    /* the old noun survives only in the comment that records why it went */
    expect(ledger).not.toContain("lbl: 'Steps in your journey'");
  });

  it('the sub-line counts lines that are care, the same lines the stat counts (desktop F17)', () => {
    /* round 4 (R3 brainfog BF-16): no second "distinct" count under the stat */
    expect(ledger).not.toContain('distinct`');
    expect(ledger).toContain('const careEntries = st.entries.filter((e) => e.item);');
  });

  it('the sticky bar stands down while the card it duplicates is in the viewport', () => {
    expect(ledger).toContain('new IntersectionObserver');
    expect(ledger).toContain('setShareInView');
    expect(ledger).toContain('{!shareInView && (');
    /* the observer watches the card that carries the other copy of the button */
    expect(ledger).toContain('<section className="card actions" ref={setTakeItEl}>');
  });
});

describe('UX-2 fix 10 — the strongest fact is not displayed as a zero', () => {
  it('a ledger with nothing missing reads as a statement, not a numeral', () => {
    expect(ledger).toContain("? { lbl: 'carries a published federal figure', val: 'Every visit and test', sub: null, line: true }");   // patient2-9: folds to one line on a phone
  });

  it('the count comes straight back the moment something IS missing', () => {
    expect(ledger).toContain(": { lbl: 'No published price', val: String(blankLines), sub: 'left blank, not estimated' }");
  });
});

describe('UX-2 fix 9, superseded in round 2 (desktop F16) — one surface for care that did not happen', () => {
  const band = readFileSync('components/CareGoneWithout.tsx', 'utf8');
  it('the Step 3 band that repeated the band under the total is gone', () => {
    expect(ledger).not.toContain('id="step3"');
    expect(ledger).not.toContain('Report the gap');
    expect(ledger).not.toContain('produces no row in any federal file');
  });
  it('its route to /gap lives in the band under the total', () => {
    expect(band).toContain('<Link href="/gap">Count the rest of what went uncounted</Link>');
  });
  it('the promoted action is not also offered in the tray at the foot', () => {
    expect(ledger).not.toContain('Count what no dataset counted');
    expect(ledger).not.toContain('<article className="act-card"><span className="act-ic"><Icon.Shield />');
  });
});


describe('UX-2 fix 13 — the export is labelled what the file actually is', () => {
  it('the control says FHIR R4 and says what that means on hover', () => {
    expect(ledger).toContain('FHIR R4');
    expect(ledger).toContain('title="HL7 FHIR R4 Bundle, the format the rest of health IT reads"');
  });

  it('the label is only ever attached to the export lib/fhir.ts really emits', () => {
    expect(ledger).toContain("import { toFhirBundle } from '@/lib/fhir'");
    expect(ledger).toContain("'application/fhir+json'");
  });
});

describe('UX-2 fix 14 — the drawer answers "show me the source" in one glance', () => {
  it('the link to the published file sits under the figure and above every other measure', () => {
    /* UX-3 rebuilt this drawer into seven blocks (tests/drawer.test.ts pins the
       order and proves no fact was lost). The rule below is unchanged; only the
       anchors moved, because the gradient card is now block 2 and the CY2024
       provenance is inside "Where it comes from". */
    const figure = at(drawer, '${ds.block} ${ds.figure}');
    const link = at(drawer, 'Open the source and check this number');
    const alternate = at(drawer, '<p className={ds.eyebrow}>The other published measure</p>');
    const fileTable = at(drawer, '<b>Other published measure</b> <span>· CY2024 claims file (a different file, not the source of');
    expect(link).toBeGreaterThan(figure);
    expect(link).toBeLessThan(alternate);
    expect(link).toBeLessThan(fileTable);
  });

  it('nothing below it was removed — the file, the row and the hash still ship', () => {
    for (const kept of ['<dt>File</dt>', '<dt>Row</dt>', '<dt>SHA-256</dt>', '<dt>Retrieved</dt>']) {
      expect(drawer).toContain(kept);
    }
  });

  it('the note about which file the link opens travels with the link', () => {
    const link = at(drawer, 'Open the source and check this number');
    const note = at(drawer, 'the file this charge is in, not the fee schedule');
    expect(note - link).toBeLessThan(400);
  });
});
