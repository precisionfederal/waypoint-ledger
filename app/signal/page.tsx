import type { Metadata } from 'next';
import Link from 'next/link';

/* /signal is the earlier name of the register, and until now both URLs rendered
   the same component — one destination under two names, which is how a person
   ends up unsure whether they have already seen a page. Shared links still have
   to work, so this is a redirect stub: the meta refresh moves a browser, the
   sentence moves a reader, and nothing here is a second copy of the register. */
export const metadata: Metadata = {
  title: 'The register moved',
  robots: { index: false, follow: true },
};

export default function SignalPage() {
  return (
    <>
      <meta httpEquiv="refresh" content="0;url=/register" />
      <div className="page narrow">
        <div className="wrap">
          <p className="eyebrow">Moved</p>
          <h1>The register moved</h1>
          <p className="sub">It is now at <Link href="/register">the register</Link>.</p>
        </div>
      </div>
    </>
  );
}
