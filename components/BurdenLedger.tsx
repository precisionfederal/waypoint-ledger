'use client';

/* ==========================================================================
   THE FOUR BURDENS, BESIDE THE MONEY — never inside it

   /survey asks people to rank five burdens and the ledger above prices one.
   This block prices two more from BLS rows already in the table, counts two
   that no federal file prices, and keeps all four apart: no card is added to
   the medical total, and no card is added to another. The arithmetic is on
   the face of every card, because a figure a person cannot check is a figure
   they have to take on trust.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { TABLE_VERSION } from '@/lib/table';
import {
  BURDENS_KEY, DISMISSED_CATEGORY, EMPTY_BURDENS, MAX,
  burdenCards, burdensEntered, careMethods, cents, loadBurdens, money, payBases, saveBurdens,
  type BurdenCard, type BurdenCounts, type CareMethodId, type PayBasisId,
} from '@/lib/burdens';
import { Icon } from './Icons';

const mono = { fontFamily: 'var(--font-m)', fontSize: '.86rem' } as const;
/** A phone target, not a cursor target. */
const TAP = { width: '2.75rem', height: '2.75rem' } as const;
/** .chip span ellipsises at 20rem; in a card this narrow the label wraps instead of truncating. */
const CHIP_TEXT = { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none' } as const;

export default function BurdenLedger() {
  const [c, setC] = useState<BurdenCounts>(EMPTY_BURDENS);
  const [ready, setReady] = useState(false);
  const [ownPayText, setOwnPayText] = useState('');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const sentCount = useRef<number | null>(null);

  useEffect(() => {
    const loaded = loadBurdens();
    setC(loaded);
    setOwnPayText(loaded.ownWeeklyPayUsd === null ? '' : String(loaded.ownWeeklyPayUsd));
    setReady(true);
  }, []);
  useEffect(() => { if (ready) saveBurdens(c); }, [c, ready]);

  const cards = useMemo(() => burdenCards(c), [c]);
  const entered = burdensEntered(c);

  function set<K extends keyof BurdenCounts>(k: K, v: BurdenCounts[K]) { setC((p) => ({ ...p, [k]: v })); }
  function bump(k: 'workdays' | 'careHours' | 'trips' | 'dismissed', delta: number, max: number) {
    setC((p) => ({ ...p, [k]: Math.max(0, Math.min(max, (p[k] || 0) + delta)) }));
    if (k === 'dismissed') { setSendState('idle'); setSendMsg(null); }
  }

  async function sendDismissed() {
    if (!c.dismissed) return;
    setSendState('sending'); setSendMsg(null);
    try {
      const r = await fetch('/api/gap', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ counts: { [DISMISSED_CATEGORY]: c.dismissed }, tableVersion: TABLE_VERSION }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d && d.ok) { sentCount.current = c.dismissed; setSendState('sent'); }
      else { setSendState('error'); setSendMsg(typeof d?.error === 'string' ? d.error : 'The count could not be recorded just now. Nothing was saved, and you can try again.'); }
    } catch {
      setSendState('error');
      setSendMsg('The count could not be sent — you may be offline. Nothing left this device.');
    }
  }

  return (
    <section className="burden-block" aria-labelledby="burdens-h" style={{ marginTop: 'var(--sp-6, 2.5rem)' }}>
      <p className="eyebrow">Beside the money, never inside it</p>
      <h2 id="burdens-h">The costs the claims files never see</h2>
      <p className="micro" style={{ maxWidth: '48rem', fontSize: '1rem' }}>
        Ranked by the people who carried them at <Link href="/survey">/survey</Link> — we price them apart and never weight them.
        The money is the ledger above. These are the other four: two have a published federal figure behind them, and two do not, so they stay blank.
      </p>

      <div className="acts" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(16rem,1fr))', marginTop: 'var(--sp-4, 1.5rem)' }}>
        {cards.map((card) => (
          <article key={card.kind} className="act-card" style={{ gap: '.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.6rem' }}>
              <h3 style={{ margin: 0 }}>{card.title}</h3>
              <span className={card.tag === 'DERIVED' ? 'basis b-wage' : 'basis'} style={{ marginLeft: 0, flex: '0 0 auto' }}>{card.tag}</span>
            </div>
            {/* .act-card p carries flex:1 in globals.css; the question must not stretch the card. */}
            <p className="micro" style={{ margin: 0, flex: '0 0 auto' }}>{card.question}</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
              <Counter card={card} onBump={bump} onSet={setC} />
              <span className="micro" style={{ margin: 0 }}>{card.unit}</span>
            </div>

            {card.kind === 'workdays' && <PayBasisPicker c={c} onPick={(id) => set('payBasis', id)} ownPayText={ownPayText} onOwnPay={(text) => {
              setOwnPayText(text);
              const n = parseFloat(text);
              set('ownWeeklyPayUsd', Number.isFinite(n) && n > 0 ? cents(n) : null);
            }} />}
            {card.kind === 'care-hours' && <CareMethodPicker value={c.careMethod} onPick={(id) => set('careMethod', id)} />}

            <Figure card={card} />

            {card.kind === 'dismissed' && (
              <div style={{ marginTop: '.2rem' }}>
                <button className="btn small primary" type="button" disabled={!c.dismissed || sendState === 'sending'} onClick={() => void sendDismissed()}>
                  {sendState === 'sending' ? 'Adding…' : 'Add it to the count'}
                </button>
                <p className="micro" role="status" aria-live="polite" style={{ margin: '.5rem 0 0' }}>
                  {sendState === 'sent' && sentCount.current !== null
                    ? <span className="sent-ok"><Icon.Check /> {sentCount.current} {sentCount.current === 1 ? 'time' : 'times'} added to the public count.</span>
                    : sendState === 'error' ? <span style={{ color: 'var(--flag-ink)' }}>{sendMsg}</span>
                      : 'Only the number goes. No name, no journey, no diagnosis, no IP address.'}
                </p>
                <p className="micro" style={{ margin: '.35rem 0 0' }}><Link href="/gap">Report the rest of what went uncounted</Link></p>
              </div>
            )}
          </article>
        ))}
      </div>

      <p className="micro" style={{ marginTop: 'var(--sp-3, 1rem)', maxWidth: '52rem' }}>
        {entered === 0
          ? 'Nothing here is filled in for you. Enter a count and the arithmetic appears with the federal row it came from.'
          : entered === 4 ? 'All four filled in. ' : `${entered} of the four filled in. `}
        These figures are never added to the itemized total above, and never added to each other: a missed workday and an hour of
        someone else&rsquo;s time are different quantities, and adding them would be the weighting we say we do not do.
        What you type here stays in this browser under <code style={mono}>{BURDENS_KEY}</code> and is never sent.
      </p>

      {/* The counts are the half of the burden a claims file never holds. They belong on the
          page a person actually hands to someone, so the sheet reads them from this device. */}
      {entered > 0 && (
        <div className="row" style={{ marginTop: 'var(--sp-3, 1rem)', display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
          <Link className="btn small primary" href="/sheet"><Icon.Sheet /> Put these on the appointment sheet</Link>
          <span className="micro" style={{ margin: 0 }}>
            {entered === 1 ? 'The count prints' : 'All ' + entered + ' counts print'} beside the money on the printed sheet, never inside it.
          </span>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- the parts */

function Counter({ card, onBump, onSet }: {
  card: BurdenCard;
  onBump: (k: 'workdays' | 'careHours' | 'trips' | 'dismissed', d: number, max: number) => void;
  onSet: (fn: (p: BurdenCounts) => BurdenCounts) => void;
}) {
  const key = ({ workdays: 'workdays', 'care-hours': 'careHours', trips: 'trips', dismissed: 'dismissed' } as const)[card.kind];
  const max = ({ workdays: MAX.workdays, careHours: MAX.careHours, trips: MAX.trips, dismissed: MAX.dismissed } as const)[key];
  const step = card.kind === 'care-hours' ? 5 : 1;
  const id = `burden-${card.kind}`;
  return (
    // 44px targets: a thumb on a phone, not a cursor on a desk.
    <div className="stepper-n" role="group" aria-label={card.question} style={{ minHeight: '2.75rem' }}>
      <button type="button" aria-label={`Fewer: ${card.title}`} style={TAP} onClick={() => onBump(key, -step, max)}><Icon.Minus /></button>
      <input
        id={id} type="number" min={0} max={max} inputMode="numeric" value={card.count}
        style={{ height: '2.75rem', width: '3.6rem' }}
        aria-label={card.question}
        onChange={(e) => {
          const n = Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0)));
          onSet((p) => ({ ...p, [key]: n }));
        }}
      />
      <button type="button" aria-label={`More: ${card.title}`} style={TAP} onClick={() => onBump(key, step, max)}><Icon.Plus /></button>
    </div>
  );
}

function Figure({ card }: { card: BurdenCard }) {
  const [open, setOpen] = useState(false);
  const has = card.valueUsd !== null;
  return (
    <div>
      {has ? (
        <>
          <p className="mid-num" style={{ margin: '.2rem 0 .1rem' }} aria-live="polite">{money(card.valueUsd as number)}</p>
          <p style={{ ...mono, margin: '0 0 .45rem', color: 'var(--ink-2)' }}>{card.arithmetic}</p>
        </>
      ) : (
        <p style={{ margin: '.2rem 0 .45rem' }}>
          <span className="blank">{card.count > 0 ? 'counted, not priced' : 'blank until you enter a count'}</span>
        </p>
      )}

      <p className="micro" style={{ margin: 0 }}>{card.noFigureReason ?? card.method}</p>

      <button className="link-btn" type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ marginTop: '.35rem' }}>
        {open ? 'Hide the source and the limits' : has ? 'Where this figure comes from' : 'Why this stays blank'}
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--line-2)', marginTop: '.5rem', paddingTop: '.5rem' }}>
          {card.source.title && (
            <p className="micro" style={{ margin: '0 0 .35rem' }}>
              {card.source.url
                ? <a href={card.source.url} target="_blank" rel="noopener noreferrer">{card.source.title} <Icon.External /></a>
                : card.source.title}
              {card.source.year ? ` · ${card.source.year}` : ''}
            </p>
          )}
          {card.source.describes && <p className="micro" style={{ margin: '0 0 .35rem' }}><strong>Who it describes:</strong> {card.source.describes}</p>}
          <p className="micro" style={{ margin: '0 0 .35rem' }}>{card.limit}</p>
          {card.alternatives.length > 0 && card.count > 0 && (
            <>
              <p className="lbl" style={{ margin: '.6rem 0 .3rem' }}>The same count, priced the other defensible ways</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '.4rem' }}>
                {card.alternatives.map((a) => (
                  <li key={a.id}>
                    <p style={{ ...mono, margin: 0, color: 'var(--ink-2)' }}>{a.arithmetic}</p>
                    <p className="micro" style={{ margin: 0 }}>{a.label} — {a.note}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PayBasisPicker({ c, onPick, ownPayText, onOwnPay }: {
  c: BurdenCounts; onPick: (id: PayBasisId) => void; ownPayText: string; onOwnPay: (text: string) => void;
}) {
  const opts = payBases(c.ownWeeklyPayUsd);
  return (
    <div>
      <p className="lbl" style={{ margin: '.2rem 0 .3rem' }}>Priced at</p>
      <div className="chips">
        {opts.map((o) => (
          <button key={o.id} type="button" className="chip" aria-pressed={c.payBasis === o.id}
            style={c.payBasis === o.id ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
            onClick={() => onPick(o.id)}>
            <span style={CHIP_TEXT}>{o.label}</span>
            <b>{o.weeklyUsd === null ? '—' : `${money(o.weeklyUsd, false)}/wk`}</b>
          </button>
        ))}
      </div>
      {c.payBasis === 'own' && (
        <div className="row" style={{ marginTop: '.4rem', alignItems: 'center', gap: '.4rem', display: 'flex' }}>
          <label htmlFor="own-weekly-pay" className="micro" style={{ margin: 0 }}>My weekly pay, before tax</label>
          <span className="cur">$</span>
          <input id="own-weekly-pay" type="number" min={0} step="0.01" inputMode="decimal" value={ownPayText}
            onChange={(e) => onOwnPay(e.target.value)} placeholder="0.00" style={{ maxWidth: '8rem' }} />
        </div>
      )}
    </div>
  );
}

function CareMethodPicker({ value, onPick }: { value: CareMethodId; onPick: (id: CareMethodId) => void }) {
  const opts = careMethods();
  return (
    <div>
      <p className="lbl" style={{ margin: '.2rem 0 .3rem' }}>Which kind of care was it</p>
      <div className="chips">
        {opts.map((o) => (
          <button key={o.id} type="button" className="chip" aria-pressed={value === o.id}
            style={value === o.id ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
            onClick={() => onPick(o.id)}>
            <span style={CHIP_TEXT}>{o.label}</span>
            <b>{o.hourlyUsd === null ? '—' : `${money(o.hourlyUsd)}/hr`}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
