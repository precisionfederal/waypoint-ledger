'use client';
/* ==========================================================================
   THE PROOF STRIP UNDER THE HERO (judge panel 15 Oct B-5).

   A judge with ten minutes saw the box and nothing that says lived experience
   or rigor before the first click. Three links, each a fact the site already
   prints elsewhere, and no new number:

   1. the care-gone-without ranking, from GET /api/register's survey block, the
      same aggregate the register tile reads (lib/forgone-rank, answers, never
      people), said only when lib/forgone-rank says it can be;
   2. the audit count /method prints, data/AUDIT.json's pass and rows, written
      beside it at build time (scripts/gen-audit-count.mjs);
   3. the CMS sandbox connection, said only when GET /api/bluebutton/status
      says the site is configured, linking the synthetic-beneficiary example.

   A link whose fact cannot be read is not drawn: no placeholder, no zero.
   ========================================================================== */
import { useEffect, useState } from 'react';
import Link from '@/components/IntentLink';
import { forgoneRank, type ForgoneRank } from '@/lib/forgone-rank';
import AUDIT_COUNT from '@/data/audit-count.json';

/** The ranking link's words, from the live aggregate. */
export function rankProof(r: ForgoneRank): string {
  const noun = r.answers === 1 ? 'survey answer' : 'survey answers';
  return r.top
    ? `${r.first} of ${r.answers} ${noun} ranked care gone without the heaviest burden`
    : `${r.first} of ${r.answers} ${noun} ranked care gone without first`;
}

/** The audit link's words, from data/audit-count.json. Null when the audit is missing. */
export function auditProof(a: { rows?: unknown; pass?: unknown } = AUDIT_COUNT): string | null {
  const rows = Number(a.rows), pass = Number(a.pass);
  if (!Number.isFinite(rows) || !Number.isFinite(pass) || rows <= 0) return null;
  return `${pass} of ${rows} federal figures reproduce from their source file`;
}

export const SANDBOX_PROOF = 'Connected to the CMS sandbox for Blue Button 2.0';

export default function ProofStrip() {
  const [rank, setRank] = useState<ForgoneRank | null>(null);
  const [sandbox, setSandbox] = useState(false);
  useEffect(() => {
    let live = true;
    fetch('/api/register', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setRank(forgoneRank(j?.survey)); })
      .catch(() => { /* not reachable: the link is not drawn */ });
    fetch('/api/bluebutton/status', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setSandbox(j?.configured === true); })
      .catch(() => { /* not reachable: the link is not drawn */ });
    return () => { live = false; };
  }, []);
  const audit = auditProof();
  return (
    <ul className="proof-strip" aria-label="What stands behind the figures" data-testid="proof-strip">
      {rank && <li><Link href="/register">{rankProof(rank)}</Link></li>}
      {audit && <li><Link href="/method">{audit}</Link></li>}
      {sandbox && <li><Link href="/ledger?try=cms-synthetic">{SANDBOX_PROOF}</Link></li>}
    </ul>
  );
}
