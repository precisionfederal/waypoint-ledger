/* JUDGE-7 #5 (2026-10-01): "My dad is 78." printed under "What my diagnostic
   search has cost". An adult child's sheet now names the parent; a child's and a
   person's own sheet read exactly as before. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RELATION_WORD, relationWord, sheetWho } from '../components/sheet/sheet-who';

const SELF = { title: 'What my diagnostic search has cost', who: 'you', whose: 'your', forChild: false };
const CHILD = { title: 'What my child’s diagnostic search has cost', who: 'the child', whose: 'the child’s', forChild: true };

describe('whose search the sheet is about', () => {
  it('a child: unchanged, with or without a relation word', () => {
    expect(sheetWho('caregiver-child')).toEqual(CHILD);
    expect(sheetWho('caregiver-child', 'daughter')).toEqual(CHILD);
  });
  it('a person\'s own search: unchanged', () => {
    expect(sheetWho('adult-onset')).toEqual(SELF);
    expect(sheetWho('pediatric-onset', 'father')).toEqual(SELF);
    expect(sheetWho(null)).toEqual(SELF);
    expect(sheetWho(undefined, undefined)).toEqual(SELF);
  });
  it('an adult cared for, with no relation word or one the sheet does not know: today\'s words exactly', () => {
    expect(sheetWho('caregiver-adult')).toEqual(SELF);
    expect(sheetWho('caregiver-adult', '')).toEqual(SELF);
    expect(sheetWho('caregiver-adult', 'neighbour')).toEqual(SELF);
  });
  it('the judge\'s story: dad prints as father', () => {
    expect(sheetWho('caregiver-adult', 'dad')).toEqual({ title: 'What my father’s diagnostic search has cost', who: 'your father', whose: 'your father’s', forChild: false });
  });
  it('each relation word, including the short forms', () => {
    const want: [string, string][] = [
      ['father', 'father'], ['dad', 'father'], ['Dad', 'father'], ['my dad', 'father'],
      ['mother', 'mother'], ['mom', 'mother'], ['mum', 'mother'], ['MOM', 'mother'],
      ['husband', 'husband'], ['wife', 'wife'], ['partner', 'partner'],
      ['grandmother', 'grandmother'], ['grandma', 'grandmother'],
      ['grandfather', 'grandfather'], ['grandpa', 'grandfather'],
    ];
    for (const [raw, word] of want) {
      expect([raw, relationWord(raw)]).toEqual([raw, word]);
      const w = sheetWho('caregiver-adult', raw);
      expect(w.title).toBe(`What my ${word}’s diagnostic search has cost`);
      expect(w.who).toBe(`your ${word}`);
      expect(w.forChild).toBe(false);
    }
    for (const v of Object.values(RELATION_WORD)) expect(v).toMatch(/^[a-z-]+$/);
  });
  it('the sheet takes its title and who words from the helper, and still passes forChild to the figures', () => {
    const src = readFileSync('app/sheet/page.tsx', 'utf8');
    expect(src).toContain('const sw = sheetWho(pt?.stratum, pt?.relation);');
    expect(src).toContain('<h1 id="sheet-h1">{sw.title}</h1>');
    expect(src).toContain('Say who pays for {sw.whose} care');
    expect(src).toContain('fitOf(e.item, ctx, forChild)');
  });
});
