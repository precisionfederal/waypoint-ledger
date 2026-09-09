import type { Metadata } from 'next';
import InterviewForm from '@/components/InterviewForm';
export const metadata: Metadata = { title: 'Written interview', description: 'Ten questions about what looking for a diagnosis cost you, answered in writing on your own time.' };
export default function InterviewPage() { return <InterviewForm />; }
