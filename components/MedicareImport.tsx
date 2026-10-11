'use client';
/* The Medicare import's gate on /ledger.

   It asks GET /api/bluebutton/status once. Unless the site is configured with
   sandbox credentials it renders nothing, and the import's own code (the panel,
   the claim mapper) is never downloaded: it lives in its own chunk and loads only
   when there is something to show. So a site without credentials pays nothing
   for it, on the page or in the ledger's first load (tests/quality-budgets). */
import { lazy, Suspense, useEffect, useState } from 'react';
import type { BbStatus } from './ImportClaims';

const ImportClaims = lazy(() => import('./ImportClaims'));

export default function MedicareImport() {
  const [status, setStatus] = useState<BbStatus | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/bluebutton/status', { headers: { accept: 'application/json' } })
      .then((r) => r.json())
      .then((j: BbStatus) => { if (live && j && j.configured === true) setStatus(j); })
      .catch(() => { /* not reachable: stay off */ });
    return () => { live = false; };
  }, []);

  if (!status?.configured) return null;
  return (
    <Suspense fallback={null}>
      <ImportClaims initialStatus={status} />
    </Suspense>
  );
}
