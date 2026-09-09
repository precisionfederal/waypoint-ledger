import type { Metadata } from 'next';
import Register from '@/components/Register';
export const metadata: Metadata = { title: 'The register', description: 'What the public has told the government through this tool: corrections, uncounted care and burden rankings, as counts with their N, dates and channels. CSV and data dictionary.' };
export default function RegisterPage() { return <Register />; }
