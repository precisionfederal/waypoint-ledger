'use client';
/* PrivateRange: what private plans negotiated for this line's code at the
   hospitals whose price-transparency files we read, drawn as one picture.

   Closed, the band has two rows:
   · the summary (the 44 px target) is the range in words plus a small bar
     on an axis that starts at $0. The bar runs from the lowest hospital rate to
     the highest, with a tick at the median and a marker at Medicare's figure for
     the same line.
   · one line names the Medicare marker ("not added") and the legal source,
     with its link outside the summary.
   Open, it shows the same bar larger with its axis labelled, then one row per
   hospital (name, its own span, read date), each with a small fold holding the
   file link and its sha256, then the rules and what was left out, as counts.

   🔴 Every dollar on it comes from data/private-rates-client.json (the hospitals'
   files) or from fit.ts (the Medicare figure the drawer shows). Nothing here is
   added to any total, and rates whose file does not say whether they are the
   doctor's or the hospital's fee are a count, never a dollar amount.
   (VIS-CRITIC-R2 new-3, 2026-09-30.) */
import { useEffect, useRef } from 'react';
import type { PriceItem } from '@/lib/types';
import { usd } from '@/lib/pricing';
import { scheduleFigureOf, type Ctx } from '@/lib/fit';
import {
  LEFT_OUT, PRIVATE_RATE_LABEL_LONG, PRIVATE_RATE_NOT_FEDERAL, PRIVATE_RATE_RULE_URL, GROUP_LABEL,
  otherRangesFor, privateRangeFor, sourceById, unstatedRatesFor, medicareMarkerApplies,
  type ShownRange,
} from '@/lib/private-rates';
import { faceRange } from '@/lib/private-rate-lines';
import { Icon } from './Icons';
import ps from './PrivateRange.module.css';

