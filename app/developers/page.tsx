import type { Metadata } from 'next';
import Developers from '@/components/Developers';
import { shareCard } from '@/lib/og';

export const metadata: Metadata = {
  title: 'Developers',
  description: 'Price a diagnostic journey with one request. Every figure returns with its year, basis, population and source URL. No key, no account.',
  ...shareCard('Waypoint Ledger for developers: price a diagnostic journey with one request', 'Every figure returns with its year, basis, population and source URL. No key, no account. OpenAPI 3.1, HL7 FHIR R4.', '/developers'),
};
export const dynamic = 'force-static';

export default function DevelopersPage() {
  return <Developers />;
}
