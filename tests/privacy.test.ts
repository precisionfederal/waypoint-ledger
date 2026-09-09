/* The /privacy field table is generated, not written. These tests hold the two
   things that make it worth trusting: it matches the database exactly, and the
   guard that keeps it matching actually fires when a column slips past it.

   The failure this replaces was real: on 2026-09-09 the page said a correction
   records "no journey ... and no cookie" while the handler had been writing
   journey_id and, for a signed-in person, user_id, since migration 0003. */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, copyFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { model, generate, readSchema, GENERATED_ON_LINE } from '../scripts/gen-privacy.mjs';
import { PRIVACY_ENDPOINTS, PRIVACY_COLUMN_COUNT, PRIVACY_TABLE_COUNT } from '../app/privacy/generated';

const ROOT = join(__dirname, '..');
const MIGRATIONS = join(ROOT, 'cf/migrations');
const schema = readSchema(MIGRATIONS) as { files: string[]; tables: Map<string, { column: string; notNull: boolean }[]> };
const shipped = PRIVACY_ENDPOINTS.flatMap((e) => e.fields.map((f) => `${e.table}.${f.column}`));

/** A migrations folder with one extra thing in it, so a guard can be caught failing. */
function plant(extraSql: string) {
  const dir = mkdtempSync(join(tmpdir(), 'wl-privacy-plant-'));
  for (const f of readdirSync(MIGRATIONS)) copyFileSync(join(MIGRATIONS, f), join(dir, f));
  writeFileSync(join(dir, '9999_planted.sql'), extraSql);
  return dir;
}

describe('the privacy page matches the database', () => {
  it('names every column in every migration exactly once', () => {
    const inSchema: string[] = [];
    for (const [table, cols] of schema.tables) for (const c of cols) inSchema.push(`${table}.${c.column}`);
    for (const key of inSchema) {
      expect(shipped.filter((k) => k === key), `${key} should appear once on /privacy`).toHaveLength(1);
    }
    expect(shipped.sort()).toEqual(inSchema.sort());
    expect(PRIVACY_COLUMN_COUNT).toBe(inSchema.length);
    expect(PRIVACY_TABLE_COUNT).toBe(schema.tables.size);
  });

  it('gives every column a plain-English line, and a kept/encrypted value from the schema', () => {
    for (const e of PRIVACY_ENDPOINTS) {
      for (const f of e.fields) {
        expect(f.gloss.length, `${e.table}.${f.column} has no description`).toBeGreaterThan(15);
        expect(['always', 'only when it applies']).toContain(f.kept);
        expect(['no', 'encrypted at rest', 'one-way hash']).toContain(f.encrypted);
      }
    }
  });

  it('is regenerated, not stale — the committed file is what the generator writes today', async () => {
    const fresh = (await generate()) as string;
    const onDisk = readFileSync(join(ROOT, 'app/privacy/generated.ts'), 'utf8');
    expect(onDisk.replace(GENERATED_ON_LINE, '')).toBe(fresh.replace(GENERATED_ON_LINE, ''));
  });

  it('marks the columns the old prose denied: a correction can carry an account and a journey id', () => {
    const corrections = PRIVACY_ENDPOINTS.find((e) => e.id === 'corrections')!;
    const cols = corrections.fields.map((f) => f.column);
    expect(cols).toContain('user_id');
    expect(cols).toContain('journey_id');
    for (const c of ['user_id', 'journey_id', 'note', 'submitter_hash']) {
      const f = corrections.fields.find((x) => x.column === c)!;
      expect(f.published, `${c} must not read as public`).toBe(false);
      expect(f.exported, `${c} must not read as exported`).toBe(false);
    }
  });

  it('never shows a private field as published or exported', () => {
    const privateColumns = ['sentence_enc', 'name_enc', 'answers_enc', 'email_enc', 'note', 'entries_json', 'password_hash', 'recovery_hash'];
    for (const e of PRIVACY_ENDPOINTS) {
      for (const f of e.fields) {
        if (!privateColumns.includes(f.column)) continue;
        expect(f.published, `${e.table}.${f.column}`).toBe(false);
        expect(f.exported, `${e.table}.${f.column}`).toBe(false);
      }
    }
    for (const c of ['sentence_enc', 'name_enc', 'answers_enc', 'email_enc']) {
      const f = PRIVACY_ENDPOINTS.flatMap((e) => e.fields).find((x) => x.column === c)!;
      expect(f.encrypted).toBe('encrypted at rest');
    }
  });

  it('exports nothing at all from the interviews table', () => {
    const interviews = PRIVACY_ENDPOINTS.find((e) => e.id === 'interview')!;
    expect(interviews.fields.filter((f) => f.exported)).toHaveLength(0);
  });

  it('says where every field the validators keep actually lands', () => {
    const corrections = PRIVACY_ENDPOINTS.find((e) => e.id === 'corrections')!;
    expect(corrections.accepts.find((a) => a.field === 'submitterId')?.column).toBe('submitter_hash');
    const survey = PRIVACY_ENDPOINTS.find((e) => e.id === 'survey')!;
    expect(survey.accepts.find((a) => a.field === 'sentence')?.column).toBe('sentence_enc');
    for (const e of PRIVACY_ENDPOINTS) {
      const cols = e.fields.map((f) => f.column);
      for (const a of e.accepts) expect(cols, `${e.id}: ${a.field}`).toContain(a.column);
    }
  });
});

