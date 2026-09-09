/* The public CSV exports. Two things must hold forever: the column order is stable,
   because people build on it; and no free text ever leaves the building. */
import { describe, it, expect } from 'vitest';
import { csvOf, exportRows } from '../cf/functions/api/export/[kind].js';
import { validateSurvey } from '../cf/functions/api/survey.js';

const header = (csv: string) => csv.split('\n')[0].split(',');
const rowsOf = (csv: string) => csv.trim().split('\n').slice(1);

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
  it('corrections', () => {
    const csv = exportRows('corrections', [{ receivedAt: '2026-09-09T00:00:00.000Z', priceId: 'cms-99214', verdict: 'wrong', believedValueUsd: 240, note: 'they billed me far more', priceTableVersion: '2026-09-08.1-verified' }]) as string;
    expect(header(csv)).toEqual(['received_at', 'price_id', 'verdict', 'believed_usd', 'table_version', 'row_hash']);
    expect(rowsOf(csv)[0]).toBe('2026-09-09T00:00:00.000Z,cms-99214,wrong,240,2026-09-08.1-verified,');
    expect(csv).not.toContain('they billed me far more');
  });

  it('gap', () => {
    const csv = exportRows('gap', [{ receivedAt: '2026-09-09T00:00:00.000Z', counts: { dismissed: 3, 'care-denied': 1 }, ranking: ['dismissed', 'care-denied'], note: 'private text', tableVersion: 'v' }]) as string;
    expect(header(csv)).toEqual(['received_at', 'care-not-sought', 'care-denied', 'dismissed', 'wrong-track', 'time-searching', 'life-lost', 'rank_1', 'rank_2', 'rank_3', 'rank_4', 'rank_5', 'rank_6', 'table_version', 'row_hash']);
    expect(rowsOf(csv)[0]).toBe('2026-09-09T00:00:00.000Z,,1,3,,,,dismissed,care-denied,,,,,v,');
    expect(csv).not.toContain('private text');
  });

  it('survey', () => {
    const rec = validateSurvey({ ranking: ['time', 'oop', 'work', 'unpaid', 'forgone'], unasked: 'unpaid', lead: 'time', decide: 'patients', clinicians: 7, context: { age: '30–44', stage: 'Diagnosed' }, channel: 'demo', sentence: 'a sentence held back', surveyVersion: '2026-09-09.1' }).record;
    const csv = exportRows('survey', [rec]) as string;
    expect(header(csv)).toEqual(['received_at', 'channel', 'rank_1', 'rank_2', 'rank_3', 'rank_4', 'rank_5', 'unasked', 'lead', 'decide', 'clinicians', 'ctx_age', 'ctx_insurance', 'ctx_region', 'ctx_state', 'ctx_stage', 'survey_version', 'row_hash']);
    const cells = rowsOf(csv)[0].split(',');
    expect(cells.slice(1, 11)).toEqual(['demo', 'time', 'oop', 'work', 'unpaid', 'forgone', 'unpaid', 'time', 'patients', '7']);
    expect(cells[11]).toBe('30–44');
    expect(cells[12]).toBe('');
    expect(cells[14]).toBe('');            // ctx_state, not stated in this row
    expect(cells[15]).toBe('Diagnosed');
    expect(csv).not.toContain('a sentence held back');
  });

  it('refuses a kind that is not published', () => {
    expect(exportRows('interviews', [])).toBeNull();
    expect(exportRows('users', [])).toBeNull();
  });

  it('exports a header even when nobody has sent anything yet', () => {
    for (const kind of ['corrections', 'gap', 'survey']) {
      const csv = exportRows(kind, []) as string;
      expect(csv.trim().split('\n')).toHaveLength(1);
    }
  });

  it('never exports a free-text column in any kind', () => {
    for (const kind of ['corrections', 'gap', 'survey']) {
      const cols = header(exportRows(kind, []) as string);
      for (const banned of ['note', 'sentence', 'answers', 'name', 'email', 'ip']) expect(cols).not.toContain(banned);
    }
  });
});
