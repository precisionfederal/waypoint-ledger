/* FLOW3 flow3-1: Add tapped while the AI read is still out never loses the read. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyLateRead, lateReadToast } from '../lib/late-read';
import { TABLE } from '../lib/table';
import type { ParsedSegment } from '../lib/mapper';
import type { JourneyEntry } from '../lib/types';

const visit = TABLE.find((t) => t.id === 'cms-99213')!;
const echo = TABLE.find((t) => /echocardiogram/i.test(t.label))!;
if (!visit || !echo) throw new Error('fixture items missing from the table');
const RAW = 'saw my pediatrican like 10 tims';
const blank = (key: string, raw: string, times: number): JourneyEntry => ({ key, raw, item: null, times, source: 'rules' });
const seg = (raw: string, item: typeof visit | null, source: 'rules' | 'model', times = 1): ParsedSegment =>
  ({ raw, times, result: { item, confidence: item ? 'high' : 'none', score: item ? 1 : 0, matchedOn: null, reason: null, gapCategory: null, months: null } as unknown as ParsedSegment['result'], source, modelWhy: source === 'model' ? 'a visit to a doctor' : null });

describe('flow3-1 the late read fills the blank lines it priced', () => {
  it('fills the blank line by the words she typed, keeps its count, marks it AI read', () => {
    const entries: JourneyEntry[] = [blank('a', RAW, 10), { key: 'b', raw: 'an echo', item: echo, times: 1, source: 'rules' }];
    const r = applyLateRead(entries, [seg(RAW, visit, 'model', 10), seg('an echo', echo, 'rules')]);
    expect(r.upgraded).toEqual([{ key: 'a', label: visit.label, times: 10 }]);
    expect(r.entries[0]).toMatchObject({ key: 'a', item: visit, times: 10, source: 'model', modelWhy: 'a visit to a doctor' });
    expect(r.entries[1]).toBe(entries[1]);
    expect(lateReadToast(r.upgraded)).toBe(`The AI read priced 1 more line: ${visit.label} ×10.`);
  });
  it('never touches a line that is no longer blank, a gap counter, a length of time, or a rules answer', () => {
    const entries: JourneyEntry[] = [
      { key: 'a', raw: RAW, item: echo, times: 10, source: 'rules' },
      { key: 'b', raw: 'went without care', item: null, times: 1, gapCategory: 'skipped-care' },
      { key: 'c', raw: 'two years', item: null, times: 1, months: 24 },
      blank('d', 'something odd', 1),
    ];
    const r = applyLateRead(entries, [seg(RAW, visit, 'model'), seg('went without care', visit, 'model'), seg('two years', visit, 'model'), seg('something odd', visit, 'rules')]);
    expect(r.upgraded).toEqual([]);
    expect(r.entries).toBe(entries);
    expect(lateReadToast(r.upgraded)).toBeNull();
  });
  it('one read fills one line: two blank lines with the same words take two reads', () => {
    const r = applyLateRead([blank('a', RAW, 2), blank('b', ` ${RAW.toUpperCase()} `, 3)], [seg(RAW, visit, 'model')]);
    expect(r.upgraded.map((u) => u.key)).toEqual(['a']);
    expect(r.entries[1].item).toBeNull();
  });
  it('home: Add waits for a read in flight, says so, and hands a late read to the store', () => {
    const src = readFileSync('app/page.tsx', 'utf8');
    expect(src).toContain("const settled = !preview.pending && !preview.reading;");
    expect(src).toContain("if (settled) { commit(story); return; }");
    expect(src).toContain("'Finishing the read…'");
    expect(src).toContain('aria-busy={finishing || undefined}');
    expect(src).toContain('const FINISH_READ_MS = 4000;');
    expect(src).toMatch(/sharedRead\(asked\)\.then\(\(r\) => \{ if \(r\.model\) st\.applyRead\(r\.segments\); \}\)/);
    // the read is no longer aborted when the page moves on (the live preview lives in
    // components/LivePreview.tsx since the perf split; JourneyBuilder re-exports it)
    const jb = readFileSync('components/LivePreview.tsx', 'utf8');
    expect(jb).toContain('sharedRead(debounced).then(');
    expect(jb).not.toMatch(/parseJourneyWithModel\(debounced, ITEMS, fetch, ctl\.signal\)/);
  });
});
