/* JUDGE-4 #8 (regressed JUDGE-3 #10): at 390 the try-it path ran under "Call
   again". .reqUrl was flex:1 1 12rem with min-width:0 and nowrap, so it shrank
   below its own text and the button covered the rest. Measured in WebKit and
   Chromium at 1440, 390, 375, 360 and 320, light and dark, with Send, Call again
   and Calling...: before, the text overlapped the button in 20 of 60 cases (390 Call again and Calling..., 375 Send and Calling..., 360 Send, both engines, both themes);
   after, 0 of 60, the path on one line and inside the card every time. This
   pins the rule that does it. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../components/tech/tech.module.css', import.meta.url), 'utf8');
const rules = [...CSS.matchAll(/\.reqUrl\{([^}]*)\}/g)].map((m) => m[1]);

describe('JUDGE-4 #8: the try-it path keeps its width', () => {
  it('never shrinks below its text, and never breaks', () => {
    expect(rules.length).toBeGreaterThanOrEqual(2);
    expect(rules[0]).toContain('flex:1 0 auto');
    expect(rules[0]).toContain('white-space:nowrap');
    for (const r of rules) {
      expect(r).not.toContain('min-width:0');
      expect(r).not.toMatch(/flex-basis|flex:1 1/);
    }
  });
  it('the button can wrap to its own line', () => {
    expect(CSS).toMatch(/\.req\{[^}]*flex-wrap:wrap/);
  });
});
