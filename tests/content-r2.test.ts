/* Round 2, CONTENT order (ASKS.md section 2, ranks 1, 2, 3, 4, 6, 8).
   These hold the rules the new copy was written under, so a later edit cannot
   quietly break them. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { HELP_ITEMS } from '../components/HelpThatExists';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('/survey thank-you (rank 1)', () => {
  const form = read('components/SurveyForm.tsx');
  it('offers the written interview on the same channel', () => {
    expect(form).toContain('Ten more minutes? The written interview helps us most.');
    expect(form).toContain('href={`/interview?c=${encodeURIComponent(channel)}${forChild ? \'&r=carer\' : \'\'}`}');
  });
  it('counts answers, never people', () => {
    expect(form).not.toMatch(/\bpeople\b/i);
  });
});

describe('/method (ranks 2, 4, 8)', () => {
  const page = read('app/method/page.tsx');
  it('quotes the Lyme report recommendation word for word', () => {
    const flat = page.replace(/\s+/g, ' ');
    expect(flat).toContain('Develop and maintain a cost-of-care resource that estimates the total cost of types of Lyme care, '
      + 'to be used in informed discussions on the viability of a treatment option on a patient-by-patient situational basis.');
  });
  it('says every line is priced by the care, never the diagnosis code', () => {
    expect(page).toContain('Every line is priced by the care itself, never by a diagnosis code.');
  });
  it('has a public "Not built yet" list in the contents', () => {
    expect(page).toContain("{ id: 'not-built', text: 'Not built yet' }");
  });
});

describe('/adopt Standards (rank 3)', () => {
  const adopt = read('components/Adopt.tsx');
  const table = adopt.slice(adopt.indexOf('<Fold id="standards"'), adopt.indexOf('<Fold id="tell-us"'));
  it('names all five standards the rules name', () => {
    for (const s of ['HL7 FHIR R4', 'USCDI', 'Blue Button 2.0', 'CMS Interoperability Framework', 'TEFCA', 'USCDI+']) expect(table).toContain(s);
  });
  it('calls only FHIR live, and claims no integration it does not have', () => {
    expect((table.match(/<strong>Live<\/strong>/g) ?? []).length).toBe(1);
    expect(table).toContain('<strong>Not connected</strong>');
    expect(table).toContain('<strong>Not pledged</strong>');
    expect(table).not.toMatch(/FHIR integration|integrated with|connected to TEFCA/i);
  });
});

describe('/sheet: help that already exists (rank 6)', () => {
  it('carries no dollar figure', () => {
    for (const h of HELP_ITEMS) expect(`${h.title} ${h.body}`, h.id).not.toMatch(/\$|dollar/i);
  });
  it('points only at federal pages', () => {
    for (const h of HELP_ITEMS) expect(new URL(h.url).hostname, h.id).toMatch(/(^|\.)(cms|hrsa|healthcare|irs|ssa)\.gov$/);
  });
  it('leads with the good faith estimate and is on the sheet', () => {
    expect(HELP_ITEMS[0].id).toBe('good-faith-estimate');
    expect(HELP_ITEMS[0].body).toContain('written estimate');
    expect(read('app/sheet/page.tsx')).toContain('<HelpThatExists />');
  });
});
