import type { Metadata } from 'next';
import Admin from '@/components/Admin';

/* Not linked from anywhere on the site and kept out of every index. The interviews
   this page reads are encrypted at rest and served by no public endpoint. */
export const metadata: Metadata = {
  title: 'Console',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function AdminPage() { return <Admin />; }
