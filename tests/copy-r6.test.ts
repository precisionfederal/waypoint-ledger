/* ==========================================================================
   R6-FIX · COPY — one test per finding, each quoting the adversary that found it.

   R6 sense (../winloop/R6/sense.md) read every sentence on the live site and
   graded it LOSE. The findings below are the ones about what the pages SAY: a
   page that tells a person their words stay in the browser while the browser is
   posting them, a journal estimate printed as an AHRQ figure, a claim about
   federal data that a reviewer disproves in one second, and a statistic we
   invented. Each test holds the sentence that replaced it.
   ========================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE_COMPOSITION, sourceComposition } from '../lib/source-composition';
import { TABLE } from '../lib/table';
import { benchmarkFor, CONDITIONS } from '../lib/conditions';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const home = read('app/page.tsx');
const privacy = read('app/privacy/page.tsx');
const integrity = read('app/integrity/page.tsx');
const method = read('data/METHOD.md');
const picker = read('components/ConditionPicker.tsx');
const gapPanel = read('components/GapPanel.tsx');
const register = read('components/Register.tsx');
const events = read('data/invisible-events.json');
const shell = read('components/Shell.tsx');
const survey = read('components/SurveyForm.tsx');

/* -------------------------------------------------------------------- F2 */
describe('sense F2 — "Two pages tell the user their words stay in the browser while the browser is posting them to the API"', () => {
  it('the home FAQ says what leaves: only the unplaced phrases to OpenAI, never a price, deleted after a day', () => {
    expect(home).toContain('Your ledger stays in your browser');
    expect(home).toContain('only the phrases they cannot place go, with a few words around each, to an AI model run by OpenAI');
    expect(home).not.toContain('sent to our reader');
    expect(home).toContain('never a price, in or out');
    expect(home).toContain('deleted after a day');
  });
  it('the bare claim "It stays in your browser." is gone from that answer', () => {
    expect(home).not.toContain('<p>It stays in your browser.');
  });
  it('the heading is about the ledger, not about the device', () => {
    expect(home).toContain('Your ledger stays on your device');
    expect(home).not.toContain('Your ledger never leaves your device');
    expect(home).not.toContain('Nothing leaves your device unless you send it</summary>');
  });
});

/* -------------------------------------------------------------------- F4 */
describe('sense F4 — "/integrity says accounts will never exist; /account signs people up"', () => {
  it('the anti-stuffing argument no longer rests on a sentence our own nav falsifies', () => {
    expect(integrity).not.toContain('there never');
    expect(integrity).toContain('A correction never requires an account');
    expect(integrity).toContain('counted exactly like an anonymous one');
  });
});

/* --------------------------------------------------------------- F5 + data F8 */
describe('sense F5 / data F8 — "the year-ahead headline figure is a journal estimate printed as an AHRQ figure"', () => {
  const b = benchmarkFor('long-covid');
  it('the row still knows it is not a government publication', () => {
    expect(b?.kind).toBe('figure');
    if (b?.kind !== 'figure') return;
    expect(b.isGovernmentPublication).toBe(false);
    expect(b.analysisCredit).toContain('Neba et al.');
  });
  it('the credit is a sentence on the FACE, not one word ("data") and a collapsed fold', () => {
    if (b?.kind !== 'figure') return;
    expect(b.faceProvenance).toContain('the federal survey');
    expect(b.faceProvenance).toContain('analysed by Neba et al.');
    expect(b.faceProvenance).toContain('the estimate is theirs');
    // the sentence carries the row's own year, so it cannot drift from the data
    expect(b.faceProvenance).toContain(b.year);
  });
  it('the card prints the face sentence instead of appending " data" to the agency', () => {
    expect(picker).toContain('faceProvenance');
    expect(picker).not.toContain("isGovernmentPublication ? '' : ' data'");
  });
  it('"a person spends" is gone: the excess is what was spent on their care by every payer', () => {
    if (b?.kind !== 'figure') return;
    expect(b.figureKindLabel).toContain('by every payer combined');
    expect(b.figureKindLabel).not.toContain('a person spends');
  });
  it('the payer split is read off the rows, and the out-of-pocket interval crosses zero', () => {
    if (b?.kind !== 'figure') return;
    expect(b.paidByInsurers?.point).toBe(3705);
    expect(b.outOfPocket?.point).toBe(236);
    expect(b.outOfPocket?.low).toBeLessThan(0);
    expect(b.outOfPocket?.significant).toBe(false);
  });
});

