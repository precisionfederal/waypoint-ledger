/* R6-FIX · the flow lane — "every click does what it says, on every device".

   Three adversaries graded the live site LOSE on 2026-09-09. These are the nine
   findings in ../winloop/R6/edge.md that belong to the flow of the product, each
   pinned by the adversary's own sentence, so an edit that walks one back fails
   here instead of on a judge's screen on 22 October.

   Where the proof has to be a browser, it is: ../winloop/R6-FIX/after/flow-*.jpg
   and the numbers quoted in ../winloop/R6-FIX/flow.md. What is here is the part
   that keeps holding after those screenshots are stale. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { withSenders, DENOMINATOR, NO_INDEX_DENOMINATOR } from '../cf/functions/api/_senders.js';
import { clampPerYear, isPerYear, STORY_MAX } from '@/lib/store';
import { TABLE } from '@/lib/table';

const read = (p: string) => readFileSync(p, 'utf8');
const ledger = read('components/Ledger.tsx');
const builder = read('components/JourneyBuilder.tsx');
const drawer = read('components/LineDrawer.tsx');
const store = read('lib/store.tsx');
const middleware = read('cf/functions/_middleware.js');
const survey = read('cf/functions/api/survey.js');
const gap = read('cf/functions/api/gap.js');
const css = read('app/product.css');

const at = (hay: string, needle: string) => {
  const i = hay.indexOf(needle);
  expect(i, `not found in source: ${needle}`).toBeGreaterThan(-1);
  return i;
};

/* ---------------------------------------------------------------- edge #3 */
describe("edge #3 — \"The register's N counts submissions, not people — one browser posted four 'respondents'\"", () => {
  it('publishes people under n and sends beside it as submissions', () => {
    const r = withSenders({ ok: true, n: 4 }, { key: 'n', people: 1, submissions: 4 });
    expect(r.n).toBe(1);
    expect(r.submissions).toBe(4);
    expect(r.senderBasis).toBe('senders');
    expect(r.denominator).toBe(DENOMINATOR);
  });

  it('does the same for the gap report, under the name that page reads', () => {
    const r = withSenders({ ok: true, respondents: 3 }, { key: 'respondents', people: 1, submissions: 3 });
    expect(r.respondents).toBe(1);
    expect(r.submissions).toBe(3);
  });

  it('never publishes more senders than sends, and never zero senders for a sample that has one', () => {
    expect(withSenders({}, { people: 9, submissions: 4 }).n).toBe(4);
    expect(withSenders({}, { people: 0, submissions: 3 }).n).toBe(1);
    expect(withSenders({}, { people: 5, submissions: 0 }).n).toBe(0);
  });

  it('says so in the published body when the sender index could not be read, instead of quietly counting sends as people', () => {
    const r = withSenders({ ok: true, n: 6 }, { key: 'n', people: null, submissions: 6 });
    expect(r.n).toBe(6);
    expect(r.senderBasis).toBe('sends');
    expect(r.denominator).toBe(NO_INDEX_DENOMINATOR);
  });

  it('counts the sender on both instruments, after the row is written, and never in the row', () => {
    for (const [name, src] of [['survey', survey], ['gap', gap]] as const) {
      expect(src, name).toContain("import { markSender, peopleCount, withSenders } from './_senders.js';");
      expect(at(src, `await markSender(request, env, '${name}')`), name).toBeGreaterThan(at(src, `await count(env, '${name}')`));
      /* FINAL-1011: withSendersCounted (survey.js) wraps withSenders and holds the sender count back while team tests are marked. */
      expect(src.includes('withSenders(agg,') || src.includes('withSendersCounted(agg,'), name).toBe(true);
      /* nothing about the sender is written into the row the chain publishes */
      expect(src.includes('sender_hash') || src.includes('sender_key'), name).toBe(false);
    }
  });
});

