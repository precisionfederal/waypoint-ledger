import type { Metadata } from 'next';
import { shareCard } from '@/lib/og';
import JourneyMap from '@/components/JourneyMap';

const TITLE = 'My journey as a map';
const DESCRIPTION = 'Each step of the search for a diagnosis, in the order it happened, with the published federal figure for it. Kept on this device.';
export const metadata: Metadata = { title: TITLE, description: DESCRIPTION, ...shareCard(TITLE, DESCRIPTION, '/ledger/map') };

/* The ledger, drawn as the path the care took. It reads the same journey the
   ledger reads, on this device, and prices it the same way. The heading lives in
   components/JourneyMap so the share controls can sit beside it on a wide screen
   and after the map on a phone. */
export default function LedgerMapPage() {
  return (
    <section className="page">
      <div className="wrap">
        <JourneyMap />
      </div>
    </section>
  );
}
