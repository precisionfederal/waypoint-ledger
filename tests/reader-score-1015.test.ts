/* Judge panel 15 Oct B-6: the reader's score on /method, quoted as the files that
   record it say it: the rules-only row of data/test-fixtures/READER-EVAL.md and the
   30 Sep run in the header of cf/functions/api/map.js. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readerScore } from '../scripts/gen-reader-score.mjs';
import { READER_EVAL_URL, readerScoreLine, shortDate } from '../lib/reader-score';

const evalMd = readFileSync('data/test-fixtures/READER-EVAL.md', 'utf8');
const mapJs = readFileSync('cf/functions/api/map.js', 'utf8');
const json = JSON.parse(readFileSync('data/reader-score.json', 'utf8'));

describe('B-6: the reader score card', () => {
  it('data/reader-score.json is what the two source files say today', () => {
    const s = readerScore(evalMd, mapJs);
    expect(s).not.toBeNull();
    const { _from, ...rest } = json;
    expect(_from).toMatch(/READER-EVAL\.md and cf\/functions\/api\/map\.js/);
    expect(rest).toEqual(s);
  });

  it('every figure is in its source file in exactly that form', () => {
    expect(evalMd).toContain(`${json.sentences} sentences`);
    expect(evalMd).toContain(`| rules only (no model) | 97.3% | 81.7% | **${json.rulesF1}** |`);
    expect(mapJs).toMatch(new RegExp(`${json.model}\\s+F1 ${json.readerF1.replace('%', '').replace('.', '\\.')}\\s`));
    expect(mapJs).toContain(`${json.wrongUnitsAdded} wrong units added`);
    expect(mapJs).toContain(`OPENAI_MODELS = ['${json.model}'`);
  });

  it('the card says it in one line, and links the file on GitHub', () => {
    expect(shortDate('2026-09-30')).toBe('30 Sep 2026');
    expect(readerScoreLine(json)).toBe(`AI reader, ${json.sentences} test sentences, scored 30 Sep 2026: F1 ${json.rulesF1} with rules alone, ${json.readerF1} with the reader; ${json.wrongUnitsAdded} wrong units added`);
    expect(READER_EVAL_URL).toBe('https://github.com/precisionfederal/waypoint-ledger/blob/main/data/test-fixtures/READER-EVAL.md');
    const page = readFileSync('app/method/page.tsx', 'utf8');
    expect(page).toContain("import READER_SCORE from '@/data/reader-score.json';");
    expect(page).toContain('data-testid="reader-score"');
    expect(readFileSync('cf/build-static.sh', 'utf8')).toContain('node scripts/gen-reader-score.mjs');
  });

  it('a source that changes shape gives no card, never an old number', () => {
    expect(readerScore(evalMd.replace('rules only (no model)', 'rules'), mapJs)).toBeNull();
    expect(readerScore(evalMd, mapJs.replace("OPENAI_MODELS = ['gpt-5.6-luna'", "OPENAI_MODELS = ['gpt-9'"))).toBeNull();
  });
});
