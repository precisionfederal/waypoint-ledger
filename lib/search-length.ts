/* ==========================================================================
   judge panel #6 (2026-10-01): THE LENGTH OF THE SEARCH, BESIDE THE TOTAL.

   "7 years searching · 8 clinicians" is read only from what the person typed:
   the longest span the mapper counted as Time spent searching, and the
   clinicians the lines name or count. When she said neither, nothing is shown.
   No default, no estimate, no average: a blank is the honest answer.
   ========================================================================== */
import { AGE_NOW_SPAN, cliniciansSaid } from './mapper';
import { gapSummary, monthsPhrase } from './sheet';
import type { JourneyEntry } from './types';

/** Lines that say care did NOT happen: a clinician named there was not seen. */
const NOT_SEEN = new Set(['care-not-sought', 'care-denied']);

export interface SearchLength {
  months: number;
  /** At least this many clinicians, from her words; 0 when she named fewer than two. */
  clinicians: number;
  /** "2 clinicians named" or "8 clinicians, as counted": the number says where it came from. */
  cliniciansPhrase: string | null;
  /** "7 years searching · 8 clinicians, as counted", or null when nothing was said. */
  line: string | null;
}

export function searchLength(entries: readonly JourneyEntry[]): SearchLength {
  const months = gapSummary(entries).months;
  /* flow3-17: a span worked out from two ages, the onset and her age now, says
     where it came from: "7 years searching, from “got sick at 12 and im 19 now”",
     so the arithmetic can be checked against her own words. */
  const ageLine = months > 0 ? entries.find((e) => e.gapCategory === 'time-searching' && Math.floor(e.months ?? 0) === months && AGE_NOW_SPAN.test(e.raw)) : undefined;
  const named = new Set<string>();
  let counted = 0;
  for (const e of entries) {
    if (!e.raw || (e.gapCategory && NOT_SEEN.has(e.gapCategory))) continue;
    const c = cliniciansSaid(e.raw);
    c.named.forEach((n) => named.add(n));
    counted = Math.max(counted, c.counted);
    /* flow3-21: a visit line whose words name no clinician (a misspelling the
       rules missed and the reader priced, "then a new specialist") still saw
       one. A first visit (CPT 9920x) is by definition a clinician not seen
       before, so it counts once for its own line; a return visit (9921x) is
       the regular doctor, counted once however many lines say it. A line that
       names its clinician is counted by name above and never again here. */
    if (!c.named.length && e.item) {
      if (/^cms-9920[2-5]$/.test(e.item.id)) named.add(`first-visit:${e.key}`);
      else if (/^cms-9921[1-5]$/.test(e.item.id)) named.add('pcp');
    }
  }
  /* The larger of the two, never their sum: "4 specialists: a neurologist, a
     cardiologist…" names the same people twice. So the figure is a floor. */
  const n = Math.max(named.size, counted);
  const clinicians = n >= 2 ? n : 0;
  /* The words say which it is: the clinicians the lines name ("2 clinicians
     named", a floor, since a line can say "the ER" without naming who), or the
     number she gave ("8 clinicians, as counted"). The span is her own. */
  const cliniciansPhrase = !clinicians ? null
    : counted >= named.size ? `${clinicians} clinicians, as counted` : `${clinicians} clinicians named`;
  const parts = [
    ...(months > 0 ? [`${monthsPhrase(months)} searching${ageLine ? `, from “${ageLine.raw.trim()}”` : ''}`] : []),
    ...(cliniciansPhrase ? [cliniciansPhrase] : []),
  ];
  return { months, clinicians, cliniciansPhrase, line: parts.length ? parts.join(' · ') : null };
}

/** flow3-17: the line cut around its ", from “…”" part, so a page can set her
 *  words in a lighter type than the figure. [before, from, after]. */
export function splitFrom(line: string): [string, string, string] {
  const m = line.match(/, from “[^”]*”/);
  if (!m || m.index === undefined) return [line, '', ''];
  return [line.slice(0, m.index), m[0], line.slice(m.index + m[0].length)];
}