describe('the guard fires (a violation is planted and caught)', () => {
  it('refuses a column nobody described', async () => {
    const dir = plant('ALTER TABLE corrections ADD COLUMN mystery_field TEXT;\n');
    try {
      await expect(model({ migrationsDir: dir })).rejects.toThrow(/corrections\.mystery_field/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses a column named as encrypted that its handler does not encrypt', async () => {
    const dir = plant('ALTER TABLE gap_reports ADD COLUMN secret_enc TEXT;\n');
    const glossary = JSON.parse(readFileSync(join(ROOT, 'data/column-glossary.json'), 'utf8'));
    glossary.columns['gap_reports.secret_enc'] = 'A planted column that claims encryption nobody performs.';
    const gpath = join(dir, 'glossary.json');
    writeFileSync(gpath, JSON.stringify(glossary));
    try {
      await expect(model({ migrationsDir: dir, glossaryPath: gpath })).rejects.toThrow(/secret_enc is named as encrypted/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('reads the encrypted column off the handler, not off the column name', () => {
    const interviews = PRIVACY_ENDPOINTS.find((e) => e.id === 'interview')!;
    const source = readFileSync(join(ROOT, interviews.handler), 'utf8');
    for (const f of interviews.fields) {
      const encryptedInCode = new RegExp(`\\b${f.column}\\s*:\\s*(await\\s+)?encrypt\\s*\\(`).test(source);
      expect(f.encrypted === 'encrypted at rest', `${f.column}`).toBe(encryptedInCode);
    }
  });

  it('refuses a table that has no place on the page', async () => {
    const dir = plant('CREATE TABLE IF NOT EXISTS shadow_log (id TEXT PRIMARY KEY, what TEXT);\n');
    try {
      await expect(model({ migrationsDir: dir })).rejects.toThrow(/shadow_log/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the prose no longer promises what the schema does not keep', () => {
  const page = readFileSync(join(ROOT, 'app/privacy/page.tsx'), 'utf8');
  it('drops the sentence the adversary disproved', () => {
    expect(page).not.toContain('no cookie are recorded');
    expect(page).not.toContain('local storage and nowhere else');
    expect(page).not.toContain('two typefaces from Google Fonts');
  });
  it('says what is true instead', () => {
    expect(page).toContain('which account sent it');
    expect(page).toContain('unless you press Save');
  });
});
