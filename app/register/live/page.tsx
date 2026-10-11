import type { Metadata } from 'next';
import Register from '@/components/Register';
import { shareCard } from '@/lib/og';
export const metadata: Metadata = { title: 'The register · live count', description: 'Only what people have actually sent through this tool, as counts with their N, dates and channels. CSV and data dictionary.',
  ...shareCard('The Waypoint Ledger register: the live count', 'Only what people have actually sent through this tool, as counts with their N, dates and channels.', '/register/live') };
export default function RegisterLivePage() { return <Register />; }