/* -------------------------------------------------------------------- F6 */
describe('sense F6 — "$11,305 − $7,162 = $4,143, not $4,098 … a health economist subtracts them on sight"', () => {
  it('/method names the raw pair as raw and gives the adjusted pair the excess comes from', () => {
    expect(method).toContain('Those are raw averages');
    expect(method).toContain('$11,641');
    expect(method).toContain('$7,543');
    expect(method).toContain('$4,098 a year, in a range from $1,619 to $6,578');
  });
  it('the causal claim the study does not make is gone', () => {
    expect(method).not.toContain('had nothing to do with long COVID');
    expect(method).toContain('care a comparable adult needed anyway');
  });
});

/* -------------------------------------------------------------------- F7 */
describe('sense F7 — "\'no row in any federal file\' … a reviewer knows a counter-example in one second"', () => {
  it('the claim is about the COST files, and says what the surveys can and cannot do', () => {
    for (const [name, src] of [['home', home], ['gap panel', gapPanel]] as const) {
      expect(src, name).toContain('cost</b> file');
      expect(src, name).not.toContain('produces no row in any federal file');
    }
    expect(gapPanel).toContain('access-to-care questions');
    expect(gapPanel).toContain('none of them is');
  });
  it('the uncounted-care tile no longer says a missed visit looks identical to being well', () => {
    expect(events).not.toContain('identical to being well');
    expect(events).toContain('no federal cost file attaches');
  });
});

/* -------------------------------------------------------------------- F8 */
describe('sense F8 — "\'the largest cost most people report\' has no source anywhere"', () => {
  it('the invented statistic is deleted and the sentence keeps its point', () => {
    expect(events).not.toContain('largest cost most people');
    expect(events).toContain('the only way they exist as a number is if the people who carried them say so');
  });
});

/* -------------------------------------------------------------- F9 + F10 */
describe('sense F9 — "the source composition disagrees between / and /register, and neither matches the file"', () => {
  it('there is one sentence, computed off the table both pages read', () => {
    expect(SOURCE_COMPOSITION.total).toBe(TABLE.length);
    expect(home).toContain('SOURCE_COMPOSITION.sentence');
    expect(register).toContain('SOURCE_COMPOSITION.sentence');
    expect(register).not.toContain("come from published research");
  });
  it('the GSA row is counted as federal, and the analysis rows are counted as analyses', () => {
    const gsa = SOURCE_COMPOSITION.byBody.find((b) => b.body === 'GSA');
    expect(gsa?.rows).toBeGreaterThan(0);
    expect(SOURCE_COMPOSITION.analysisRows).toBe(2);
    expect(SOURCE_COMPOSITION.sentence).toContain('peer-reviewed analysis of that survey');
    expect(SOURCE_COMPOSITION.sentence).not.toContain('published research');
  });
  it('the counts add up to the table, so the sentence cannot drift when a row is added', () => {
    const sum = SOURCE_COMPOSITION.byBody.reduce((a, b) => a + b.rows, 0);
    expect(sum).toBe(TABLE.length);
    expect(sourceComposition(TABLE.slice(0, 5)).total).toBe(5);
  });
  it('the footer narrows the blanket claim rather than repeating it', () => {
    expect(shell).toContain('analysis of a federal survey, it says so');
  });
});

/* ------------------------------------------------------------- F11 + F12 */
describe('sense F11 — "the year-ahead card is written for an economist, not a person"', () => {
  it('the label is plain words and the term is glossed under the meaning', () => {
    expect(picker).toContain('What a year costs on top');
    expect(picker).toContain('Economists call that the excess');
    expect(picker).not.toContain("word: 'Excess'");
  });
  it('the plain figure line leads and the point estimate follows it', () => {
    /* round 2 judge2-1: the /conditions form, "95% interval low to high". */
    expect(picker).toContain('95% interval');
    expect(picker).not.toContain('range is the answer');
    expect(picker).not.toContain('The interval is the answer, not the middle of it');
    expect(picker).toContain('more in a year');
  });
  it('the summary says apart from what and added to what', () => {
    expect(picker).toContain('costs on top of ordinary care');
    expect(picker).toContain('never added to the total above');
  });
});

