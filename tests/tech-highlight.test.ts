/* VISUAL tech (2026-09-30 night): the code on /developers and /integrity is
   coloured by components/tech/highlight.ts. Colour may never change a
   character: what a developer sees and copies is what ran. */
import { describe, it, expect } from 'vitest';
import * as Dev from '../components/Developers';
import { highlight } from '../components/tech/highlight';

const blocks = Object.entries(Dev).filter(([, v]) => typeof v === 'string') as [string, string][];
const join = (code: string, lang?: Parameters<typeof highlight>[1]) => highlight(code, lang).map((l) => l.map((t) => t.t).join('')).join('\n');

describe('the highlighter labels characters and never changes one', () => {
  it('gives back every /developers block exactly, in every grammar', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(11);
    for (const [k, v] of blocks) for (const lang of ['auto', 'json', 'text', 'python', 'shell'] as const) expect(join(v, lang), `${k} ${lang}`).toBe(v);
  });
  it('colours a curl call: the command, a flag, the variable and the JSON body', () => {
    const toks = highlight(Dev.CURL_PRICE).flat();
    expect(toks.find((t) => t.t === 'curl')?.k).toBe('cmd');
    expect(toks.find((t) => t.t.trim() === '-X')?.k).toBe('flag');
    expect(toks.find((t) => t.t === '$BASE')?.k).toBe('var');
    expect(toks.find((t) => t.t === '"story"')?.k).toBe('key');
  });
  it('colours JSON keys, strings, numbers and literals', () => {
    const toks = highlight('{"ok": true, "valueUsd": 95.19, "basis": "allowed"}', 'json').flat();
    expect(toks.find((t) => t.t === '"ok"')?.k).toBe('key');
    expect(toks.find((t) => t.t === 'true')?.k).toBe('lit');
    expect(toks.find((t) => t.t === '95.19')?.k).toBe('num');
    expect(toks.find((t) => t.t === '"allowed"')?.k).toBe('str');
  });
});
