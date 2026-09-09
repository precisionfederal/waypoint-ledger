'use client';
import { useRouter } from 'next/navigation';
import GapPanel from '@/components/GapPanel';

export default function GapClient() {
  const r = useRouter();
  return (
    <>
      <p className="eyebrow">Step 3 of 3</p>
      <GapPanel onDone={() => r.push('/ledger#act')} onBack={() => r.push('/ledger')} />
    </>
  );
}
