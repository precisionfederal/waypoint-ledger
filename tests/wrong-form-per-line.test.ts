/* Merge round 5 (fix-judge4's report): on the example ledger, Wrong on the
   cardiologist's line opened "What did you actually pay?" under the
   neurologist's line too. Both lines carry cms-99204, and the open form was
   keyed by the figure's id. It is keyed by the line's own key now; the answer
   itself stays one per figure (a repeat on one figure is refused server-side).
   Browser check: scratch chunk/wrongform.mjs. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { exampleLines } from '../components/sheet/example';

const SRC = readFileSync(new URL('../components/Ledger.tsx', import.meta.url), 'utf8');

describe('the paid form opens under the line whose Wrong was pressed, only', () => {
  it('the example has two lines on one figure, so keying by figure would open two forms', () => {
    const ids = exampleLines().map(([, id]) => id);
    expect(ids.filter((id) => id === 'cms-99204')).toHaveLength(2);
  });
  it('askPaid holds a line key: set from the line, compared with the line, never with the figure id', () => {
    expect(SRC).toContain("function thumb(it: PriceItem, v: 'right' | 'wrong', lineKey: string)");
    expect(SRC).toContain('setAskPaid(lineKey)');
    expect(SRC).toContain('{askPaid === l.entry.key && !f && (');
    expect(SRC).toContain("onClick={() => thumb(it, 'wrong', l.entry.key)}");
    expect(SRC).not.toMatch(/askPaid === it\.id|setAskPaid\(it\.id\)/);
    // one id per line, so two open forms could never share a label target
    expect(SRC).toContain('<input id={`paid-${l.entry.key}`}');
  });
});
