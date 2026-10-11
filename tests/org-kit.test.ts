/* The organization kit (/adopt/kit), the per-link count (/register/channel and
   GET /api/survey/channel), the embed button and the validated-Bundle record on
   /developers. Each promise those pages make is checked here against the code
   that keeps it. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  slugFor, baseFor, surveyLink, countLink, blurbFor, wordCount, flyerSentences, PRIVACY_QUOTE, RESERVED_SLUGS, embedAnchor,
} from '../components/OrgKitText';
import { FHIR_VALIDATION } from '../components/OrgKitAgency';
import { channelAggregate } from '../cf/functions/api/survey/channel.js';
import { WAYPOINT_BASE, EXAMPLE_STORY, toFhirBundle } from '../lib/fhir';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE, TABLE, TABLE_VERSION } from '../lib/table';
import { qrMatrix } from '../lib/qr';
import { SMALL_CELL_MIN } from '../lib/survey-def.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(`${root}${p}`, 'utf8');

describe('the kit makes the label the survey will actually count', () => {
  it('reads a typed name the way /survey reads ?c=', () => {
    expect(slugFor('MEAction')).toBe('meaction');
    expect(slugFor('ME/CFS Alliance of Ohio')).toBe('me-cfs-alliance-of-ohio');
    expect(slugFor('  Riverside Long COVID Group  ')).toBe('riverside-long-covid');
    expect(slugFor('Supercalifragilisticexpialidocious')).toBe('supercalifragilisticexpi');
    expect(slugFor('!!!')).toBeNull();
    const long = slugFor('Myalgic Encephalomyelitis Action Network of the Mid-Atlantic')!;
    expect(long.length).toBeLessThanOrEqual(24);
    expect(long).toMatch(/^[a-z0-9-]{1,24}$/);
    expect(long.endsWith('-')).toBe(false);
  });

  it('refuses the labels the site already counts its own answers under', () => {
    for (const r of ['direct', 'register']) expect(RESERVED_SLUGS).toContain(r);
    const register = read('components/Register.tsx');
    const m = register.match(/survey\?c=([a-z0-9-]+)/g) || [];
    for (const hit of m) expect(RESERVED_SLUGS).toContain(hit.replace('survey?c=', ''));
  });

  it('prints the canonical address on production and its own address anywhere else', () => {
    expect(baseFor('https://waypointledger.org')).toBe(WAYPOINT_BASE);
    expect(baseFor('https://waypoint-ledger.pages.dev')).toBe(WAYPOINT_BASE);
    expect(baseFor('http://127.0.0.1:3203')).toBe('http://127.0.0.1:3203');
    expect(baseFor(null)).toBe(WAYPOINT_BASE);
    expect(surveyLink(WAYPOINT_BASE, 'meaction')).toBe('https://waypointledger.org/survey?c=meaction');
    expect(countLink(WAYPOINT_BASE, 'meaction')).toBe('https://waypointledger.org/register/channel?c=meaction');
  });

  it('draws a QR code for the longest link it can make', () => {
    const longest = surveyLink(WAYPOINT_BASE, 'a'.repeat(24));
    const m = qrMatrix(longest, 'M');
    expect(m.length).toBeGreaterThanOrEqual(21);
  });
});

describe('the words the kit hands out', () => {
  const link = surveyLink(WAYPOINT_BASE, 'riverside');
  const blurb = blurbFor('Riverside Long COVID Group', link);

  it('the paragraph is about sixty words and carries the link', () => {
    expect(wordCount(blurb)).toBeGreaterThanOrEqual(50);
    expect(wordCount(blurb)).toBeLessThanOrEqual(70);
    expect(blurb.endsWith(link)).toBe(true);
    expect(blurbFor('', link).startsWith('We are sharing')).toBe(true);
  });

  it('names the five costs the survey asks about, and nothing it does not ask', () => {
    for (const w of ['out of pocket', 'time', 'paid work missed', 'unpaid care', 'care you went without']) expect(blurb).toContain(w);
  });

  it('uses no word the product rules forbid, and counts answers, never people or users', () => {
    const all = [blurb, ...flyerSentences('Riverside'), PRIVACY_QUOTE].join(' ');
    expect(all).not.toMatch(/prototype|demo|mockup|\bMVP\b|lorem|TODO|undefined|NaN/i);
    const ours = [blurb, ...flyerSentences('Riverside')].join(' '); // the privacy quote is the privacy page's own words
    expect(ours).not.toMatch(/\d+\s+(people|users)\b/i);
    expect(all).not.toMatch(/—/);
  });

  it('the flyer has three sentences, and quotes the privacy page word for word', () => {
    expect(flyerSentences('Riverside')).toHaveLength(3);
    const page = read('app/privacy/page.tsx')
      .replace(/<[^>]+>/g, '')
      .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&rsquo;/g, '’').replace(/&mdash;/g, '—')
      .replace(/\s+/g, ' ');
    expect(page).toContain(PRIVACY_QUOTE);
  });

  it('the embed line is plain HTML that opens a new tab', () => {
    const a = embedAnchor(WAYPOINT_BASE);
    expect(a).toMatch(/^<a href="https:\/\/waypointledger\.org\/" target="_blank" rel="noopener"/);
    expect(a).toContain('>Price your diagnostic journey</a>');
    expect(a).not.toMatch(/<script|on[a-z]+=/i);
  });
});

describe('/embed.js does nothing but draw one link', () => {
  const js = read('public/embed.js');
  it('sends nothing, stores nothing and reads nothing from the host page', () => {
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|document\.cookie|localStorage|sessionStorage|indexedDB|innerHTML|eval\(|new Function/);
  });
  it('opens Waypoint in a new tab without handing it the host window', () => {
    expect(js).toContain("a.target = '_blank'");
    expect(js).toContain("a.rel = 'noopener'");
    expect(js).toContain('Price your diagnostic journey');
    expect(js).toContain('attachShadow');
  });
});

/* ---------- GET /api/survey/channel ---------- */
const row = (i: number, ctx: Record<string, string> = { state: 'Texas', sex: 'Female' }) => ({
  ranking: ['oop', 'time', 'work', 'unpaid', 'forgone'],
  unasked: 'unpaid', lead: i % 2 ? 'oop' : 'time', decide: 'patients', clinicians: 4,
  context: ctx, channel: 'riverside',
  receivedAt: `2026-09-${String(10 + (i % 15)).padStart(2, '0')}T14:${String(i % 60).padStart(2, '0')}:07.123Z`,
});

