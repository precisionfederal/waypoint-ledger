import type { Metadata } from 'next';
import Register from '@/components/Register';
/* /register is the live register: the same counts, from the same endpoint, as /register/live.
   The illustrative sample at about 200 answers lives only at /register/preview, under its band. */
export const metadata: Metadata = { title: 'The register', description: 'What the public tells the government through this tool: corrections, uncounted care and burden rankings, as counts with their N, dates and channels. Only what people have actually sent. CSV and data dictionary.' };
export default function RegisterPage() { return <Register />; }
