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
    expect(cells[2].trim()).toBe("Sandbox import built and tested on CMS's synthetic claims; switched on once Precision Federal accepts the CMS terms.");
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