describe('a link\'s own count keeps the small-cell rule on the server', () => {
  it('no answers: says so, with a zero', () => {
    const a = channelAggregate('riverside', []);
    expect(a).toMatchObject({ ok: true, n: 0, withheld: false });
  });

  it('one to ten answers: no count, no dates, no ranking', () => {
    for (const k of [1, SMALL_CELL_MIN - 1]) {
      const a = channelAggregate('riverside', Array.from({ length: k }, (_, i) => row(i)));
      expect(a.n).toBeNull();
      expect(a.withheld).toBe(true);
      for (const key of ['firstOn', 'lastOn', 'ranking', 'lead', 'unasked', 'firstAt', 'lastAt']) expect(a).not.toHaveProperty(key);
      const text = JSON.stringify(a);
      expect(text).not.toContain('2026-09');
      expect(text).not.toContain(`:${k},`);
    }
  });

  it('eleven or more: the count, the days, the ranking, and nothing anyone said about themselves', () => {
    const rows = Array.from({ length: SMALL_CELL_MIN + 1 }, (_, i) => row(i));
    const a = channelAggregate('riverside', rows) as Record<string, unknown>;
    expect(a.n).toBe(SMALL_CELL_MIN + 1);
    expect(a.firstOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.lastOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((a.ranking as unknown[]).length).toBe(5);
    const text = JSON.stringify(a);
    for (const leak of ['Texas', 'Female', 'coverage', 'context', 'T14:', 'sentence']) expect(text).not.toContain(leak);
  });

  it('is documented in the OpenAPI description the site publishes', () => {
    expect(read('lib/openapi.ts')).toContain("'/api/survey/channel'");
  });
});

describe('the validated-Bundle record on /developers describes the Bundle this commit serves', () => {
  it('same entry count and the same resource mix as the Bundle the HL7 validator was run on', () => {
    const entries = parseJourney(EXAMPLE_STORY, SELECTABLE)
      .filter((s) => s.result.item)
      .map((s, i) => ({ key: `s${i}`, raw: s.raw, item: s.result.item!, times: s.times }));
    const { bundle } = toFhirBundle(entries, TABLE, { tableVersion: TABLE_VERSION });
    const mix: Record<string, number> = {};
    for (const e of bundle.entry as { resource: { resourceType: string } }[]) mix[e.resource.resourceType] = (mix[e.resource.resourceType] || 0) + 1;
    const why = 'The example Bundle changed since the HL7 validator run recorded in components/OrgKitAgency.tsx. '
      + 'Rerun: curl .../api/fhir/example > example.json && java -jar validator_cli.jar example.json -version 4.0.1 -tx n/a, then update FHIR_VALIDATION.';
    expect(bundle.entry.length, why).toBe(FHIR_VALIDATION.entries);
    expect(mix, why).toEqual(FHIR_VALIDATION.resources);
    expect(FHIR_VALIDATION.errors).toBe(0);
  });
});
