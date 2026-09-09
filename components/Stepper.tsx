import Link from 'next/link';
const STEPS = [
  { n: 1, label: 'Describe', href: '/journey' },
  { n: 2, label: 'Your ledger', href: '/ledger' },
  { n: 3, label: 'Act on it', href: '/ledger#step3' },
];
export default function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {STEPS.map((s) => (
        <li key={s.n} className={s.n === current ? 'is-current' : s.n < current ? 'is-done' : ''} aria-current={s.n === current ? 'step' : undefined}>
          <Link href={s.href}><span className="st-n">{s.n}</span><span className="st-l">{s.label}</span></Link>
        </li>
      ))}
    </ol>
  );
}
