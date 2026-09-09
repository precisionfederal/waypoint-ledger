/* Categories are derived from the price table's own id prefixes. They group the
   ledger and the picker; they never change a price. */
import type { PriceItem } from './types';

export interface Category { key: string; label: string; short: string; hint: string }

export const CATEGORIES: Category[] = [
  { key: 'visit', label: 'Doctor visits', short: 'Visits', hint: 'Office and clinic appointments, new or established' },
  { key: 'er', label: 'Emergency room', short: 'Emergency', hint: 'Emergency department encounters' },
  { key: 'lab', label: 'Blood and lab tests', short: 'Labs', hint: 'Bloodwork, urine and other lab panels' },
  { key: 'img', label: 'Scans and imaging', short: 'Imaging', hint: 'X-ray, CT, MRI, ultrasound, echo' },
  { key: 'test', label: 'Heart, lung and other tests', short: 'Tests', hint: 'Monitors, breathing, tilt and exercise tests' },
  { key: 'proc', label: 'Procedures and therapy', short: 'Procedures', hint: 'Scopes, injections, physical therapy' },
  { key: 'mh', label: 'Mental health', short: 'Mental health', hint: 'Evaluations and therapy sessions' },
  { key: 'time', label: 'Time and wages', short: 'Time', hint: 'Lost earnings and caregiving, valued at published wages' },
  { key: 'survey', label: 'Survey figures', short: 'Survey', hint: 'Whole-encounter averages from federal household surveys' },
  { key: 'other', label: 'Other', short: 'Other', hint: '' },
];

const RULES: [RegExp, string][] = [
  [/^cms-99|^cms-g0463|^cms-visit/, 'visit'],
  [/^cms-ed/, 'er'],
  [/^cms-lab/, 'lab'],
  [/^cms-img/, 'img'],
  [/^cms-test/, 'test'],
  [/^cms-proc|^cms-pt|^cms-eye/, 'proc'],
  [/^cms-mh/, 'mh'],
  [/^bls/, 'time'],
  [/^meps|^hcup/, 'survey'],
];

export function categoryKey(item: PriceItem | string): string {
  const id = typeof item === 'string' ? item : item.id;
  for (const [re, key] of RULES) if (re.test(id)) return key;
  return 'other';
}

export function categoryOf(item: PriceItem | string): Category {
  const k = categoryKey(item);
  return CATEGORIES.find((c) => c.key === k) ?? CATEGORIES[CATEGORIES.length - 1];
}
