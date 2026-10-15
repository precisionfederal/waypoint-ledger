'use client';
/* The Medicare import's mount on /ledger. Two things live here.

   1. The live import. It asks GET /api/bluebutton/status once. Unless the site
      is configured with sandbox credentials it renders nothing, and the import's
      own code (the panel, the claim mapper) is never downloaded: it lives in its
      own chunk and loads only when there is something to show.

   2. The CMS example: one line and one button, on every visit, so anyone can
      watch the import work on the synthetic beneficiary CMS publishes with the
      API. Pressing it (or arriving with ?try=cms-synthetic, the /adopt link)
      loads the same chunk and maps the example with the live import's own code.
      Nothing is fetched from CMS, stored, or added to the ledger.

   So a visitor who never presses the button pays one sentence for it, on the
   page and in the ledger's first load (tests/quality-budgets).

   judge panel 15 Oct #2.3: at 390 px the open card put the total 1,085 px down
   the example ledger. Once the ledger has lines, the card folds to one closed
   "On Medicare? Bring in your record", and the CMS example's button stays
   outside the fold (the filing's access step names it). An empty ledger, and a
   person CMS has just sent back connected, keep the open card. */
import { lazy, Suspense, useEffect, useState } from 'react';
import type { BbStatus } from './ImportClaims';
import { useStoreMaybe } from '@/lib/store';

const ImportClaims = lazy(() => import('./ImportClaims'));
const SyntheticImport = lazy(() => import('./ImportClaims').then((m) => ({ default: m.SyntheticImport })));

/** The /adopt link and any shared link open the example with this. */
export const TRY_PARAM = 'try';
export const TRY_VALUE = 'cms-synthetic';
/** Must equal SYNTHETIC_TRY in lib/bluebutton.ts (tests/bluebutton.test.ts); written
 *  out here so the ledger's first load does not carry that module. */
const TRY_LABEL = 'Try it with a CMS synthetic Medicare beneficiary';
export const FOLD_SUMMARY = 'On Medicare? Bring in your record';

/** Fold the card once the ledger has lines, unless CMS has just sent the person back connected. */
export function importFolded(hydrated: boolean, lines: number, status: BbStatus | null): boolean {
  return hydrated && lines > 0 && !status?.connected;
}

export default function MedicareImport() {
  const [status, setStatus] = useState<BbStatus | null>(null);
  const [trying, setTrying] = useState(false);
  const st = useStoreMaybe();
  const folded = importFolded(!!st?.hydrated, st?.entries.length ?? 0, status);

  useEffect(() => {
    let live = true;
    fetch('/api/bluebutton/status', { headers: { accept: 'application/json' } })
      .then((r) => r.json())
      .then((j: BbStatus) => { if (live && j && j.configured === true) setStatus(j); })
      .catch(() => { /* not reachable: stay off */ });
    if (new URLSearchParams(window.location.search).get(TRY_PARAM) === TRY_VALUE) setTrying(true);
    return () => { live = false; };
  }, []);

  const tryButton = (
    <button type="button" className="btn ghost small" style={{ whiteSpace: 'normal', textAlign: 'center' }} onClick={() => setTrying(true)}>{TRY_LABEL}</button>
  );
  const sample = <>Watch claims become ledger lines, on synthetic data published by CMS. No real person&rsquo;s claims; the live sign-in uses CMS&rsquo;s sandbox.</>;

  if (folded && !trying) {
    return (
      <div className="micro" data-testid="bb-folded" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '.35rem .75rem', margin: '0 0 var(--sp-3)' }}>
        <details style={{ flex: '1 1 16rem' }}>
          <summary><strong>{FOLD_SUMMARY}</strong></summary>
          <p style={{ margin: '.35rem 0' }}>{sample}</p>
          {status?.configured && (
            <Suspense fallback={null}>
              <ImportClaims initialStatus={status} />
            </Suspense>
          )}
        </details>
        <span data-testid="bb-try">{tryButton}</span>
      </div>
    );
  }

  return (
    <>
      {status?.configured && (
        <Suspense fallback={null}>
          <ImportClaims initialStatus={status} />
        </Suspense>
      )}
      {trying ? (
        <Suspense fallback={<p className="micro" role="status">Opening CMS&rsquo;s synthetic example&hellip;</p>}>
          <SyntheticImport onClose={() => setTrying(false)} />
        </Suspense>
      ) : (
        <p className="micro" data-testid="bb-try" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.35rem .75rem', margin: '0 0 var(--sp-3)' }}>
          <span>
            <strong>On Medicare?</strong> {sample}
          </span>
          {tryButton}
        </p>
      )}
    </>
  );
}
