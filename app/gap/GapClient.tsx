'use client';
import { useRouter } from 'next/navigation';
import Stepper from '@/components/Stepper';
import GapPanel from '@/components/GapPanel';

export default function GapClient() {
  const r = useRouter();
  return (
    <>
      <Stepper current={3} />
      <GapPanel onDone={() => r.push('/ledger#act')} onBack={() => r.push('/ledger')} />
    </>
  );
}
