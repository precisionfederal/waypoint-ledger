import type { Metadata } from 'next';
import Account from '@/components/Account';
export const metadata: Metadata = {
  title: 'Your account · Waypoint Ledger',
  description: 'Optional. A passkey saves your ledgers across your own devices — no password, no email address, nothing else stored.',
};
export default function AccountPage() { return <Account />; }
