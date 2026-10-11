/* JUDGE-4 #4: /developers and lib/fhir.ts said GET /api/fhir/example prices "the
   sentence shown in the landing page's empty box". Since JUDGE-3 #14 the home box
   shows three lines of the full example ledger, a different sentence. The FHIR
   example is the journey builder's sentence (/journey), and every description
   now says so. Read from source: the pages may not export. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXAMPLE_STORY } from '../lib/fhir';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const HOME = read('app/page.tsx');
const BUILDER = read('components/JourneyBuilder.tsx');
const DEV = read('components/Developers.tsx');
const OPENAPI = read('lib/openapi.ts');
const FHIR = read('lib/fhir.ts');
const exampleIn = (src: string) => /const EXAMPLE = '([^']+)'/.exec(src)![1];

describe('JUDGE-4 #4: the FHIR example names the box it really comes from', () => {
  it('EXAMPLE_STORY is the journey builder example, and not the home box', () => {
    expect(EXAMPLE_STORY).toBe(exampleIn(BUILDER));
    expect(EXAMPLE_STORY).not.toBe(exampleIn(HOME));
    expect(HOME).toContain('three lines of the full example');
  });
  it('no description says the landing page shows it', () => {
    for (const src of [DEV, OPENAPI, FHIR]) {
      expect(src).not.toMatch(/landing page'?s? (empty box|offers as an example|example)/i);
      expect(src).not.toMatch(/landing page&rsquo;s empty box/);
    }
    expect(DEV).toContain('journey builder&rsquo;s empty box on <a href="/journey">/journey</a>');
    expect(DEV).toContain('three lines of the full example ledger');
    expect(OPENAPI).toContain('The example sentence the journey builder (/journey) offers in its empty box');
  });
});
