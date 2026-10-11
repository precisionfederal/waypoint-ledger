'use client';
/* critic-11: "Step 3 of 3" sits above the H1, where /ledger puts "Step 2 of 3".
   It only reads right after steps 1 and 2 (FLOW judge-10), so it shows only when
   this browser holds ledger lines; the page's own eyebrow is always there. */
import { useStore } from '@/lib/store';

export default function GapStep() {
  const fromLedger = useStore().entries.length > 0;
  return <p className="eyebrow">{fromLedger ? <>Step 3 of 3 <span aria-hidden="true">&middot;</span> Uncounted care</> : 'Uncounted care'}</p>;
}
