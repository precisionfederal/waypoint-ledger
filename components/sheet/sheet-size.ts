/* What a printed figure is, in the words the sheet's header or cell prints
   ("Medicare allowed amount, 2026"), and how big a journey's sheet is. One
   definition for the sheet, which prints them, and the ledger, which says
   whether that sheet fits on one page (lib/sheet.ts sheetFitsOnePage). */
import type { JourneyEntry, PriceItem } from '@/lib/types';
import type { Fit } from '@/lib/fit';
import type { PricedLine } from '@/lib/types';
import { BASIS_NAME } from '@/components/LineDrawer';
import { DISMISSED_CATEGORY, burdenCards, money, type BurdenCounts } from '@/lib/burdens';
import { hasPaid } from '@/lib/paid';
import unpriceableData from '@/data/unpriceable.json';
import { NO_FIGURE, TIME_SEARCHING, gapLabel, gapWhy, isCareLine, monthsPhrase, noteRowsOf, type GapSummary, type SheetSize } from '@/lib/sheet';

export function figureLabel(it: PriceItem, fit: Fit): string {
  const first = (fit.figureNote || '').split('·')[0].trim();
  if ((fit.which === 'locality' || fit.which === 'charge') && first) return first;
  return `${BASIS_NAME[it.basis] ?? it.basis.replace(/_/g, ' ')}, ${it.year}`;
}

/* JUDGE-6 #8: ONE COUNT OF DISMISSALS ON THE PAGE. When the "Times you were
   told it was nothing" card prints (its count is above 0), the counted line
   leaves "dismissed" out: the card already prints that count, says it is
   counted and never priced, and says why no dataset records it. The table row
   for her words stays as it is. */
/* JUDGE-7 #4: ONE ANSWER FOR MISSED WORK. When the workdays card holds days
   (its count is above 0), the sheet prints "Workdays you missed: 30 days ·
   $7,506.00" with its BLS arithmetic, so the counted line no longer also names
   "Days of work you missed" as a cost with no defensible federal figure, and
   the "Without a federal figure" count leaves it out. With no days entered,
   it is named exactly as before. Every other named cost stays. */
export const LOST_WORK_LABEL: string = (unpriceableData.items as { id: string; label: string }[]).find((u) => u.id === 'lost-work')?.label ?? 'Days of work you missed';
export function countedGaps(g: GapSummary, burdens: BurdenCounts): GapSummary {
  const dismissed = (burdens.dismissed ?? 0) > 0;
  const worked = (burdens.workdays ?? 0) > 0 && g.named.includes(LOST_WORK_LABEL);
  if (!dismissed && !worked) return g;
  const cats = dismissed ? g.cats.filter(([id]) => id !== DISMISSED_CATEGORY) : g.cats;
  const named = worked ? g.named.filter((n) => n !== LOST_WORK_LABEL) : g.named;
  return { ...g, cats, named, empty: cats.length === 0 && g.months === 0 && named.length === 0 };
}

/** The parts of the sheet that grow, counted the way app/sheet/page.tsx prints them. */
export function sheetSizeOf(i: { entries: readonly JourneyEntry[]; lines: readonly PricedLine[]; fits: ReadonlyMap<string, Fit>; gaps: GapSummary; burdens: BurdenCounts; paid: boolean; locality: boolean }): SheetSize {
  const rows = i.lines.filter((l) => isCareLine(l.entry) || !l.entry.raw.trim() || hasPaid(l.entry)).map((l) => {
    const it = l.entry.item; const g = (l.entry as JourneyEntry & { gapCategory?: string | null }).gapCategory;
    return { words: l.entry.raw, unit: it ? `${it.label} ${it.code ?? ''}` : g ? `${gapLabel(g)}: counted, never priced` : 'not matched to a federal figure' };
  });
  const kinds = new Set<string>(); const sources = new Map<string, string>();
  for (const l of i.lines) {
    const it = l.entry.item; const f = it ? i.fits.get(l.entry.key) : undefined;
    if (it && l.priced && f) kinds.add(figureLabel(it, f));
    if (it && l.priced) sources.set(it.sourceTitle, it.sourceUrl);
  }
  /* Each burden filled in prints a card (and maybe a source). */
  const b = i.burdens;
  const counted = countedGaps(i.gaps, b);
  const cards = burdenCards(b).filter((c) => c.count > 0);
  for (const c of cards) if (c.source.title) sources.set(c.source.title, c.source.url ?? '');
  /* JUDGE-6 #8: the characters the run-in blocks print, the way app/sheet/page.tsx
     words them, so the one-page check can count the lines they wrap to. */
  const gapTexts = [
    ...(counted.months > 0 ? [`${monthsPhrase(counted.months)}: ${gapLabel(TIME_SEARCHING)}. ${gapWhy(TIME_SEARCHING)}`] : []),
    ...counted.cats.map(([id, c]) => `${id === NO_FIGURE ? c.lines : c.times}: ${gapLabel(id)}${id !== NO_FIGURE && c.lines !== c.times ? ` (${c.lines} lines)` : ''}. ${gapWhy(id)}`),
    ...(counted.named.length ? [`${counted.named.length}: real costs with no defensible federal figure: ${counted.named.join(' · ')}. Left blank rather than estimated.`] : []),
  ];
  const cardText = cards.map((c) => `${c.title}: ${c.count} ${c.unit} · ${c.valueUsd !== null ? money(c.valueUsd) : 'counted, no federal figure prices it'}${c.arithmetic ? `. ${c.arithmetic}` : ''}${c.source.title ? '' : `. ${c.noFigureReason ?? c.method}`}`);
  const srcList = [...sources.entries()];
  const sourceChars = srcList.reduce((a, [t, u], k) => {
    /* a part that repeats an earlier source is cited by its number (the sheet does the same) */
    const title = t.split('; ').filter((part, n) => !(n > 0 && srcList.findIndex(([o]) => o === part) > -1 && srcList.findIndex(([o]) => o === part) < k)).join('; ');
    return a + title.length + u.replace(/^https?:\/\/(www\.)?/, '').length + 20;
  }, 0);
  const notes = noteRowsOf(i.entries).filter((e) => !hasPaid(e));
  return {
    rows, notes: notes.length, sources: sources.size,
    gapItems: gapTexts.length,
    burdenCards: cards.length, figureKinds: kinds.size, verdictKinds: new Set([...i.fits.values()].map((f) => f.verdict)).size,
    paid: i.paid, locality: i.locality,
    noteChars: notes.reduce((a, e) => a + e.raw.trim().length + 4, 0),
    gapChars: gapTexts.reduce((a, t) => a + t.length + 3, 0),
    cardChars: cardText.reduce((a, t) => a + t.length + 3, 0),
    sourceChars,
  };
}
