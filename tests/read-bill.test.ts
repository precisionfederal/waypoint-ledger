/* "Read my bill" (FINAL-1014 upload lane): codes and dates read from a bill's
   text, a PDF's text layer read with no library, the scan message, and the add
   path through the store's own addItem. Every name and number below is made up. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  extractCodes, readBill, linesToAdd, addBillLines, defaultPicks, ignoredSentence, timesOf, billRaw,
  SAMPLE_BILL, READ_BILL_PROMISE,
} from '../lib/read-bill';
import { readPdfText, textOfContent, parseCMap } from '../lib/read-pdf';
import { ReadBillView, messageFor, datesLine } from '../components/ReadBill';
import ReadBillMount from '../components/ReadBillMount';
import { TABLE } from '../lib/table';
import type { PriceItem } from '../lib/types';
import { textPdf, cidPdf, scanPdf, lockedPdf } from './fixtures/bill-pdf';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const codes = (t: string) => extractCodes(t).found.map((f) => f.code);

/* An insurer's EOB as it pastes out of a portal: addresses, phone, IDs, NPI, dollars, diagnosis codes. */
const EOB = `Explanation of Benefits    THIS IS NOT A BILL
Sample Health Plan   PO Box 4410   Des Moines, IA 50306-4410   Customer service (800) 555-0199
Member: Sample Person   Member ID: QHZ482910337   Group number: 77210   Account 55102
Patient account number: 88231
Claim number: 26041-88213   Received 04/28/2026   Provider: Sample Neurology Clinic   NPI: 1457389210
Billing address: 410 Main St, Ames, IA 50010
Service dates          Procedure  Description                         Billed     Allowed   Plan paid   You owe
04/02/2026-04/02/2026  99204      Office/outpatient visit new          $310.00    $171.43   $137.14     $34.29
04/02/2026             95886-26   Needle EMG each extremity            $1,240.00  $112.10   $89.68      $22.42
04/02/2026             95910      Nerve conduction studies 7-8         880.00     196.31    157.05      39.26
04/09/2026             70553      MRI brain w/o & w/ contrast          $3,450.00  $412.33   $329.86     $82.47
04/09/2026             A9577      Gadobenate dimeglumine injection     $210.00    $14.20    $11.36      $2.84
Diagnosis codes: G62.9, R20.2, M79.2
Totals                                                                  $6,090.00  $906.37   $725.09     $181.28
Questions? Call 1-800-555-0199. Plan ID H4513-021. Check 004871233 issued 05/02/2026.
`;

/* A Medicare Summary Notice, Part B: the date sits in the claim header, the code in brackets on the next lines. */
const MSN = `Your Medicare Summary Notice for Part B (Medical Insurance)
Medicare Number XXXXXXX1234   Notice date June 1, 2026
Dates of Service: May 5, 2026
Claim Number: 12-26125-503-110
Sample Heart Associates, 22 Elm Ave, Iowa City, IA 52242
Service Provided & Billing Code      Amount Provider Charged   Medicare-Approved Amount   Medicare Paid Provider   Maximum You May Be Billed
Echocardiogram, complete (93306)     $1,100.00                 $206.23                    $161.71                  $41.25
Electrocardiogram, complete (93000)  $95.00                    $16.18                     $12.69                   $3.24
Total for this claim                 $1,195.00
`;

describe('extractCodes: an EOB a person pastes', () => {
  const r = extractCodes(EOB);
  it('finds every CPT and HCPCS code on the service lines, with its date', () => {
    expect(r.found.map((f) => [f.code, f.date])).toEqual([
      ['99204', '2026-04-02'], ['95886', '2026-04-02'], ['95910', '2026-04-02'], ['70553', '2026-04-09'], ['A9577', '2026-04-09'],
    ]);
    expect(r.found[1].modifier).toBe('26');
    expect(r.found[3].description).toMatch(/MRI brain/);
  });
  it('reads no ZIP, phone, member, group, account, claim, NPI, plan or check number as a code', () => {
    for (const n of ['50306', '50010', '77210', '55102', '88231', '26041', '88213', '14573', 'H4513', '00487']) expect(codes(EOB)).not.toContain(n);
    expect(r.ignored.zip).toBeGreaterThanOrEqual(2);
    expect(r.ignored.phone).toBeGreaterThanOrEqual(2);
    expect(r.ignored.id).toBeGreaterThanOrEqual(6);
  });
  it('never reads a dollar amount; it counts them to say so', () => {
    expect(r.ignored.money).toBe(24);
    expect(r.found.every((f) => !/\$|\./.test(f.code))).toBe(true);
    expect(ignoredSentence(r.ignored)).toMatch(/^Left alone: 24 dollar amounts, \d+ ID or account numbers, \d+ ZIP codes, \d+ phone numbers and 3 diagnosis codes\.$/);
  });
  it('leaves diagnosis codes alone', () => {
    expect(r.ignored.diagnosis).toBe(3);
    expect(codes(EOB)).not.toContain('G6290');
  });
});

