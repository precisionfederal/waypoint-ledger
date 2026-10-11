/* The public CSV exports. Two things must hold forever: the column order is stable,
   because people build on it; and no free text ever leaves the building. */
import { describe, it, expect } from 'vitest';
import { csvOf, exportRows } from '../cf/functions/api/export/[kind].js';
import { DEFECT_COLUMNS, DEFECT_HEADER, correctionsDefectJson } from '../cf/functions/api/export/_defect-report.js';
import { validateSurvey } from '../cf/functions/api/survey.js';
import { CONTEXT_KEYS } from '../lib/survey-def.js';

/* The corrections file leads with one comment line naming the table version and
   the audit; every other export starts at its header. */
const lines = (csv: string) => csv.trim().split('\n');
const headerLine = (csv: string) => lines(csv).find((l) => !l.startsWith('#')) as string;
const header = (csv: string) => headerLine(csv).split(',');
const rowsOf = (csv: string) => lines(csv).slice(lines(csv).indexOf(headerLine(csv)) + 1);

const CORRECTION = {
  receivedAt: '2026-09-09T00:00:00.000Z', priceId: 'cms-99214', verdict: 'wrong', believedValueUsd: 240,
  note: 'they billed me far more', priceTableVersion: '2026-09-08.1-verified', rowHash: 'abc123',
};
const cells = (csv: string) => {
  const out: Record<string, string> = {};
  const row = rowsOf(csv)[0];
  /* split on commas outside quotes — the export quotes any cell that carries one */
  const parts = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
  DEFECT_HEADER.forEach((h: string, i: number) => { out[h] = parts[i]; });
  return out;
};

describe('csvOf — quoting', () => {
  it('quotes a value containing a comma, a quote or a newline, and doubles inner quotes', () => {
    const csv = csvOf(['a', 'b', 'c'], [['plain', 'has, comma', 'has "quote"'], ['line\nbreak', '', 'x']]);
    expect(csv.split('\n')[1]).toBe('plain,"has, comma","has ""quote"""');
    expect(csv).toContain('"line\nbreak"');
  });
  it('writes an empty cell for null and undefined rather than the word', () => {
    expect(csvOf(['a', 'b'], [[null, undefined]]).split('\n')[1]).toBe(',');
  });
  it('ends with a newline so the file concatenates cleanly', () => {
    expect(csvOf(['a'], [['b']]).endsWith('\n')).toBe(true);
  });
});

