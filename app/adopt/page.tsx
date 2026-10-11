import type { Metadata } from 'next';
import Adopt from '@/components/Adopt';
import { shareCard } from '@/lib/og';

export const metadata: Metadata = {
  title: 'Adopt this',
  description: 'The files to edit to run this for another condition, state or population, and the two commands that refuse a figure which does not reproduce. Code Apache-2.0, data public domain (CC0).',
  ...shareCard('Run Waypoint Ledger for another condition, state or population', 'The files to edit, in order, and the two commands that refuse a figure which does not reproduce. Code Apache-2.0, data public domain (CC0).', '/adopt'),
};
export const dynamic = 'force-static';

export default function AdoptPage() {
  /* the Conditions line now sits inside the page, under the six files (VISUAL-4b) */
  return <Adopt />;
}
