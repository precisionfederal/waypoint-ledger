import type { Metadata } from 'next';
import OrgKitChannel from '@/components/OrgKitChannel';

export const metadata: Metadata = {
  title: 'The register · one link',
  description: 'The survey answers that came in through one organization’s link, counted on their own. Fewer than 11 answers are never shown as a number.',
};
export const dynamic = 'force-static';

export default function RegisterChannelPage() {
  return <OrgKitChannel />;
}