describe('extractCodes: a Medicare Summary Notice', () => {
  it('reads codes in brackets and carries the claim header date down to them', () => {
    expect(extractCodes(MSN).found.map((f) => [f.code, f.date])).toEqual([['93306', '2026-05-05'], ['93000', '2026-05-05']]);
  });
});

describe('extractCodes: precision over recall', () => {
  it('a ZIP after a state is never a code, even when it is a code we carry', () => {
    expect(codes('Sample Clinic, Spokane Valley, WA 99213')).toEqual([]);
  });
  it('a labelled number is never a code', () => {
    expect(codes('Account 70553\nMember ID 85025\nClaim # 99213\nNPI 80053')).toEqual([]);
  });
  it('a bare five-digit number we do not carry needs a service-line context', () => {
    expect(codes('Thank you for 12345 reasons')).toEqual([]);
    expect(codes('03/14/2026 36416 Capillary blood draw')).toEqual(['36416']);
  });
  it('a dollar amount with five digits before the point is money', () => {
    expect(codes('Total billed 70553.00 and $99213')).toEqual([]);
  });
  it('a code we carry is read even without a date', () => {
    expect(codes('Office visit 99213')).toEqual(['99213']);
  });
  it('lower-case letters and invalid HCPCS letters are not codes', () => {
    expect(codes('03/14/2026 j1100 and D0120 and Z1234')).toEqual([]);
  });
});

describe('matching to the published table', () => {
  const m = readBill(SAMPLE_BILL);
  it('the sample bill: matched codes, the ER waits for a choice, the drug code is not carried', () => {
    expect(m.matched.map((g) => g.code).sort()).toEqual(['36415', '70553', '80053', '85025', '93000', '99204', '99213']);
    expect(m.choose.map((g) => g.code)).toEqual(['99284']);
    expect(m.choose[0].rows.map((r) => r.id).sort()).toEqual(['cms-ed-99284-complete', 'cms-ed-99284-facility-only', 'cms-ed-99284-physician-only']);
    expect(m.notCarried.map((g) => g.code)).toEqual(['J1100']);
  });
  it('the sample carries no dollar amount (every price on the site comes from a federal row)', () => {
    expect(SAMPLE_BILL.replace(/^Diagnosis:.*$/m, '')).not.toMatch(/\$\s?\d|\d\.\d{2}\b/);
    expect(SAMPLE_BILL.split('\n')[0]).toMatch(/^SAMPLE ONLY\. A made-up/);
  });
  it('a code seen on two dates is priced twice', () => {
    const g = m.matched.find((x) => x.code === '99213')!;
    expect(g.dates).toEqual(['2026-06-02', '2026-07-15']);
    expect(timesOf(g)).toBe(2);
    expect(datesLine(g)).toBe('2 dates of service: Jun 2, 2026, Jul 15, 2026');
  });
});

describe('the add path: ticked lines go through the store addItem', () => {
  const m = readBill(SAMPLE_BILL);
  const groups = [...m.matched, ...m.choose];

  it('adds every ticked line once, with words that name the code and not the date', () => {
    const picks = defaultPicks(m);
    delete picks['36415'];                      // the person unticks the blood draw
    const calls: [PriceItem, string | undefined][] = [];
    const pending = addBillLines(linesToAdd(groups, picks), (it, raw) => calls.push([it, raw]));
    expect(calls.map(([it]) => it.id).sort()).toEqual(
      ['70553', '80053', '85025', '93000', '99204', '99213'].map((c) => TABLE.find((t) => t.code?.includes(c) && !t.id.includes('ed-'))!.id).sort(),
    );
    for (const [it, raw] of calls) {
      expect(raw).toBe(billRaw(it, raw!.match(/code (\w+)/)![1]));
      expect(raw).not.toMatch(/2026|\//);
    }
    expect([...pending.values()]).toEqual([2]);  // 99213, on two dates
  });

  it('the ER is not added until the person chooses which bill it is, then adds the row they chose', () => {
    const none = linesToAdd(groups, defaultPicks(m));
    expect(none.some((l) => l.code === '99284')).toBe(false);
    const chose = linesToAdd(groups, { ...defaultPicks(m), '99284': 'cms-ed-99284-facility-only' });
    expect(chose.find((l) => l.code === '99284')!.item.id).toBe('cms-ed-99284-facility-only');
  });

  it('refuses a pick that names a row not carrying that code', () => {
    expect(linesToAdd(groups, { '99213': 'cms-ed-99284-complete' })).toEqual([]);
  });

  it('the panel calls the store addItem, never a network call', () => {
    const src = ['components/ReadBill.tsx', 'components/ReadBillMount.tsx', 'lib/read-bill.ts', 'lib/read-pdf.ts']
      .map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
    expect(src).toMatch(/addBillLines\(lines, st\.addItem\)/);
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|outboxPost|localStorage/);
  });
});

