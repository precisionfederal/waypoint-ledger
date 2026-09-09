import type { Metadata } from 'next';
import SurveyForm from '@/components/SurveyForm';
export const metadata: Metadata = { title: 'Which cost weighed most?', description: 'Five questions, two minutes. Rank the burdens of looking for a diagnosis; published as a count with its N.' };
export default function SurveyPage() { return <SurveyForm />; }
