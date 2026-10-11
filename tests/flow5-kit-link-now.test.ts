/* FLOW5 flow5-5 (2026-10-01): on a phone the survey link shows under the name
   box as it is made, with its own Copy, and is brought into view once. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('flow5-5 the kit link on a phone', () => {
  const tsx = readFileSync('components/OrgKit.tsx', 'utf8');
  const css = readFileSync('app/adopt/kit/kit.module.css', 'utf8');
  it('sits right under the name box, only once a label is ready', () => {
    const at = tsx.indexOf('data-testid="kit-link-now"');
    expect(at).toBeGreaterThan(tsx.indexOf('id="kit-name"'));
    expect(at).toBeLessThan(tsx.indexOf('Link label (made from the name'));
    expect(tsx).toContain("{ready && (\n              <p className={s.linkNow} data-testid=\"kit-link-now\" ref={linkNowRef}>");
    expect(tsx).toContain("onClick={() => doCopy(link, 'Link')}>Copy</button>");
  });
  it('is shown under 480 px only, never printed, and scrolled into view once', () => {
    expect(css).toMatch(/\.linkNow \{ display: none; \}\s*@media \(max-width: 479\.98px\) \{\s*\.linkNow \{ display: flex;/);
    expect(css).toContain('@media print { .linkNow { display: none; } }');
    expect(tsx).toContain("if (el && window.matchMedia('(max-width: 479.98px)').matches) el.scrollIntoView({ block: 'nearest' });");
  });
});