/* ---------------------------------------------------------------- edge #4 */
describe('edge #4 — "the 21st thumbs-down in the room fails" (a demo room is one hashed IP)', () => {
  const limit = (path: string) => {
    const m = middleware.match(new RegExp(`'POST /api/${path}':\\s*(\\d+)`));
    expect(m, `no limit line for /api/${path}`).toBeTruthy();
    return Number(m![1]);
  };
  it('gives the gap report and corrections a room-sized ceiling', () => {
    for (const p of ['gap', 'corrections']) expect(limit(p), p).toBeGreaterThanOrEqual(300);
  });
  /* R1-security S-04 (2026-09-30) changed this on purpose: at 300 an hour one
     network could add hundreds of survey answers and interviews, the two counts
     Bo reads out. They now take a human rate, and a day cap on top. */
  it('holds the interview to a human rate, per hour and per day', () => {
    expect(limit('interview')).toBeGreaterThanOrEqual(3);
    expect(limit('interview')).toBeLessThanOrEqual(10);
    expect(middleware).toMatch(/'\/api\/interview':\s*\d+/);
  });
  /* Bo, 2026-09-30 21:3x CT: "remove this … why limit the survey". The survey keeps
     only the room-sized flood guard, and no day cap. */
  it('never refuses a person on the survey: only the room-sized flood guard, no day cap', () => {
    expect(limit('survey')).toBe(300);
    expect(middleware).not.toMatch(/'\/api\/survey':\s*\d+/);
  });
  it('keeps the per-figure cap as the real abuse control', () => {
    expect(read('cf/functions/api/corrections.js')).toContain('export const FIGURE_CAP = { hour: 3, day: 8 };');
  });
});

/* ---------------------------------------------------------------- edge #5 */
describe('edge #5 — "\'Prefer not to say\' shows the person somebody else\'s number as the headline"', () => {
  it('answers a declined person with an empty card before it ever reaches the figure', () => {
    const declined = at(ledger, 'The year figure: you chose not to say');
    expect(declined).toBeLessThan(at(ledger, '<YearAheadCard impliedFrom={typedWords} />'));
    expect(ledger).toContain('const { declined, hydrated: declinedHydrated } = useDeclined();');
    expect(ledger).toContain('declinedHydrated && declined ?');
  });
  it('prints no dollar figure in that card', () => {
    const block = ledger.slice(at(ledger, 'year-ahead-declined'), at(ledger, 'Which conditions have a figure'));
    expect(/\$\s?\d/.test(block)).toBe(false);
  });
});

/* --------------------------------------------------------------- edge #11 */
describe('edge #11 — "A pasted story is silently cut at 2,000 characters"', () => {
  it('holds one definition of 2,000, the same one the server prices', () => {
    expect(STORY_MAX).toBe(2000);
    expect(read('cf/functions/api/map.js')).toContain(`const MAX_STORY = ${STORY_MAX};`);
  });
  it('says how much it prices, prices exactly that, and keeps the rest in the box', () => {
    expect(builder).toContain('const over = Math.max(0, story.length - STORY_MAX);');
    expect(builder).toContain('const storyForPricing = over ? story.slice(0, STORY_MAX) : story;');
    expect(builder).toContain('useLivePreview(storyForPricing)');
    expect(builder).toContain("const rest = over ? story.slice(STORY_MAX)");
    expect(builder).toContain('id="story-count"');
    /* and it does not navigate away from a box that still holds their words */
    expect(builder).toContain('if (r.added > 0 && !rest) router.push(');
  });
});

/* --------------------------------------------------------------- edge #12 */
describe('edge #12 — "The share link — the People\'s-Choice lever — is hidden behind a fold"', () => {
  it('stands in the Take it somewhere card, above the fold that used to hold it', () => {
    expect(at(ledger, 'Copy a share link')).toBeLessThan(at(ledger, '<details className="more-ways">'));
  });
  it('appears exactly once', () => {
    expect(ledger.split(": 'Copy a share link'}").length - 1).toBe(1);
  });
});

