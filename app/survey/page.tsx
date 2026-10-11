import type { Metadata } from 'next';
import SurveyForm from '@/components/SurveyForm';
import { shareCard } from '@/lib/og';

/* A group that shares its survey link gets this card, not the home card (FLOW adopter-10). */
const title = 'Which cost weighed most?';
const description = 'Four required questions, about two minutes. Rank the burdens of looking for a diagnosis; published as a count with its N.';
export const metadata: Metadata = { title, description, ...shareCard(title, description, '/survey') };
export default function SurveyPage() { return <SurveyForm />; }
