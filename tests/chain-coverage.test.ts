/* ==========================================================================
   EVERY PUBLISHED COLUMN IS INSIDE THE CHAIN.

   Round 2 found survey.csv publishing `ctx_state` while the chain covered only
   age, insurance, region and stage: the field a policy shop reads first was the
   one field nobody could prove had not been edited. The first test here fails
   on exactly that defect, against the REAL export headers and the REAL
   projections — not against a copy of either.

   Widening a projection cannot be a silent edit, so the second half holds the
   rule that makes the widening safe: a row is walked under the field set of its
   own instrument version, so rows written before the change verify exactly as
   they were written.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import {
  chainCoverage, CSV_TABLE as CSV_TABLE_, UNCHAINED_CSV as UNCHAINED_CSV_, RECIPES as RECIPES_,
  PUBLISHED as PUBLISHED_, GENESIS, rowHash, verifyChain,
  SURVEY_PROJECTIONS, SURVEY_CTX_KEYS, surveyCtxKeysFor, versionAtLeast,
} from '../cf/functions/api/_hash.js';

/* The module is JavaScript; these are the shapes this suite indexes by name. */
const CSV_TABLE = CSV_TABLE_ as Record<string, string>;
const UNCHAINED_CSV = UNCHAINED_CSV_ as Record<string, Record<string, string>>;
const RECIPES = RECIPES_ as Record<string, { file: string; projection: string[]; steps: string[] }>;
const PUBLISHED = PUBLISHED_ as Record<string, (r: Record<string, unknown>) => Record<string, unknown>>;
import { exportRows } from '../cf/functions/api/export/[kind].js';
import { CATEGORY_IDS } from '../cf/functions/api/gap.js';

/** The header the export really writes today, taken from the export itself. */
const headerOf = (kind: string) => String(exportRows(kind, [])).trim().split(',');
const opts = { countKeys: CATEGORY_IDS };

describe('the published CSV and the chain cover the same columns', () => {
  for (const kind of Object.keys(CSV_TABLE)) {
    it(`${kind}.csv publishes nothing the chain does not cover`, () => {
      const cov = chainCoverage(kind, headerOf(kind), opts);
      expect(cov.uncovered).toEqual([]);
      expect(cov.covered.length).toBeGreaterThan(3);
    });
  }

  it('the survey context columns each name the field they are hashed as', () => {
    const cov = chainCoverage('survey', headerOf('survey'), opts);
    const byColumn = Object.fromEntries(cov.covered.map((c) => [c.column, c.field]));
    expect(byColumn.ctx_state).toBe('context.state');
    expect(byColumn.ctx_age).toBe('context.age');
    expect(byColumn.rank_3).toBe('ranking');
  });

  it('WOULD HAVE CAUGHT THE DEFECT: under the old field set, ctx_state is uncovered', () => {
    const old = SURVEY_PROJECTIONS[SURVEY_PROJECTIONS.length - 1].keys;
    expect(old).not.toContain('state');
    const cov = chainCoverage('survey', headerOf('survey'), { ...opts, ctxKeys: old });
    expect(cov.uncovered).toEqual(['ctx_state']);
  });

  it('a column nobody described is a failure, not a shrug', () => {
    const cov = chainCoverage('corrections', [...headerOf('corrections'), 'ctx_zipcode', 'invented'], opts);
    expect(cov.uncovered).toEqual(['ctx_zipcode', 'invented']);
  });

  it('the only way out is an entry that states the reason', () => {
    for (const kind of Object.keys(CSV_TABLE)) {
      const cov = chainCoverage(kind, headerOf(kind), opts);
      expect(cov.unchained.map((u) => u.column)).toEqual(['row_hash']);
      for (const u of cov.unchained) expect(u.reason.length).toBeGreaterThan(20);
      expect(Object.keys(UNCHAINED_CSV[kind])).toEqual(['row_hash']);
    }
  });

  it('every published file has its own recompute recipe, naming its own projection', () => {
    expect(Object.keys(RECIPES).sort()).toEqual(Object.keys(CSV_TABLE).sort());
    for (const [kind, r] of Object.entries(RECIPES)) {
      const fields = Object.keys(PUBLISHED[CSV_TABLE[kind]]({}));
      expect(r.projection.slice().sort()).toEqual(fields.slice().sort());
      expect(r.file).toBe(`/api/export/${kind}.csv`);
      expect(r.steps.length).toBeGreaterThanOrEqual(3);
    }
  });
});

