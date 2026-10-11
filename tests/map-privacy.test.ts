/* ==========================================================================
   THE AI READER SEES THE PHRASES THE RULES COULD NOT PLACE, AND NOTHING ELSE.

   /privacy, /journey and the demo script promise it. Until 2026-10-01 the
   request to the model carried the whole story and every phrase the rules had
   already read (R3-parent PAR-05). These tests run the real readWithModel()
   with a stand-in model on the Workers AI binding, the path the code takes
   when no OpenAI or Anthropic key is set, and read exactly what was sent.

   The stand-in answers the way the production reader answered the demo
   sentence on 2026-09-30 (the EMG halves map to cms-test-emg), so the demo's
   AI READ chip is proven end to end on this side of the wire: the id comes
   back, it is marked source 'model', and the table prices it.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readWithModel, phrasesForModel, buildPhrasePrompt, PHRASE_SYSTEM_PROMPT, NEIGHBOUR_WORDS } from '../cf/functions/api/map.js';
import { SYSTEM_PROMPT, candidatesOf, catalogFor } from '../lib/map-model';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const DEMO = 'saw my regular doctor three times, then a cardiologist, the heart ultrasound thing, then they put electrodes on my legs and shocked the nerves, then the ER once when my heart was racing';

type Sent = { instructions?: string; input?: string; messages?: { role: string; content: string }[] };

/** A Workers AI binding that records what it was sent and answers like the reader:
 *  a phrase about electrodes or shocked nerves is the EMG, anything else is null. */
function standInModel() {
  const sent: Sent[] = [];
  const AI = {
    async run(_model: string, input: Sent) {
      sent.push(input);
      const user = input.input ?? input.messages?.find((m) => m.role === 'user')?.content ?? '';
      const block = user.slice(user.indexOf('PHRASES TO MAP'));
      const map = [...block.matchAll(/^(\d+): (.*)$/gm)].map(([, i, line]) => {
        const phrase = line.split('   [just before:')[0];
        return { i: Number(i), id: /electrodes|shocked/.test(phrase) ? 'cms-test-emg' : null, why: 'stand-in' };
      });
      return { response: JSON.stringify({ map }) };
    },
  };
  const kv = new Map<string, string>();
  const LEDGER = {
    async get(k: string) { return kv.get(k) ?? null; },
    async put(k: string, v: string) { kv.set(k, v); },
  };
  return { env: { AI, LEDGER }, sent };
}

