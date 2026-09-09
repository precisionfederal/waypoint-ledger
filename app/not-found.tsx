import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'That page is not here' };

export default function NotFound() {
  return (
    <section className="page narrow">
      <div className="wrap prose">
        <p className="eyebrow">404</p>
        <h1>That page is not here</h1>
        <p className="lede">
          The link may be old, or we may have moved something. Nothing you have entered is affected — your ledger is
          kept in this browser, not on this page.
        </p>
        <div className="row" style={{ marginTop: '1.5rem' }}>
          <Link className="btn primary" href="/journey">Start a journey</Link>
          <Link className="btn ghost" href="/register">The public register</Link>
        </div>
        <h2>Or go straight to</h2>
        <ul>
          <li><Link href="/ledger">Your ledger</Link> — what you have entered so far, priced from published federal figures</li>
          <li><Link href="/method">How a number is made</Link> — the file, the row and the arithmetic behind every figure</li>
          <li><Link href="/integrity">How the count is kept honest</Link> — the register&rsquo;s hash chain and how to check it</li>
          <li><Link href="/privacy">Privacy</Link> — what this tool keeps and what it never sees</li>
        </ul>
        <p className="micro">
          If a link on this site brought you here, please tell us at <a href="mailto:bo@precisionfederal.com">bo@precisionfederal.com</a> so we can fix it.
        </p>
      </div>
    </section>
  );
}
