/* JUDGE-3 #3: /policy called the uncounted-care senders "reports".
   /api/gap on staging returned respondents 1, submissions 3, and /policy printed
   "N = 1 report" beside the register's "3 reports of uncounted care". The N is
   the reports, with the senders beside it, and the summary says how many of the
   six kinds of care were actually named. */
import { describe, it, expect } from 'vitest';
import { gapN, gapNamed } from '../components/PolicyLive';
import { gapView, SMALL_CELL_MIN } from '../lib/policy';
import { withSenders } from '../cf/functions/api/_senders.js';

/* The staging shape: three reports, one sender, two kinds named. */
const oneSender = gapView(
  withSenders({ respondents: 3, gap: [{ category: 'dismissed', respondentsReporting: 2 }, { category: 'care-denied', respondentsReporting: 1 }] },
    { key: 'respondents', people: 1, submissions: 3 }),
  SMALL_CELL_MIN,
);
/* Several senders: twelve reports from five senders, one kind past the small-cell line. */
const severalSenders = gapView(
  withSenders({ respondents: 12, gap: [{ category: 'care-denied', respondentsReporting: 11 }, { category: 'dismissed', respondentsReporting: 3 }, { category: 'life-lost', respondentsReporting: 1 }] },
    { key: 'respondents', people: 5, submissions: 12 }),
  SMALL_CELL_MIN,
);

describe('JUDGE-3 #3: the uncounted-care N on /policy', () => {
  it('one sender: "3 reports from 1 sender", never "1 report"', () => {
    expect(oneSender.respondents).toBe(1);
    expect(oneSender.submissions).toBe(3);
    expect(gapN(oneSender)).toBe('3 reports from 1 sender');
  });
  it('several senders: "12 reports from 5 senders"', () => {
    expect(gapN(severalSenders)).toBe('12 reports from 5 senders');
  });
  it('one report from one sender is singular on both words', () => {
    const g = gapView(withSenders({ respondents: 1, gap: [] }, { key: 'respondents', people: 1, submissions: 1 }), SMALL_CELL_MIN);
    expect(gapN(g)).toBe('1 report from 1 sender');
  });
  it('no reports: "0 reports", no sender clause', () => {
    const g = gapView(withSenders({ respondents: 0, gap: [] }, { key: 'respondents', people: 0, submissions: 0 }), SMALL_CELL_MIN);
    expect(gapN(g)).toBe('0 reports');
    expect(gapNamed(g)).toMatch(/^0 of the \d+ kinds of care named$/);
  });
  it('sender index unread: the reports alone, no sender count invented', () => {
    const g = gapView(withSenders({ respondents: 4, gap: [] }, { key: 'respondents', people: null, submissions: 4 }), SMALL_CELL_MIN);
    expect(g.senderBasis).toBe('sends');
    expect(gapN(g)).toBe('4 reports');
  });
  it('counts the kinds named, a withheld small cell included, out of every kind', () => {
    const total = oneSender.categories.length;
    expect(total).toBe(7); // FINAL-1011: "Care that made you worse" is the seventh kind
    expect(gapNamed(oneSender)).toBe('2 of the 7 kinds of care named');
    /* life-lost at 1 and dismissed at 3 are withheld (null) but were named. */
    expect(severalSenders.categories.find((c) => c.id === 'dismissed')!.reporting).toBeNull();
    expect(gapNamed(severalSenders)).toBe('3 of the 7 kinds of care named');
  });
  it('the summary and caption source print the new N, not the senders as reports', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../components/PolicyLive.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/gap\.respondents\} \$\{gap\.respondents === 1 \? 'report'/);
    expect(src).not.toMatch(/N = \{gap\.respondents\}/);
    expect(src.match(/gapN\(gap\)/g)!.length).toBe(2);
  });
});