describe('what leaves for the model', () => {
  it('is the unplaced phrases, each with at most a few neighbouring words, and never the rest of the story', async () => {
    const { env, sent } = standInModel();
    const out = await readWithModel(env, DEMO, true) as { model: string | null; segments: { raw: string; itemId: string | null; source: string }[] };
    expect(out.model).not.toBeNull();
    expect(sent.length).toBe(1);
    const whole = String(sent[0].input ?? '');
    const system = String(sent[0].instructions ?? '');
    // The catalog comes first and carries synonyms of its own ("saw my regular doctor"),
    // so what the person wrote is read from the phrases block alone.
    expect(whole.startsWith('CATALOG')).toBe(true);
    const user = whole.slice(whole.indexOf('PHRASES TO MAP'));

    // The parts of the story the rules placed on their own, far from any unplaced phrase, never leave.
    expect(user).not.toContain('regular doctor');
    expect(user).not.toContain('three times');
    expect(user).not.toContain('racing');
    expect(whole).not.toContain(DEMO);
    expect(whole).not.toMatch(/WHOLE STORY|ALREADY READ/);
    expect(system).toBe(PHRASE_SYSTEM_PROMPT);

    // Every story word in the message sits inside an unplaced phrase or within NEIGHBOUR_WORDS of one.
    const segments = parseJourney(DEMO, SELECTABLE);
    const candidates = candidatesOf(segments);
    expect(candidates.length).toBeGreaterThan(0);
    for (const it of phrasesForModel(segments, candidates)) {
      expect(it.before.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(NEIGHBOUR_WORDS);
      expect(it.after.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(NEIGHBOUR_WORDS);
      expect(user).toContain(it.phrase);
    }
    // And no price in either direction.
    expect(whole).not.toMatch(/\$\s?\d/);
  });

  it('brings the demo EMG phrase back as cms-test-emg, marked as the model\'s read (the AI READ chip)', async () => {
    const { env } = standInModel();
    const out = await readWithModel(env, DEMO) as { model: string | null; filled: number; segments: { raw: string; itemId: string | null; source: string; absorbed?: boolean }[] };
    /* The half the rules cannot read on their own, "they put electrodes on my legs",
       is the one the model reads. (Whether "shocked the nerves" is read by the rules
       or joins it as the other half depends on data/synonyms.json, which the mapper
       owns; this test holds only what the reader path must do.) */
    const electrodes = out.segments.find((s) => /electrodes/.test(s.raw));
    expect(electrodes).toBeTruthy();
    expect(electrodes!.itemId).toBe('cms-test-emg');
    expect(electrodes!.source).toBe('model');
    expect(electrodes!.absorbed).toBeUndefined();
    expect(out.filled).toBeGreaterThanOrEqual(1);
    expect(out.segments.filter((s) => s.itemId === 'cms-test-emg' && !s.absorbed).length).toBe(1);   // one appointment, one EMG line
    // The rules' own lines are untouched.
    expect(out.segments.filter((s) => s.itemId && s.source === 'rules').length).toBeGreaterThanOrEqual(4);
  });

  it('asks nothing when the rules placed every phrase', async () => {
    const { env, sent } = standInModel();
    const out = await readWithModel(env, 'saw my regular doctor three times') as { model: string | null; note?: string };
    expect(sent.length).toBe(0);
    expect(out.model).toBeNull();
  });

  it('the system prompt no longer asks for the whole story or the rules\' list', () => {
    expect(SYSTEM_PROMPT).toContain('in the context of the whole story');   // the source still says it…
    expect(PHRASE_SYSTEM_PROMPT).not.toContain('whole story');               // …what is sent does not
    expect(PHRASE_SYSTEM_PROMPT).not.toContain('ALREADY READ');
    expect(PHRASE_SYSTEM_PROMPT).toContain('NEVER INVENT SPECIFICITY');
    expect(PHRASE_SYSTEM_PROMPT).toContain('Never mention money.');
  });

  it('the user message is only the catalog and the phrases', () => {
    const msg = buildPhrasePrompt(catalogFor(SELECTABLE).slice(0, 2), [{ phrase: 'shocked the nerves', before: 'put electrodes on my legs', after: '' }]);
    expect(msg.startsWith('CATALOG')).toBe(true);
    expect(msg).toContain('0: shocked the nerves   [just before: "put electrodes on my legs"');
  });
});

/* R4 content request 2: who is answering an interview is optional, one of two
   fixed values, and is kept inside the encrypted answers, never in a column. */
import { validateInterview, tooShort } from '../cf/functions/api/interview.js';
import { INTERVIEW_RESPONDENT_CARER } from '../lib/survey-def.js';
describe('interview respondent', () => {
  const answers = { q1: 'It started when she was eleven and nobody listened.', q2: 'Two years of copays and missed shifts at work.', q3: 'The tilt table test was billed at over a thousand dollars.' };
  it('keeps a known value, drops anything else, and never counts it as an answer', () => {
    const ok = validateInterview({ consent: 'notes', answers, respondent: INTERVIEW_RESPONDENT_CARER }) as unknown as { record: { respondent?: string; answers: Record<string, string> } };
    expect(ok.record.respondent).toBe(INTERVIEW_RESPONDENT_CARER);
    expect(Object.keys(ok.record.answers)).toEqual(['q1', 'q2', 'q3']);
    expect(tooShort(ok.record)).toBeNull();
    const odd = validateInterview({ consent: 'notes', answers, respondent: 'my neighbour' }) as unknown as { record: { respondent?: string } };
    expect(odd.record.respondent).toBeUndefined();
  });
});
