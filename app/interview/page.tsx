import type { Metadata } from 'next';
import InterviewForm from '@/components/InterviewForm';
import { shareCard } from '@/lib/og';

/* A group that shares its interview link gets this card, not the home card (FLOW adopter-10). */
const title = 'Written interview';
const description = 'Ten questions about what looking for a diagnosis cost you, answered in writing on your own time.';
export const metadata: Metadata = { title, description, ...shareCard(title, description, '/interview') };
export default function InterviewPage() { return <InterviewForm />; }
