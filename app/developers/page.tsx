import type { Metadata } from 'next';
import Developers from '@/components/Developers';

export const metadata: Metadata = {
  title: 'Developers',
  description: 'Price a diagnostic journey with one request. Every figure returns with its year, basis, population and source URL. No key, no account.',
};
export const dynamic = 'force-static';

export default function DevelopersPage() {
  return <Developers />;
}
