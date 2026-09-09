import type { Metadata } from 'next';
import Adopt from '@/components/Adopt';

export const metadata: Metadata = {
  title: 'Adopt this',
  description: 'The files to edit to run this for another condition, state or population, and the two commands that refuse a figure which does not reproduce. Public domain.',
};
export const dynamic = 'force-static';

export default function AdoptPage() {
  return <Adopt />;
}
