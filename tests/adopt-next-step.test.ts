/* /adopt Standards: the "Next step" column (VISUAL-4b adopt2, JUDGE-3 fix 15; the
   kickoff's "Clear next steps for scale and reuse"). Pins the rules the column was
   written under: one cell per standard, no dates, nothing scheduled or funded, the
   validator figures quoted from the one dated record of that run, and the Blue
   Button cell stating the sandbox import's real state. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FHIR_VALIDATION } from '../components/OrgKitAgency';

const adopt = readFileSync(join(__dirname, '..', 'components', 'Adopt.tsx'), 'utf8');
const table = adopt.slice(adopt.indexOf('<Fold id="standards"'), adopt.indexOf('<Fold id="tell-us"'));
const cells = [...table.matchAll(/<td data-label="Next step"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);

describe('/adopt Standards: Next step column', () => {
  it('has a header and one cell for each of the six rows', () => {
    expect(table).toContain('<th scope="col">Next step</th>');
    expect(cells.length).toBe(6);
  });
  it('fills the Blue Button cell with today\'s true state, word for word', () => {
    expect(cells[2].trim()).toBe('Apply to CMS for production access, so a person can bring in their own Medicare record.');
  });
  it('states steps only: no date, no schedule, no funding', () => {
    for (const c of cells) {
      expect(c).not.toMatch(/\b(19|20)\d\d\b|January|February|March|April|May|June|July|August|September|October|November|December|Q[1-4]\b/);
      expect(c).not.toMatch(/scheduled|funded|planned for|will be live|by the end/i);
      expect(c).not.toMatch(/—/);
    }
  });
  it('quotes the HL7 validator result exactly as /developers records it', () => {
    expect(cells[0]).toContain(`${FHIR_VALIDATION.errors} errors, ${FHIR_VALIDATION.warnings} warnings`);
    expect(cells[0]).toContain('/developers#agency-reuse');
  });
});

/* QA 2026-10-15: at 1440 px the Today pill sits in the 13rem first grid column, and the
   shared trust pill rule (white-space:nowrap) pushed "Three candidate elements named" and
   "Connected to the CMS sandbox" across the "What that means here" column. The adopt grid
   must let the Today cell and its pill wrap, with a selector more specific than the
   shared `.std td:nth-of-type(1) strong` rule. */
describe('/adopt Standards: the Today pill wraps inside its column', () => {
  const css = readFileSync(join(__dirname, '..', 'components', 'adopt.module.css'), 'utf8');
  const wide = css.slice(css.indexOf('@media (min-width:641px)'), css.indexOf('@media (max-width:640px)'));
  it('sets white-space:normal on the Today cell and its pill in the grid layout', () => {
    expect(wide).toMatch(/\.stdNext tbody td:nth-child\(2\),\.stdNext tbody td:nth-child\(2\) strong\{white-space:normal\}/);
    expect(wide).toMatch(/\.stdNext tbody td:nth-child\(2\) strong\{max-width:100%\}/);
  });
});
