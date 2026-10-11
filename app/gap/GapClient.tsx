'use client';
import { useRouter } from 'next/navigation';
import GapPanel from '@/components/GapPanel';
import GapMap from './GapMap';
import gapData from '@/data/invisible-events.json';

const CATS = (gapData.categories as { id: string; label: string }[]).map(({ id, label }) => ({ id, label }));

export default function GapClient() {
  const r = useRouter();
  /* "Step 3 of 3" moved above the H1 (GapStep, critic-11). */
  return (
    <>
      <GapPanel onDone={() => r.push('/ledger#act')} onBack={() => r.push('/ledger')}
        renderMap={(counts, sent) => <GapMap cats={CATS} counts={counts} sent={sent} />} />
    </>
  );
}