describe('readPdfText: the text layer, read with no library', () => {
  it('inflates a FlateDecode content stream and keeps table rows on one line', async () => {
    const pdf = textPdf([
      [[72, 'Member ID: QHZ482910337'], [320, 'Ames, IA 50010']],
      [[72, 'Date of service'], [170, 'Code'], [230, 'Description'], [450, 'Billed']],
      [[72, '04/02/2026'], [170, '99204'], [230, 'New patient visit (level 4)'], [450, '$310.00']],
      [[72, '04/09/2026'], [170, '70553'], [230, 'MRI brain'], [450, '$3,450.00']],
    ]);
    const out = await readPdfText(pdf);
    expect(out.kind).toBe('text');
    if (out.kind !== 'text') return;
    expect(out.pages).toBe(1);
    expect(out.text.split('\n')).toContain('04/02/2026 99204 New patient visit (level 4) $310.00');
    const m = readBill(out.text);
    expect(m.matched.map((g) => [g.code, g.dates[0]])).toEqual([['99204', '2026-04-02'], ['70553', '2026-04-09']]);
    expect(m.ignored.money).toBe(2);
  });

  it('decodes a numbered-glyph font through its ToUnicode map', async () => {
    const out = await readPdfText(cidPdf(['Dates of Service: 05/10/2026', 'Emergency room visit 99284', 'Heart tracing 93000-26']));
    expect(out).toMatchObject({ kind: 'text' });
    if (out.kind !== 'text') return;
    expect(out.text).toBe('Dates of Service: 05/10/2026\nEmergency room visit 99284\nHeart tracing 93000-26');
    const m = readBill(out.text);
    expect(m.matched.map((g) => g.code)).toEqual(['93000']);
    expect(m.choose.map((g) => g.code)).toEqual(['99284']);
  });

  it('a scan has no text layer and is reported as a scan, with the ask to paste', async () => {
    expect(await readPdfText(scanPdf())).toEqual({ kind: 'scan', pages: 1 });
    expect(messageFor('scan')).toMatch(/picture of the page \(a scan\).*paste them in the box/);
  });

  it('a password-protected PDF and a file that is not a PDF are said plainly', async () => {
    expect(await readPdfText(lockedPdf())).toEqual({ kind: 'locked' });
    expect(await readPdfText(new TextEncoder().encode('just some text'))).toEqual({ kind: 'not-pdf' });
    expect(messageFor('locked')).toMatch(/password-protected/);
  });

  it('content operators: TJ kerning is a space, a new baseline is a new line, glyphs drawn one by one stay one word', () => {
    expect(textOfContent('BT /F1 10 Tf 72 700 Td [(Office)-300(visit)] TJ 0 -14 Td (99213) Tj ET')).toBe('Office visit\n99213');
    expect(textOfContent('BT /F1 10 Tf 72 700 Td (9) Tj 5 0 Td (9) Tj 5 0 Td (2) Tj 5 0 Td (1) Tj 5 0 Td (3) Tj ET')).toBe('99213');
    expect(textOfContent("BT /F1 10 Tf 12 TL 72 700 Td (a\\(b\\)) Tj T* (\\061\\062) Tj ET")).toBe('a(b)\n12');
    expect(parseCMap('1 beginbfrange <0010> <0012> <0041> endbfrange').map.get(0x11)).toBe('B');
  });
});

describe('the panel, as markup', () => {
  const noop = () => {};
  const m = readBill(SAMPLE_BILL);
  const html = renderToStaticMarkup(createElement(ReadBillView, {
    text: SAMPLE_BILL, state: { kind: 'read', match: m, from: 'on the sample bill' }, picks: defaultPicks(m), added: null,
    onText: noop, onRead: noop, onSample: noop, onFile: noop, onPick: noop, onAdd: noop,
  }));

  it('says the privacy promise on its face, word for word', () => {
    expect(READ_BILL_PROMISE).toBe('Read in your browser. Your bill never leaves this device.');
    expect(html).toContain(READ_BILL_PROMISE);
    expect(renderToStaticMarkup(createElement(ReadBillMount))).toContain(READ_BILL_PROMISE);
  });

  it('shows the checklist with our plain description, the bill date and the add count', () => {
    expect(html).toContain('Found 9 service codes on the sample bill. 8 are in Medicare&#x27;s published table.');
    expect(html).toContain('Doctor&#x27;s office visit, established patient, low complexity');
    expect(html).toContain('2 dates of service: Jun 2, 2026, Jul 15, 2026');
    expect(html).toContain('Emergency room visit: which bill is this?');
    expect(html).toContain('Not in our table yet, so left off and not estimated:');
    expect(html).toContain('Add 7 lines to my ledger');
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(8);
    expect(html).toContain('We price each line from Medicare&#x27;s published table, never from the amounts on your bill.');
  });

  it('every input has a label and no copy uses an em-dash', () => {
    expect(html).toContain('for="bill-text"');
    expect(html).toContain('for="bill-file"');
    expect(html).not.toContain('—');
  });
});
