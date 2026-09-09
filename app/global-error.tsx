'use client';
/* The last net: if the root layout itself fails, this renders its own html so the screen is never blank. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: '40rem', margin: '0 auto', color: '#13202b', background: '#fbfaf7' }}>
        <h1 style={{ fontSize: '1.5rem' }}>Waypoint Ledger could not draw this page.</h1>
        <p>What you typed stays in this browser. Nothing was sent.</p>
        <p><button type="button" onClick={() => reset()} style={{ padding: '.6rem 1rem' }}>Try again</button> <a href="/" style={{ marginLeft: '1rem' }}>Home</a></p>
        {error?.digest ? <p style={{ fontSize: '.8rem', opacity: .7 }}>Reference {error.digest}</p> : null}
      </body>
    </html>
  );
}
