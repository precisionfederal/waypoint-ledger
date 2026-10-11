/* JUDGE-4 #5: /policy printed "7 answers from 2 senders" (a sender = one network
   on one day, _senders.js) beside "23 corrections from 23 distinct senders. A
   sender is one browser on one network" (a distinct submitter key, which is
   bound to ONE figure). One word now means one thing on every page; corrections
   are counted as corrections and say why they carry no sender count. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aggregateCorrections } from '../cf/functions/api/corrections.js';
import { submitterHash } from '../cf/functions/api/_hash.js';
import { SENDER_MEANS, CORRECTIONS_NOT_BY_SENDER } from '../lib/count-words';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SENDERS_JS = read('cf/functions/api/_senders.js');

describe('JUDGE-4 #5: one meaning for "sender"', () => {
  it('the page definition is the one _senders.js counts', () => {
    expect(SENDERS_JS).toContain('one network on one day, counted once');
    expect(SENDER_MEANS).toContain('one network on one day, counted once');
    expect(SENDER_MEANS).toContain('never a verified person');
  });
  it('a correction key is bound to its figure, so one browser on two figures is two keys', async () => {
    const a = await submitterHash('browser-1', 'cms-99213', '2026-09-09.1', 'p');
    const b = await submitterHash('browser-1', 'cms-99214', '2026-09-09.1', 'p');
    expect(a).not.toBe(b);
    const agg = aggregateCorrections([
      { priceId: 'cms-99213', verdict: 'right', senderKey: a, receivedAt: '2026-10-01T00:00:00Z' },
      { priceId: 'cms-99214', verdict: 'wrong', senderKey: b, receivedAt: '2026-10-01T00:00:00Z' },
    ] as never);
    /* one browser, two figures: two keys. That is why no page calls it senders. */
    expect(agg.sends).toBe(2);
    expect(agg.senders).toBe(2);
  });
  it('no page prints a sender count for corrections, and both pages define sender the same way', () => {
    for (const p of ['components/PolicyLive.tsx', 'components/Register.tsx', 'app/integrity/page.tsx']) {
      const src = read(p);
      expect(src, p).not.toMatch(/distinct \{/);
      expect(src, p).not.toContain('d.senders');
      expect(src, p).not.toContain('One browser on one network');
      expect(src, p).not.toContain('one browser on one network');
      expect(src, p).not.toContain('publishes senders as well as sends');
    }
    expect(read('components/PolicyLive.tsx')).toContain('{CORRECTIONS_NOT_BY_SENDER}');
    expect(read('components/PolicyLive.tsx')).toContain('{SENDER_MEANS}');
    expect(read('components/Register.tsx')).toContain("['Sender', SENDER_MEANS]");
    expect(read('components/Register.tsx')).toContain("['Not by sender', CORRECTIONS_NOT_BY_SENDER]");
    expect(CORRECTIONS_NOT_BY_SENDER).toContain('one correction per figure');
  });
  it('no em-dash in the new words', () => {
    expect(SENDER_MEANS + CORRECTIONS_NOT_BY_SENDER).not.toMatch(/\u2014/);
  });
});
