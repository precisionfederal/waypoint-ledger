'use client';
/* Nothing on stage can go white: a render error shows the page's own words and a way back, never a blank. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="wrap" style={{ padding: '4rem 0' }}>
      <p className="eyebrow">Something went wrong on this page</p>
      <h1>Your ledger is safe. This page could not draw.</h1>
      <p>What you typed stays in this browser. Nothing was sent. Try again, or open your ledger.</p>
      <p style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
        <button className="btn primary" type="button" onClick={() => reset()}>Try again</button>
        <a className="btn ghost" href="/ledger">Open my ledger</a>
        <a className="btn ghost" href="/">Home</a>
      </p>
      {error?.digest ? <p className="micro">Reference {error.digest}</p> : null}
    </main>
  );
}