describe('sense F12 — "the ratio is hard-coded prose beside a computed number"', () => {
  it('the mean-over-median ratio is computed from the row', () => {
    const b = benchmarkFor('heart-disease');
    if (b?.kind !== 'figure') return;
    expect(b.median).toBe(660);
    expect(Math.round(b.meanOverMedian as number)).toBe(7);
    expect(picker).toContain('Math.round(ratio)');
    expect(picker).not.toContain('The mean is more than seven times');
  });
  it('diabetes carries the median AHRQ publishes, so its skew is computed too (FLOW judge-2)', () => {
    /* stat568.pdf line 75: "had a median of $1,770 and a mean of $5,810". The old
       blank reason ("publishes no median for this row") was false. */
    const b = benchmarkFor('diabetes');
    if (b?.kind !== 'figure') throw new Error('expected a figure');
    expect(b.median).toBe(1770);
    expect(Math.round(b.meanOverMedian as number)).toBe(3);
    expect(b.medianBlankReason).toBeNull();
  });
  it('no condition wording field carries a hard-coded multiple any more', () => {
    const caveats = CONDITIONS.map((c) => c.definitionCaveat ?? '').join(' ');
    expect(caveats).not.toContain('seven times');
  });
});

/* ------------------------------------------------------------------- F13 */
describe('sense F13 — "\'no IP address, ever\' is true of the table and not of the system"', () => {
  it('the network hash is written out where a privacy officer looks', () => {
    expect(privacy).toContain('one-way hash of the network address');
    expect(privacy).toContain('salted with the date and a secret only the server holds');
    expect(privacy).toContain('stops being comparable the next day');
    expect(privacy).toContain('No name, no diagnosis and no IP address on the row, ever.');
  });
});

/* ------------------------------------------------------------------- F14 */
describe('sense F14 — the smaller things a careful reader trips on', () => {
  it('#4 a locality name is not lower-cased mid-sentence on /method', () => {
    expect(read('app/method/page.tsx')).not.toContain('{iowa.name.toLowerCase()}');
  });
  it('#5 /survey counts the optional questions it asks', () => {
    // FLOW contrib-20 (2026-09-30): one count everywhere. The eyebrow, the progress
    // line ("of 4 required") and the page description all say four required
    // questions; everything else is marked optional where it is asked.
    expect(survey).toContain('Four required questions, about two minutes; the rest are optional');
    expect(survey).toContain('of 4</b> required questions answered');
    expect(read('app/survey/page.tsx')).toContain('Four required questions, about two minutes.');
    expect(read('app/survey/page.tsx')).not.toContain('Five questions');
  });
  it('#6 the 11-response floor says whose rule it is and names the federal floor it matches', () => {
    expect(register).toContain('That threshold is ours');
    expect(register).toContain('cell-size suppression policy');
  });
  it('#7 the FAQ names all six sources, GSA and the analysis included', () => {
    expect(home).toContain('GSA mileage rate');
    expect(home).toContain('peer-reviewed analysis of MEPS');
  });
});

/* ------------------------------------------------------------- edge #6, #17 */
describe('edge #6 — "the year-ahead card says \'Pick a chip above\' and there is no chip above"', () => {
  it('the card renders the real control instead of pointing at one', () => {
    expect(picker).not.toContain('Pick a chip above');
    expect(picker).not.toContain('tap the chip above');
    expect(picker).toContain('export function ChipRow');
    expect((picker.match(/<ChipRow/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('edge #17 — "/gap posts a tableVersion three weeks stale, and \'the 1 person who have answered\'"', () => {
  it('the version comes from the price table constant, not from a different file', () => {
    expect(gapPanel).toContain('tableVersion: TABLE_VERSION');
    expect(gapPanel).not.toContain('tableVersion: VERSION');
  });
  it('one report reads as one report (round 4: counts are reports, never people)', () => {
    /* JUDGE-4 #6: the count is read from the reports field (respondents on /api/gap is senders) */
    expect(gapPanel).toContain("reportsOf(agg) === 1 ? 'report' : 'reports'} received");
    expect(gapPanel).not.toMatch(/'person' : 'people'/);
  });
});
