/* ==========================================================================
   A CACHED READ NEVER OUTLIVES THE RULES THAT MADE IT (FLOW2 patient2-1).

   /api/map keeps a model answer in KV for a day. The answer carries the rules'
   own segments, and the browser takes the server's segments wholesale, so a
   key without the rules in it served yesterday's read of the same words after
   a mapper or synonyms change (supplements priced as blood tests again). The
   key now carries a hash of the rules' read of the story: same rules, same
   key, a cache hit; different rules, a different key, a fresh read.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../cf/functions/api/map.js';
import { parseJourney } from '../lib/mapper';
import { toWire } from '../lib/map-model';
import { SELECTABLE } from '../lib/table';

const STORY = 'saw my regular doctor three times, then they put electrodes on my legs and shocked the nerves';

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function env() {
  const kv = new Map<string, string>();
  const AI = {
    async run(_m: string, input: { input?: string; messages?: { role: string; content: string }[] }) {
      const user = input.input ?? input.messages?.find((m) => m.role === 'user')?.content ?? '';
      const block = user.slice(user.indexOf('PHRASES TO MAP'));
      const map = [...block.matchAll(/^(\d+): (.*)$/gm)].map(([, i, line]) => ({ i: Number(i), id: /electrodes|shocked/.test(line) ? 'cms-test-emg' : null, why: 'stand-in' }));
      return { response: JSON.stringify({ map }) };
    },
  };
  const LEDGER = {
    async get(k: string, type?: string) { const v = kv.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k: string, v: string) { kv.set(k, v); },
  };
  return { env: { AI, LEDGER }, kv };
}

const post = (e: unknown) => onRequestPost({
  request: new Request('https://example.test/api/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ story: STORY }) }),
  env: e,
} as never);

describe('the /api/map cache key', () => {
  it("carries the rules' own read of the story, so a rules change is never answered from the cache", async () => {
    const { env: e, kv } = env();
    const first = await (await post(e)).json() as { cached: boolean; model: string | null };
    expect(first.model).not.toBeNull();
    expect(first.cached).toBe(false);
    const keys = [...kv.keys()].filter((k) => k.startsWith('map:') && !k.startsWith('map:spend:'));
    expect(keys.length).toBe(1);
    const rulesHash = (await sha256(JSON.stringify(toWire(parseJourney(STORY, SELECTABLE))))).slice(0, 12);
    expect(keys[0].split(':')).toContain(rulesHash);

    // Same rules, same story: the second read is the cached one.
    const second = await (await post(e)).json() as { cached: boolean };
    expect(second.cached).toBe(true);
  });
});
