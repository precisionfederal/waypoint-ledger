/* Judge panel 15 Oct #2.2 (B-2): "See it done with an example" loaded an unlabelled
   ledger, and a sentence typed next merged into it: "you said 'a first visit with a
   cardiologist; saw a neurologist once'", 9 lines. The home example is now labelled
   on the ledger, survives the full-page load that opens it, and the first words a
   person adds replace it. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { exampleLedger, isExampleId, storyBase } from '../lib/store';
import type { JourneyEntry } from '../lib/types';

const store = readFileSync('lib/store.tsx', 'utf8');
const ledger = readFileSync('components/Ledger.tsx', 'utf8');
const home = readFileSync('app/page.tsx', 'utf8');
const fn = (name: string) => {
  const at = store.indexOf(`const ${name} = useCallback(`);
  expect(at, name).toBeGreaterThan(-1);
  return store.slice(at, store.indexOf('}, [', at));
};

describe('B-2: a typed story replaces the example', () => {
  const ex = exampleLedger();
  const mine: JourneyEntry[] = [{ key: 'm1', raw: 'saw a neurologist once', item: null, times: 1 }];

  it('storyBase: an example yields an empty ledger; her own lines are kept', () => {
    expect(storyBase('home', ex)).toEqual([]);
    expect(storyBase('lyme', ex)).toEqual([]);
    expect(storyBase(null, mine)).toBe(mine);
  });

  it('the home example is an example id, and nothing else from a saved copy is', () => {
    expect(isExampleId('home')).toBe(true);
    expect(isExampleId('lyme')).toBe(true);
    for (const v of [null, undefined, '', 'HOME', '__proto__', 'toString', 1]) expect(isExampleId(v), String(v)).toBe(false);
  });

  it('loadExample marks the ledger as the home example', () => {
    expect(fn('loadExample')).toContain("setExample('home')");
    expect(fn('loadExample')).not.toContain('setExample(null)');
  });

  it('every way of adding words starts from storyBase and clears the example with the toast', () => {
    const clear = fn('clearExampleFor');
    expect(clear).toContain('storyBase(exampleRef.current, entriesRef.current)');
    expect(clear).toContain('setExample(null)');
    expect(clear).toContain("'The example was cleared; these are your lines.'");
    for (const name of ['addStory', 'addSegments', 'addOne', 'addItem']) expect(fn(name), name).toContain('clearExampleFor()');
    expect(fn('addStory')).toContain('mergeEntries(base, add)');
    expect(fn('addSegments')).toContain('mergeEntries(base, add)');
  });

  it('the example flag is saved with the ledger, so the label survives the page load that opens it', () => {
    expect(store).toMatch(/flags, \.\.\.\(example \? \{ example \} : \{\}\) \}/);
    expect(store).toContain('if (isExampleId(st.example)) { exampleRef.current = st.example; setExample(st.example); }');
  });

  it('the ledger says so, and the total is the example\'s while it shows', () => {
    expect(ledger).toContain("st.example === 'home'");
    expect(ledger).toContain('An example we wrote, not anyone&rsquo;s record. Type your own and it replaces this.');
    expect(ledger).toContain(`label={st.example ? "Medicare's price for the example's care" : "Medicare's price for the care you listed"}`);
  });

  it('home says the example is replaced, not joined', () => {
    expect(home).toContain('The example we wrote is on your ledger. What you type here replaces it.');
  });
});