const money = (n: number) => usd(n, true);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Where a figure sits on an axis that runs from $0 to `max`, as a percentage. */
const at = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(2)}%`;

/** The picture: $0 at the left edge, the hospital range as a bar, the median as
 *  a tick, Medicare as a marker. Its words are in the aria-label. */
export function RangeBar({ r, medicare, large = false }: { r: ShownRange; medicare: number | null; large?: boolean }) {
  const s = r.spread;
  const max = Math.max(s.high, medicare ?? 0) * 1.04;
  const label = `${r.label}: hospital rates from ${money(s.low)} to ${money(s.high)}, median ${money(s.median)}, `
    + `on a scale that starts at $0.${medicare !== null ? ` Medicare's ${money(medicare)} is marked, not added.` : ''}`;
  return (
    <span className={`${ps.bar} ${large ? ps.barLarge : ''}`} role="img" aria-label={label} data-range-bar>
      <span className={ps.track} aria-hidden="true" />
      <span className={ps.span} aria-hidden="true" style={{ left: at(s.low, max), width: `calc(${at(s.high, max)} - ${at(s.low, max)})` }} />
      <span className={ps.median} aria-hidden="true" style={{ left: at(s.median, max) }} />
      {medicare !== null && <span className={ps.medicare} aria-hidden="true" style={{ left: at(medicare, max) }} data-medicare-usd={medicare} />}
      {large && (
        <span className={ps.axis} aria-hidden="true">
          <span style={{ left: '0%' }}>$0</span>
          <span className={ps.axisHi} style={{ left: at(s.high, max) }}>{money(s.high)}</span>
        </span>
      )}
    </span>
  );
}

function HospitalRows({ r }: { r: ShownRange }) {
  return (
    <ul className={ps.hospitals}>
      {r.spread.byHospital.map((h) => {
        const s = sourceById(h.source);
        if (!s) return null;
        return (
          <li key={h.source} className={ps.hRow}>
            <span className={ps.hName}>{s.displayName}</span>
            <span className={ps.hFig}>{h.low === h.high ? money(h.low) : <>{money(h.low)}&ndash;{money(h.high)}</>}</span>
            <span className={ps.hRead}>{plural(h.rates, 'rate')} · read {s.readAt.slice(0, 10)}</span>
            <details className={ps.hFile}>
              <summary>The file</summary>
              <p>
                {s.hospitalName}, last updated {s.lastUpdatedOn}.{' '}
                <a href={s.fileUrl} target="_blank" rel="noopener noreferrer">Open the hospital&rsquo;s file <Icon.External /></a>
                <br />sha256 <code className={ps.sha} title={s.sha256}>{s.sha256}</code>
              </p>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/* FINAL-1011 face: the range on the ledger row itself, under the Medicare figure,
   so a person sees what these hospitals posted without opening the line. Its low,
   high and count are the drawer's first range (faceRange reads them from
   data/private-rates-lines.json, so the row needs no rates file). A reference,
   never added to any total; nothing renders below MIN_HOSPITALS hospitals. Pressing
   it opens the line's drawer at this section, unfolded. */
/* judge3 #2: a whole-encounter Medicare figure (the ER visit, doctor and hospital
   together) sits beside rates that cover one half of the bill. The face says
   which half, so a lower range never reads as private plans paying less. */
export function faceScope(itemId: string, group: string): string {
  if (!itemId.endsWith('-complete')) return '';
  return group === 'facility' ? ', hospital’s fee only' : group === 'professional' ? ', doctor’s fee only' : '';
}
export function faceRangeText(item: { id: string }): string | null {
  const r = faceRange(item);
  return r ? `Hospitals’ posted negotiated rates${faceScope(item.id, r.group)}: ${money(r.low)}–${money(r.high)} (${plural(r.hospitals, 'hospital')})` : null;
}

/** After the line's drawer opens, unfold its hospital-rates section and bring it into view. */
export function revealPrivateRange(tries = 40) {
  if (typeof window === 'undefined') return;
  const band = document.querySelector<HTMLElement>('[role="dialog"] [data-private-range], [data-private-range]');
  const more = band?.querySelector<HTMLDetailsElement>('details');
  if (!band || !more) { if (tries > 0) requestAnimationFrame(() => revealPrivateRange(tries - 1)); return; }
  more.open = true;
  band.scrollIntoView({ block: 'start', behavior: 'auto' });
  more.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
}

export function PrivateRangeFace({ item, onOpen }: { item: { id: string; label: string }; onOpen: () => void }) {
  const r = faceRange(item);
  if (!r) return null;
  return (
    <button type="button" className={ps.face} data-private-face={item.id}
      aria-label={`Hospitals’ posted negotiated rates${faceScope(item.id, r.group)} for ${item.label}: ${money(r.low)} to ${money(r.high)} at ${plural(r.hospitals, 'hospital')}. A reference from hospital price transparency files, not added to any total. Opens the line’s hospital rates.`}
      onClick={() => { onOpen(); requestAnimationFrame(() => revealPrivateRange()); }}>
      <span className={ps.faceKind}>Hospitals’ posted negotiated rates{faceScope(item.id, r.group)}</span>
      <span className={ps.faceFig}><span className={ps.faceAmt}>{money(r.low)}&ndash;{money(r.high)}</span> ({plural(r.hospitals, 'hospital')})</span>
    </button>
  );
}

export default function PrivateRange({ item, ctx = {} }: { item: PriceItem | null; ctx?: Ctx }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const band = ref.current;
    if (!band) return;
    /* on paper every fold in the band is open; they close again after */
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = [...band.querySelectorAll<HTMLDetailsElement>('details:not([open])')];
      opened.forEach((d) => { d.open = true; });
    };
    const after = () => { opened.forEach((d) => { d.open = false; }); opened = []; };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, [item?.id]);
  if (!item) return null;
  const view = privateRangeFor(item);
  if (!view) return null;
  const others = otherRangesFor(item);
  const left = Object.entries(view.notInSpread).filter(([, n]) => n > 0);
  const unstated = unstatedRatesFor(item);
  const titleId = `private-range-${view.code}`;
  const first = view.shown[0];
  /* The marker is the Medicare figure the drawer shows for this line: the
     locality amount when one is chosen and published, else the national one. */
  const medicareUsd = scheduleFigureOf(item, ctx);
  const marker = medicareMarkerApplies(item, first.group) ? medicareUsd : null;
  return (
    <section ref={ref} className={ps.band} aria-labelledby={titleId} data-private-range={view.code}>
      <details className={ps.more}>
        <summary>
          <span className={ps.sumText} id={titleId}>
            Hospital rates{faceScope(item.id, first.group)}: {money(first.spread.low)}&ndash;{money(first.spread.high)}, {plural(first.spread.hospitals, 'hospital')}
          </span>
          <RangeBar r={first} medicare={marker} />
          <span className={ps.chev} aria-hidden="true" />
        </summary>
        {faceScope(item.id, first.group) && (
          <p className="micro" style={{ margin: ".4rem 0" }}>
            These posted rates cover {first.group === 'facility' ? 'the hospital’s fee' : 'the doctor’s fee'} only; Medicare&rsquo;s figure on this line is the whole encounter, so the two are not compared.
          </p>
        )}
        <div className={ps.fold}>
          <p className={ps.small}>{PRIVATE_RATE_LABEL_LONG}. {PRIVATE_RATE_NOT_FEDERAL}</p>
          {view.shown.map((r) => {
            const m = medicareMarkerApplies(item, r.group) ? medicareUsd : null;
            return (
              <div key={r.group} className={ps.group}>
                <p className={ps.kind}>{r.label}</p>
                <RangeBar r={r} medicare={m} large />
                <p className={ps.line}>
                  {money(r.spread.low)} to {money(r.spread.high)}, median {money(r.spread.median)},{' '}
                  {plural(r.spread.rates, 'rate')} at {plural(r.spread.hospitals, 'hospital')}
                  {m !== null && <> · Medicare {money(m)}, marked, not added</>}
                </p>
                <HospitalRows r={r} />
              </div>
            );
          })}
          {medicareUsd !== null && view.shown.every((r) => !medicareMarkerApplies(item, r.group)) && (
            <p className={ps.small}>Medicare&rsquo;s {money(medicareUsd)} on this line is the whole visit, the hospital&rsquo;s half and the doctor&rsquo;s together, so it is not marked on either range.</p>
          )}
          {others.map((r) => (
            <div key={r.group} className={ps.group}>
              <p className={ps.kind}>Also published: {r.label}</p>
              <RangeBar r={r} medicare={null} large />
              <p className={ps.line}>
                {money(r.spread.low)} to {money(r.spread.high)}, median {money(r.spread.median)},{' '}
                {plural(r.spread.rates, 'rate')} at {plural(r.spread.hospitals, 'hospital')}. A different fee from the one this line prices, so it is not set beside it.
              </p>
              <HospitalRows r={r} />
            </div>
          ))}
          <p className={ps.small}>
            Commercial plans only, by the hospital&rsquo;s own wording, outpatient, no modifier, fee-schedule or
            case-rate dollar amounts. One contract under many payer names counts once per hospital. The median is
            a printed rate (the lower middle one when the count is even), never an average. These hospitals are
            the files we read, not a sample of the country.
          </p>
          {(left.length > 0 || unstated > 0) && (
            <details className={ps.hFile}>
              <summary>Left out, as counts ({plural(view.rowsRead, 'line')} read for this code)</summary>
              <ul className={ps.left}>
                {left.map(([why, n]) => <li key={why}>{n.toLocaleString('en-US')} · {LEFT_OUT[why] ?? why}</li>)}
                {unstated > 0 && (
                  <li key="unstated" data-unstated>
                    {plural(unstated, 'rate')} whose file does not say whether {unstated === 1 ? 'it is' : 'they are'} the doctor&rsquo;s or the hospital&rsquo;s fee {unstated === 1 ? 'is' : 'are'} not shown
                  </li>
                )}
              </ul>
            </details>
          )}
          {view.heldBack.filter((h) => h.group !== 'not_stated').map((h) => (
            <p key={h.group} className={ps.small}>
              {GROUP_LABEL[h.group]}: only {plural(h.hospitals, 'hospital')} lists a rate, and one hospital is not a range, so none is shown.
            </p>
          ))}
          <p className={ps.small}>
            Every rate, with its payer, plan, file row and file hash:{' '}
            <a href={`/api/private-rates/${view.code}`}>/api/private-rates/{view.code}</a>
          </p>
        </div>
      </details>
      <p className={ps.legal}>
        {marker !== null && <><span className={ps.key} aria-hidden="true" />Medicare {money(marker)}, not added · </>}
        {marker !== null ? 'hospital' : 'From hospital'} price transparency files (<a href={PRIVATE_RATE_RULE_URL} target="_blank" rel="noopener noreferrer">45 CFR 180</a>)
      </p>
    </section>
  );
}
