import type { Metadata } from 'next';
import conditionsRaw from '@/data/conditions.json';
import pricesRaw from '@/data/prices.json';
import { catalogOf } from '@/lib/conditions-catalog';
import type { RawConditionsFile, RawPrice } from '@/lib/conditions-core';
import { SELECTABLE } from '@/lib/table';
import Catalog from './Catalog';
import { shareCard } from '@/lib/og';

const TITLE = 'Conditions';
const DESCRIPTION =
  'Every condition the ledger reads: its diagnosis code, its published federal figure with two sources, what the tool '
  + 'prices for it, a check of the tool against CDC’s Lyme disease cost study, and how to add a condition as data.';
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...shareCard(TITLE, DESCRIPTION, '/conditions'),
};
export const dynamic = 'force-static';

export default function ConditionsPage() {
  const entries = catalogOf(
    conditionsRaw as unknown as RawConditionsFile,
    pricesRaw as unknown as { items: RawPrice[] },
    SELECTABLE,
  );
  const qualifier = (conditionsRaw as unknown as { _when_there_is_no_figure?: string })._when_there_is_no_figure;
  return <Catalog entries={entries} schemaHref="/conditions/schema.json" qualifier={qualifier} />;
}
