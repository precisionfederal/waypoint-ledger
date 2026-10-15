'use client';

/* The trips card's own-numbers half (components/BurdenLedger.tsx): two boxes
   for the person's miles and hours per trip, and the lines of arithmetic on
   them. Each line stands alone and none is added to anything. */

import { MAX, money, type BurdenOwnLine } from '@/lib/burdens';

const mono = { fontFamily: 'var(--font-m)', fontSize: '.86rem' } as const;

/** Arithmetic on her own numbers: each line on its own, never a sum. */
export function OwnLines({ lines }: { lines: BurdenOwnLine[] }) {
  return (
    <ul aria-live="polite" style={{ listStyle: 'none', padding: 0, margin: '.2rem 0 .45rem', display: 'grid', gap: '.5rem' }}>
      {lines.map((l) => (
        <li key={l.id}>
          <p className="lbl" style={{ margin: 0 }}>{l.label}</p>
          <p style={{ margin: '.1rem 0 0', fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: '1.25rem' }}>{money(l.valueUsd)}</p>
          <p style={{ ...mono, margin: 0, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>{l.arithmetic}</p>
        </li>
      ))}
    </ul>
  );
}

export default function TripInputs({ milesText, hoursText, onMiles, onHours }: {
  milesText: string; hoursText: string; onMiles: (text: string) => void; onHours: (text: string) => void;
}) {
  const box = { height: '2.75rem', maxWidth: '7rem' } as const;
  return (
    <fieldset style={{ border: 0, padding: 0, margin: '.2rem 0 0', display: 'grid', gap: '.45rem' }}>
      <legend className="lbl" style={{ padding: 0, margin: '0 0 .3rem' }}>Add your own numbers (optional)</legend>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <label htmlFor="trip-miles" className="micro" style={{ margin: 0, flex: '1 1 9rem' }}>Round-trip miles, per trip</label>
        <input id="trip-miles" type="number" min={0} max={MAX.milesPerTrip} step="0.1" inputMode="decimal" value={milesText}
          onChange={(e) => onMiles(e.target.value)} placeholder="miles" style={box} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <label htmlFor="trip-hours" className="micro" style={{ margin: 0, flex: '1 1 9rem' }}>Hours per trip, travel and waiting</label>
        <input id="trip-hours" type="number" min={0} max={MAX.hoursPerTrip} step="0.1" inputMode="decimal" value={hoursText}
          onChange={(e) => onHours(e.target.value)} placeholder="hours" style={box} />
      </div>
      <p className="micro" style={{ margin: 0 }}>Yours, not a federal figure. They stay in this browser and are never sent anywhere.</p>
    </fieldset>
  );
}

