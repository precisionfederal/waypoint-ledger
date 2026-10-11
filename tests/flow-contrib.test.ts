/* ==========================================================================
   FLOW contrib (2026-09-30): the contributor journeys, pinned.
   Account sign-in errors, the erase answer, saved-ledger names, the survey
   and interview drafts, and the thank-you pages. Pure helpers are imported;
   the rest is read from the source, as the other round tests do.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { emailProblem } from '../components/Account';
import { erasedSentence, ledgerTitle, tableVersionText } from '../components/AccountDashboard';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const account = read('components/Account.tsx');
const dashboard = read('components/AccountDashboard.tsx');
const authClient = read('lib/auth-client.ts');
const meApi = read('cf/functions/api/me.js');

describe('contrib-1/2: a sign-in error is said where the person is looking', () => {
  it('a malformed address is called a typo before any request', () => {
    expect(emailProblem('not-an-email')).toMatch(/does not look like an email address/);
    expect(emailProblem('')).toMatch(/email address first/);
    expect(emailProblem(' someone@example.com ')).toBeNull();
  });
  it('the password door renders its error above its own buttons and moves focus to it', () => {
    expect(account).toContain("{errBox('password')}\n            <div className={s.stack}>");
    expect(account).toContain('role="alert" tabIndex={-1} ref={errRef}');
    expect(account).toMatch(/if \(err\) errRef\.current\?\.focus\(\)/);
  });
});

describe('contrib-3: erasing an account says what went, from the server answer', () => {
  it('the endpoint returns removed counts and the client passes them on', () => {
    expect(meApi).toContain('removed: erased');
    expect(authClient).toMatch(/export async function eraseAccount\(\): Promise<ErasedCounts \| null>/);
    expect(dashboard).toContain('onUser(null, erasedSentence(user, removed))');
    expect(account).toContain('role="status" tabIndex={-1} ref={erasedRef} data-testid="account-erased"');
  });
  it('names each count, and never shows an unread count as zero', () => {
    const u = { email: 'a@example.com', hasPassword: true };
    expect(erasedSentence(u, { journeys: 2, passkeys: 0, corrections: 1 })).toBe(
      'Your account is erased: your email address and password and 2 saved ledgers. Their links no longer open, for you or for anyone you sent them to. The 1 correction you sent stays in the public register, no longer linked to you.');
    expect(erasedSentence({ email: null, hasPassword: false }, { journeys: null, passkeys: 1, corrections: 0 }))
      .toBe('Your account is erased: 1 passkey and its saved ledgers. Their links no longer open, for you or for anyone you sent them to.');
  });
});

describe('contrib-16: a saved ledger is never "Untitled"', () => {
  it('names an untitled save by its lines and date, and the table by its date', () => {
    expect(ledgerTitle({ title: null, createdAt: '2026-09-30T20:00:00Z' })).toMatch(/^Ledger saved /);
    expect(ledgerTitle({ title: 'Mine', createdAt: '2026-09-30T20:00:00Z' })).toBe('Mine');
    expect(tableVersionText('2026-09-09.1')).toMatch(/^priced with the federal figures of /);
    expect(tableVersionText('2026-09-09.1')).toMatch(/2026/);
    expect(dashboard).not.toContain("'Untitled ledger'");
  });
});

import { cleanSurveyDraft } from '../components/SurveyForm';
import { parseDraft, substantive, DRAFT_DAYS } from '../components/InterviewForm';
const survey = read('components/SurveyForm.tsx');
const interview = read('components/InterviewForm.tsx');

describe('contrib-5: a half-answered survey survives a reload, never with the private sentence', () => {
  it('keeps only values the instrument knows', () => {
    const d = cleanSurveyDraft({ ranking: ['time', 'oop', 'nope', 'time'], unasked: 'all-asked', lead: 'x', decide: 'patients', clinicians: '7',
      context: { sex: 'Female', age: 'not a band', respondent: 'A parent or caregiver, answering for a child' }, sentence: 'secret' });
    expect(d).toEqual({ ranking: ['time', 'oop'], unasked: 'all-asked', lead: '', decide: 'patients', clinicians: '7',
      context: { sex: 'Female', respondent: 'A parent or caregiver, answering for a child' } });
    expect(JSON.stringify(d)).not.toContain('secret');
    expect(cleanSurveyDraft({ ranking: [], context: {} })).toBeNull();
  });
  it('is held per tab, cleared on send, and offers Start fresh', () => {
    expect(survey).toContain("sessionStorage.setItem(SURVEY_DRAFT_KEY");
    expect(survey).not.toMatch(/writeSurveyDraft\(\{[^}]*sentence/);
    expect(survey).toContain('Restored your answers from earlier in this tab.');
    expect(survey).toContain('>Start fresh</button>');
  });
});

describe('contrib-4, 8, 9, 10: the survey reads right for a parent, reorders in one tap, and says where the answer went', () => {
  it('names whose sex, for a caregiver', () => {
    expect(survey).toContain("forChild ? 'The child’s sex' : CONTEXT.sex.label");
  });
  it('moves a ranked burden with labelled arrows', () => {
    expect(survey).toContain('aria-label={i === 0 ? `${b.label} is already first` : `Move ${b.label} up to ${i}`}');
    expect(survey).toContain('aria-label={i === ranking.length - 1 ? `${b.label} is already last` : `Move ${b.label} down to ${i + 2}`}');
  });
  it('an early press lists what is missing in the sticky card and scrolls before it focuses', () => {
    expect(survey).toContain('className="fc-still" role="alert"');
    expect(survey).toContain("box.focus({ preventScroll: true })");
    expect(survey).toContain("aria-describedby={complete || pressedEarly ? undefined : 'survey-missing'}");
  });
  it('the thank-you links the live register and the link\'s own count', () => {
    expect(survey).toContain('Your answer counted.');
    expect(survey).toContain('href="/register/live">See your answer counted on the live register');
    expect(survey).toContain('/register/channel?c=${encodeURIComponent(channel)}');
  });
});

describe('contrib-6, 7, 12, 13: the interview keeps a long answer readable and a draft for a week', () => {
  it('a draft older than DRAFT_DAYS is dropped, a fresh one is kept', () => {
    const now = Date.UTC(2026, 9, 1);
    const body = (age: number) => JSON.stringify({ answers: { q1: 'A whole sentence about it here.' }, consent: 'notes', followUp: false, savedAt: now - age });
    expect(parseDraft(body(86_400_000), now)?.answers.q1).toBe('A whole sentence about it here.');
    expect(parseDraft(body((DRAFT_DAYS + 1) * 86_400_000), now)).toBeNull();
    expect(parseDraft(JSON.stringify({ answers: { q1: 'x' }, name: 'Pat', email: 'p@example.com' }), now)).not.toHaveProperty('name');
  });
  it('the substantive rule matches the server', () => {
    const api = read('cf/functions/api/interview.js');
    expect(api).toContain('export const SUBSTANTIVE_CHARS = 20;');
    expect(api).toContain('export const SUBSTANTIVE_WORDS = 4;');
    expect(substantive('short')).toBe(false);
    expect(substantive('I paid $211 for the echo.')).toBe(true);
  });
  it('shows the saved line, Clear, the shared-computer opt-out, and the too-short note', () => {
    expect(interview).toContain('>Clear my draft</button>');
    expect(interview).toContain('This is a shared computer: keep it in this tab only');
    expect(interview).toContain('A sentence or two, please: this one is too short to count yet.');
    expect(interview).toContain("localStorage.setItem(DRAFT_KEY, body)");
  });
  it('someone who just sent the survey is not asked to rank again', () => {
    expect(survey).toContain("sessionStorage.setItem('waypoint.survey.sent', '1')");
    expect(interview).toContain("export const SURVEY_SENT_KEY = 'waypoint.survey.sent'");
  });
});