describe('exportRows — the published column order', () => {
  it('corrections — a defect report a federal analyst can route without our site', () => {
    const csv = exportRows('corrections', [CORRECTION], { site: 'https://waypoint-ledger.pages.dev' }) as string;
    expect(header(csv)).toEqual(DEFECT_HEADER);
    const c = cells(csv);

    /* the routing key: the row, the code, the figure */
    expect(c.price_id).toBe('cms-99214');
    expect(c.code_system).toBe('CPT');
    expect(c.code).toBe('99214');
    expect(Number(c.published_value_usd)).toBe(135.61);
    expect(c.year).toBe('2026');
    expect(c.agency).toContain('CMS');
    expect(c.geography).toContain('national');
    expect(c.population).toContain('Medicare');

    /* the federal file, by name, with the bytes the audit read and the line the figure came from */
    expect(c.source_file).toBe('PPRRVU2026_Jul_nonQPP.csv');
    expect(c.source_file_url).toMatch(/^https:\/\/www\.cms\.gov\//);
    expect(c.source_file_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(c.source_file_retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.source_kind).toBe('federal data file');
    expect(c.source_line).toContain('RVU');
    expect(c.audit_status).toBe('PASS');

    /* the correction itself, its direction, its count and its fit verdict */
    expect(c.verdict).toBe('wrong');
    expect(c.believed_usd).toBe('240');
    expect(c.figure_flagged_wrong).toBe('1');
    expect(c.figure_confirmed_right).toBe('0');
    expect(c.figure_responses).toBe('1');
    expect(c.figure_fit_rate_pct).toBe('0');
    expect(c.row_hash).toBe('abc123');
    expect(c.citation_url).toBe('https://waypoint-ledger.pages.dev/api/citation/cms-99214');
    expect(c.counted_as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    /* the comment line names the table and the audit, and no free text leaves */
    expect(lines(csv)[0].startsWith('#')).toBe(true);
    expect(lines(csv)[0]).toContain('rows · ');
    expect(csv).not.toContain('they billed me far more');
  });

  it('corrections — every published column is described, once', () => {
    expect(DEFECT_COLUMNS.length).toBe(DEFECT_HEADER.length);
    expect(new Set(DEFECT_HEADER).size).toBe(DEFECT_HEADER.length);
    for (const [name, type, note] of DEFECT_COLUMNS) {
      expect(name).toMatch(/^[a-z0-9_]+$/);
      expect(type.length).toBeGreaterThan(0);
      expect(note.length).toBeGreaterThan(10);
    }
  });

  it('corrections — a row whose figure left the table is kept and labelled, never dropped', () => {
    const csv = exportRows('corrections', [{ ...CORRECTION, priceId: 'retired-row-9999' }]) as string;
    const c = cells(csv);
    expect(c.price_id).toBe('retired-row-9999');
    expect(c.label).toContain('not in the published table');
    expect(c.audit_status).toBe('not audited');
  });

  it('corrections JSON — the DCAT distribution carries its own column contract and the CY2024 companion', () => {
    const doc = correctionsDefectJson([CORRECTION, { ...CORRECTION, priceId: 'cms-99213', verdict: 'right', believedValueUsd: null }], { site: 'https://waypoint-ledger.pages.dev' });
    expect(doc['@type']).toBe('dcat:Distribution');
    expect(doc.columns.map((c: { name: string }) => c.name)).toEqual(DEFECT_HEADER);
    expect(doc.n).toBe(2);
    expect(doc.tableVersion).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(doc.auditLine).toContain('reproduce');
    expect(doc.mediaType).toBe('application/json');
    const row = doc.rows.find((r: { price_id: string }) => r.price_id === 'cms-99213');
    expect(row.source_document).toContain('Relative Value File');
    expect(row.cy2024_companion.file).toBe('MUP_PHY_R26_P05_V10_D24_Geo.csv');
    expect(row.cy2024_companion.row).toContain('HCPCS_Cd=99213');
    expect(row.cy2024_companion.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(doc)).not.toContain('they billed me far more');
  });

  it('gap', () => {
    const csv = exportRows('gap', [{ receivedAt: '2026-09-09T14:03:27.512Z', counts: { dismissed: 3, 'care-denied': 1 }, ranking: ['dismissed', 'care-denied'], note: 'private text', context: { ageBand: '45–64', region: 'South' }, tableVersion: 'v', prevHash: '0'.repeat(64), rowHash: 'a'.repeat(64) }]) as string;
    /* 2026-10-01: the day, never the time, and prev_hash beside row_hash so the links can be checked row by row. */
    expect(header(csv)).toEqual(['received_on', 'care-not-sought', 'care-denied', 'dismissed', 'wrong-track', 'time-searching', 'life-lost', 'care-made-worse', 'rank_1', 'rank_2', 'rank_3', 'rank_4', 'rank_5', 'rank_6', 'rank_7', 'table_version', 'team_test', 'prev_hash', 'row_hash']);
    expect(rowsOf(csv)[0]).toBe(`2026-09-09,,1,3,,,,,dismissed,care-denied,,,,,,v,false,${'0'.repeat(64)},${'a'.repeat(64)}`);
    expect(csv).not.toContain('private text');
    expect(csv).not.toContain('14:03');
    expect(csv).not.toMatch(/South|45–64/);
  });

  it('survey', () => {
    const rec = validateSurvey({ ranking: ['time', 'oop', 'work', 'unpaid', 'forgone'], unasked: 'unpaid', lead: 'time', decide: 'patients', clinicians: 7, context: { age: '30–44', stage: 'Diagnosed', sex: 'Female', state: 'Georgia', insurance: 'Medicaid', region: 'South' }, channel: 'demo', sentence: 'a sentence held back' }).record;
    const csv = exportRows('survey', [{ ...rec, prevHash: '0'.repeat(64), rowHash: 'b'.repeat(64) }]) as string;
    /* 2026-10-01: one row per answer carrying every self-description could point at a
       person (R3-advocate A1, R3-parent PAR-04). No ctx_ column is exported; the
       self-description is published only as counts at /api/survey, suppressed under 11. */
    expect(header(csv)).toEqual(['received_on', 'channel', 'rank_1', 'rank_2', 'rank_3', 'rank_4', 'rank_5', 'unasked', 'lead', 'decide', 'clinicians', 'survey_version', 'team_test', 'prev_hash', 'row_hash']);
    const cols = header(csv);
    const cells = rowsOf(csv)[0].split(',');
    expect(cells[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cells.slice(1, 11)).toEqual(['demo', 'time', 'oop', 'work', 'unpaid', 'forgone', 'unpaid', 'time', 'patients', '7']);
    expect(cells[cols.indexOf('prev_hash')]).toBe('0'.repeat(64));
    expect(cells[cols.indexOf('row_hash')]).toBe('b'.repeat(64));
    for (const k of CONTEXT_KEYS) expect(cols).not.toContain('ctx_' + k);
    for (const v of ['30–44', 'Diagnosed', 'Female', 'Georgia', 'Medicaid', 'South']) expect(csv).not.toContain(v);
    expect(csv).not.toContain('a sentence held back');
    expect(csv).not.toMatch(/T\d{2}:\d{2}/);
  });

  it('refuses a kind that is not published', () => {
    expect(exportRows('interviews', [])).toBeNull();
    expect(exportRows('users', [])).toBeNull();
  });

  it('exports a header even when nobody has sent anything yet', () => {
    for (const kind of ['corrections', 'gap', 'survey']) {
      const csv = exportRows(kind, []) as string;
      expect(rowsOf(csv)).toHaveLength(0);
      expect(header(csv).length).toBeGreaterThan(1);
    }
  });

  it('never exports a free-text column in any kind', () => {
    for (const kind of ['corrections', 'gap', 'survey']) {
      const cols = header(exportRows(kind, []) as string);
      for (const banned of ['note', 'sentence', 'answers', 'name', 'email', 'ip']) expect(cols).not.toContain(banned);
    }
  });
});
