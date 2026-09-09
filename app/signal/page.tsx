import type { Metadata } from 'next';
import Register from '@/components/Register';
/* /signal is the earlier name of the register; kept so shared links keep working. */
export const metadata: Metadata = { title: 'The register' };
export default function SignalPage() { return <Register />; }
