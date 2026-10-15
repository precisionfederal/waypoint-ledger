/* Judge panel 15 Oct #2.3 (B-3): at 390 px the open Medicare card put the ledger
   total 1,085 px down the page. Once the ledger has lines the card folds to a closed
   "On Medicare? Bring in your record"; the CMS synthetic example's button stays
   outside the fold, because the filing's access step names it. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MedicareImport, { FOLD_SUMMARY, importFolded } from '../components/MedicareImport';
import { StoreProvider } from '../lib/store';
import { SYNTHETIC_TRY } from '../lib/bluebutton';

const src = readFileSync('components/MedicareImport.tsx', 'utf8');
const status = (connected: boolean) => ({ ok: true, configured: true, connected, environment: 'sandbox' });

describe('B-3: the number first', () => {
  it('folds only when the ledger has lines and the person is not just back from CMS', () => {
    expect(importFolded(true, 9, null)).toBe(true);
    expect(importFolded(true, 9, status(false))).toBe(true);
    expect(importFolded(true, 9, status(true))).toBe(false);
    expect(importFolded(true, 0, status(false))).toBe(false);
    expect(importFolded(false, 9, status(false))).toBe(false);
  });

  it('the fold is a closed details with the summary, and the try button sits outside it', () => {
    expect(FOLD_SUMMARY).toBe('On Medicare? Bring in your record');
    const fold = src.slice(src.indexOf('if (folded && !trying)'), src.indexOf('return (\n    <>'));
    expect(fold).toContain('<details style=');
    expect(fold).not.toMatch(/<details[^>]*\bopen\b/);
    expect(fold).toContain('<summary><strong>{FOLD_SUMMARY}</strong></summary>');
    const after = fold.slice(fold.indexOf('</details>'));
    expect(after).toContain('{tryButton}');
    expect(fold.slice(0, fold.indexOf('</details>'))).not.toContain('{tryButton}');
    expect(src).toContain(`const TRY_LABEL = '${SYNTHETIC_TRY}';`);
  });

  it('an empty ledger keeps the open card with the button', () => {
    const html = renderToStaticMarkup(createElement(StoreProvider, null, createElement(MedicareImport)));
    expect(html).toContain('data-testid="bb-try"');
    expect(html).toContain(SYNTHETIC_TRY);
    expect(html).not.toContain('<details');
  });
});