const survey = (over: Record<string, unknown> = {}) => ({
  receivedAt: '2026-09-09T12:00:00.000Z',
  channel: 'direct',
  ranking: ['time', 'oop', 'work', 'unpaid', 'forgone'],
  unasked: 'unpaid', lead: 'time', decide: 'patients', clinicians: 4,
  context: { age: '30–44', insurance: 'Medicaid', region: 'Midwest', state: 'Iowa', stage: 'Diagnosed' },
  surveyVersion: '2026-09-09.2',
  ...over,
});

describe('a row is walked under the field set of its own version', () => {
  it('compares versions of the form YYYY-MM-DD.N by number, never by string', () => {
    expect(versionAtLeast('2026-09-09.10', '2026-09-09.2')).toBe(true);   // string order would say false
    expect(versionAtLeast('2026-09-09.2', '2026-09-09.2')).toBe(true);
    expect(versionAtLeast('2026-09-08.9', '2026-09-09.2')).toBe(false);
    expect(versionAtLeast('2027-01-01.1', '2026-09-09.2')).toBe(true);
  });

  it('an unreadable or missing version is treated as older, never as newer', () => {
    expect(surveyCtxKeysFor('v')).not.toContain('state');
    expect(surveyCtxKeysFor(null)).not.toContain('state');
    expect(surveyCtxKeysFor(undefined)).not.toContain('state');
    expect(surveyCtxKeysFor('2026-09-09.2')).toEqual(SURVEY_CTX_KEYS);
  });

  it('state changes the hash under the new version and cannot under the old one', async () => {
    const iowa = survey();
    const ohio = survey({ context: { ...survey().context, state: 'Ohio' } });
    expect(await rowHash(GENESIS, PUBLISHED.survey_responses(iowa)))
      .not.toBe(await rowHash(GENESIS, PUBLISHED.survey_responses(ohio)));

    const iowaV1 = survey({ surveyVersion: '2026-09-09.1' });
    const ohioV1 = survey({ surveyVersion: '2026-09-09.1', context: { ...survey().context, state: 'Ohio' } });
    expect(await rowHash(GENESIS, PUBLISHED.survey_responses(iowaV1)))
      .toBe(await rowHash(GENESIS, PUBLISHED.survey_responses(ohioV1)));
  });

  it('rows written before the widening still verify, in a chain with rows written after', async () => {
    const records = [survey({ surveyVersion: '2026-09-09.1' }), survey(), survey({ context: { ...survey().context, state: 'Guam' } })];
    const rows: Record<string, unknown>[] = [];
    let prev = GENESIS;
    for (const r of records) {
      const h = await rowHash(prev, PUBLISHED.survey_responses(r));
      rows.push({ ...r, prevHash: prev, rowHash: h });
      prev = h;
    }
    const walk = await verifyChain('survey_responses', rows);
    expect(walk.ok).toBe(true);
    expect(walk.head).toBe(prev);
  });

  it('an edited state on a new row breaks the walk, which is the point', async () => {
    const records = [survey(), survey({ context: { ...survey().context, state: 'Ohio' } })];
    const rows: Record<string, unknown>[] = [];
    let prev = GENESIS;
    for (const r of records) {
      const h = await rowHash(prev, PUBLISHED.survey_responses(r));
      rows.push({ ...r, prevHash: prev, rowHash: h });
      prev = h;
    }
    (rows[1] as { context: Record<string, string> }).context.state = 'Texas';
    const walk = await verifyChain('survey_responses', rows);
    expect(walk.ok).toBe(false);
    expect(walk.brokeAt).toBe(1);
  });
});
