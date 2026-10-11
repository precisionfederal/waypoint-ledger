import type { Metadata } from 'next';
import Register from '@/components/Register';
export const metadata: Metadata = { title: 'The register · illustrative sample', description: 'An illustrative, simulated sample of the register at about 200 answers. Not real answers; nothing here was sent by anyone, stored or exported.', robots: { index: false, follow: false } };
export default function RegisterPreviewPage() { return <Register sample />; }