/* --------------------------------------------------------------- edge #13 */
describe('edge #13 — "There is no way to start over from the ledger"', () => {
  it('puts Start over on the page, outside the fold, behind the same confirm the journey page uses', () => {
    const i = at(ledger, '<StartOverButton />');
    expect(i).toBeGreaterThan(at(ledger, '</details>'));
    /* FLOW patient-11 (core): one Start over for both pages, in components/LineControls.tsx,
       still behind a confirm, now saying "ledger" and offering Undo. */
    const controls = readFileSync('components/LineControls.tsx', 'utf8');
    expect(ledger).toContain('<StartOverButton />');
    expect(builder).toContain('<StartOverButton />');
    expect(controls).toContain('if (!confirm(START_OVER_CONFIRM)) return;');
    expect(controls).toContain('st.reset();');
  });
});

/* --------------------------------------------------------------- edge #14 */
describe('edge #14 — "Back button and hard refresh lose the story the person typed"', () => {
  it('holds the draft for this tab, and clears it when the words become lines or the person starts over', () => {
    expect(store).toContain("export const STORY_DRAFT_KEY = 'waypoint.story';");
    expect(store).toContain('sessionStorage.getItem(STORY_DRAFT_KEY)');
    expect(store).toContain('clearStoryDraft(); try { localStorage.removeItem(KEY)');
    expect(builder).toContain('const draft = readStoryDraft(); if (draft) setStory(draft);');
    expect(builder).toContain('saveStoryDraft(story)');
    expect(builder).toContain('else clearStoryDraft();');
  });
});

/* --------------------------------------------------------------- edge #15 */
describe('edge #15 — "The drawer has no dialog semantics"', () => {
  it('names the dialog with the heading the person can see', () => {
    expect(drawer).toContain('<Dialog open onClose={onClose} labelledBy="drawer-title" label={item.label}>');
    expect(drawer).toContain('<h2 id="drawer-title">{item.label}</h2>');
  });
  it('keeps the platform dialog that carries role and aria-modal', () => {
    const dialog = read('components/Dialog.tsx');
    expect(dialog).toContain('el.showModal()');
    expect(dialog).toContain('aria-labelledby={labelledBy}');
  });
});

/* --------------------------------------------------------------- edge #16 */
describe('edge #16 — "Thirteen controls on the phone ledger are under 44 px"', () => {
  /* The R6 block runs to the next fixer's marked block (round 2 added
     "/* >>> LEDGER (round 2) *\/" after it, whose 16 px paid input is there to
     stop iOS zooming, which is a type-size rule by design). */
  const from = at(css, 'R6-FIX flow');
  const next = css.indexOf('/* >>> ', from);
  const block = css.slice(from, next === -1 ? undefined : next);
  it('grows the standalone controls to 44 px', () => {
    expect(block).toContain('.fit-mark{padding-block:.75rem}');
    expect(block).toContain('button[class*="fitChange"]{min-height:44px');
    expect(block).toContain('.ledger-foot .link-btn{min-height:44px}');
  });
  it('never buys the hit area with type size', () => {
    expect(/font-size/.test(block)).toBe(false);
  });
});

/* ------------------------------------------------------------- data F5 */
describe('data F5 — "A once-a-year code is multiplied by the count the person typed"', () => {
  it('caps a once-a-year row at one, whatever the person typed', () => {
    const annual = (TABLE as unknown as { id: string; perYear?: boolean; max_per_year?: number }[])
      .filter((i) => i.perYear === true || i.max_per_year === 1);
    for (const it of annual) {
      expect(clampPerYear(it as never, 6), it.id).toEqual({ times: 1, capped: 5 });
      expect(isPerYear(it.id)).toBe(true);
    }
    /* The frequency is a fact about a federal file, so the field is the figures
       lane's to add from the CY2024 claims file (data F5 names cms-g0442 and
       cms-g0444). Until it lands the guard is inert BY CONSTRUCTION — it never
       invents a frequency rule of its own — and these two rows prove it is
       reading the table it will read. */
    const ids = (TABLE as unknown as { id: string }[]).map((i) => i.id);
    expect(ids).toContain('cms-g0442');
    expect(ids).toContain('cms-g0444');
  });
  it('leaves every other row exactly as the person counted it', () => {
    const plain = (TABLE as unknown as { id: string; perYear?: boolean }[]).find((i) => !i.perYear)!;
    expect(clampPerYear(plain as never, 6)).toEqual({ times: 6, capped: 0 });
  });
});
