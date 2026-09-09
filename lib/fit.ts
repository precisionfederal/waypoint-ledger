/* ==========================================================================
   THE FIT LAYER — does this published figure describe THIS person?

   Dr. John Phillips (NIH), on what separates a cited number from a useful one:
   show "who is and isn't covered in that data", and whether the figure "does or
   doesn't closely tie with their circumstances."

   🔴 THIS MODULE INVENTS NOTHING. Every verdict is read off the row's own
   `population`, `basis` and `geography` fields and the two things the person
   told us (coverage, where they live). Every dollar figure it hands back is one
   of three published numbers:
     · the national figure already in data/prices.json
     · the locality figure in data/state-prices.json — the CMS PFS formula
       applied to CMS's own RVUs and GPCIs, audited to the cent
     · the CY2024 average submitted charge carried on 34 rows of prices.json
   There is no averaging, no interpolation and no fallback. Where nothing
   published describes the person, this module says so and offers to count it.
   ========================================================================== */

import statePrices from '@/data/state-prices.json';
import medicaidLinks from '@/data/medicaid-fee-schedules.json';
import gapCats from '@/data/invisible-events.json';
import type { PriceItem } from './types';
import { rulesFor } from './table';

/* ---------- what the person told us ---------- */

export type Coverage = 'employer' | 'marketplace' | 'medicaid' | 'medicare' | 'uninsured' | 'unsure';

export interface Ctx {
  coverage?: Coverage;
  /** a CMS locality key, "IA-00" — state and locality number, as CMS numbers them */
  locality?: string;
}

export const COVERAGE_OPTIONS: { key: Coverage; label: string }[] = [
  { key: 'employer', label: 'Employer' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'medicaid', label: 'Medicaid' },
  { key: 'medicare', label: 'Medicare' },
  { key: 'uninsured', label: 'Uninsured' },
  { key: 'unsure', label: 'Not sure' },
];

export const COVERAGE_LABEL: Record<Coverage, string> =
  Object.fromEntries(COVERAGE_OPTIONS.map((o) => [o.key, o.label])) as Record<Coverage, string>;

/* ---------- the CMS localities, read from the built file ---------- */

interface RawLocality { mac: string; state: string; locality: string; name: string; pw: number; pe: number; mp: number }

export interface Locality extends RawLocality {
  /** "IA-00" */
  key: string;
  /** what to print on the face of a figure: "IOWA", "REST OF TEXAS", "MANHATTAN" */
  displayName: string;
}

const SP = statePrices as unknown as {
  _version: string;
  _source_files: string[];
  _conversion_factor: number;
  _formula: string;
  localities: RawLocality[];
  items: Record<string, Record<string, number>>;
};

export const CONVERSION_FACTOR = SP._conversion_factor;
export const STATE_PRICE_VERSION = SP._version;
export const STATE_PRICE_SOURCES = SP._source_files;
export const STATE_PRICE_FORMULA = SP._formula;

export const LOCALITIES: Locality[] = SP.localities.map((l) => ({
  ...l, key: `${l.state}-${l.locality}`, displayName: titleCase(l.name),
}));

const BY_KEY = new Map(LOCALITIES.map((l) => [l.key, l]));

/** USPS names for the 53 states, districts and territories CMS pays under. */
export const STATE_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DC: 'District of Columbia', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  VI: 'Virgin Islands', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export interface StateGroup { code: string; name: string; localities: Locality[] }

/** Every state CMS prices, alphabetical by name, each with its own localities. */
export const STATES: StateGroup[] = (() => {
  const m = new Map<string, Locality[]>();
  for (const l of LOCALITIES) (m.get(l.state) ?? m.set(l.state, []).get(l.state)!).push(l);
  return [...m.entries()]
    .map(([code, ls]) => ({ code, name: STATE_NAME[code] ?? code, localities: ls }))
    .sort((a, b) => a.name.localeCompare(b.name));
})();

export function localityOf(key?: string | null): Locality | null {
  return key ? BY_KEY.get(key) ?? null : null;
}

/** The one locality of a state, when it has exactly one — so picking "Iowa" is enough. */
export function soleLocality(stateCode: string): Locality | null {
  const g = STATES.find((s) => s.code === stateCode);
  return g && g.localities.length === 1 ? g.localities[0] : null;
}

export interface RvuComponents { code: string; work: number; peNonFacility: number; mp: number }

/** The three CY2026 RVU components CMS publishes for each code in the PFS Relative Value
 *  File (RVU26C, July release). Copied from data/STATE-PRICES-AUDIT.txt, which
 *  data/build_state_prices.py printed while building data/state-prices.json from the CMS
 *  CSVs. tests/fit.test.ts recomputes every published locality figure from these
 *  numbers and fails if a single one is off by a cent, so this copy cannot drift. */
export const RVU: Record<string, RvuComponents> = {
  'cms-99202': { code: '99202', work: 0.93, peNonFacility: 1.25, mp: 0.07 },
  'cms-99203': { code: '99203', work: 1.6, peNonFacility: 1.76, mp: 0.16 },
  'cms-99204': { code: '99204', work: 2.6, peNonFacility: 2.47, mp: 0.24 },
  'cms-99205': { code: '99205', work: 3.5, peNonFacility: 3.23, mp: 0.36 },
  'cms-99211': { code: '99211', work: 0.18, peNonFacility: 0.54, mp: 0.01 },
  'cms-99212': { code: '99212', work: 0.7, peNonFacility: 1.02, mp: 0.06 },
  'cms-99213': { code: '99213', work: 1.3, peNonFacility: 1.46, mp: 0.09 },
  'cms-99214': { code: '99214', work: 1.92, peNonFacility: 2.0, mp: 0.14 },
  'cms-99215': { code: '99215', work: 2.8, peNonFacility: 2.75, mp: 0.21 },
  'cms-96127': { code: '96127', work: 0, peNonFacility: 0.14, mp: 0.01 },
  'cms-96156': { code: '96156', work: 2.4, peNonFacility: 0.8, mp: 0.02 },
  'cms-99495': { code: '99495', work: 2.78, peNonFacility: 3.62, mp: 0.19 },
  'cms-ed-99284-physician-only': { code: '99284', work: 2.74, peNonFacility: 0.45, mp: 0.35 },
  'cms-eye-exam-new': { code: '92004', work: 1.82, peNonFacility: 2.62, mp: 0.04 },
  'cms-img-carotid-duplex': { code: '93880', work: 0.78, peNonFacility: 4.78, mp: 0.1 },
  'cms-img-ct-abd-pelvis-c': { code: '74177', work: 1.77, peNonFacility: 7.09, mp: 0.13 },
  'cms-img-ct-chest-c': { code: '71260', work: 1.13, peNonFacility: 3.77, mp: 0.09 },
  'cms-img-ct-chest-nc': { code: '71250', work: 1.05, peNonFacility: 2.85, mp: 0.07 },
  'cms-img-ct-head-nc': { code: '70450', work: 0.83, peNonFacility: 2.3, mp: 0.06 },
  'cms-img-cxr': { code: '71046', work: 0.21, peNonFacility: 0.76, mp: 0.02 },
  'cms-img-echo': { code: '93306', work: 1.42, peNonFacility: 4.39, mp: 0.08 },
  'cms-img-mri-brain-both': { code: '70553', work: 2.23, peNonFacility: 7.1, mp: 0.16 },
  'cms-img-mri-brain-nc': { code: '70551', work: 1.44, peNonFacility: 4.31, mp: 0.1 },
  'cms-img-mri-joint-nc': { code: '73721', work: 1.32, peNonFacility: 4.71, mp: 0.09 },
  'cms-img-mri-lumbar-nc': { code: '72148', work: 1.44, peNonFacility: 4.2, mp: 0.1 },
  'cms-img-us-abdomen': { code: '76700', work: 0.79, peNonFacility: 2.57, mp: 0.06 },
  'cms-img-us-pelvic': { code: '76856', work: 0.67, peNonFacility: 2.43, mp: 0.05 },
  'cms-mh-psych-eval': { code: '90791', work: 3.84, peNonFacility: 1.33, mp: 0.02 },
  'cms-mh-therapy-45': { code: '90834', work: 2.56, peNonFacility: 0.83, mp: 0.02 },
  'cms-mh-therapy-60': { code: '90837', work: 3.78, peNonFacility: 1.2, mp: 0.02 },
  'cms-proc-colonoscopy': { code: '45378', work: 3.18, peNonFacility: 7.73, mp: 0.41 },
  'cms-proc-egd-biopsy': { code: '43239', work: 2.33, peNonFacility: 9.94, mp: 0.27 },
  'cms-proc-joint-injection': { code: '20610', work: 0.77, peNonFacility: 1.16, mp: 0.13 },
  'cms-pt-eval-low': { code: '97161', work: 1.54, peNonFacility: 1.38, mp: 0.01 },
  'cms-pt-exercise-15': { code: '97110', work: 0.45, peNonFacility: 0.41, mp: 0.01 },
  'cms-test-allergy-skin-per-test': { code: '95004', work: 0.01, peNonFacility: 0.09, mp: 0.01 },
  'cms-test-cpet': { code: '94621', work: 1.38, peNonFacility: 3.49, mp: 0.09 },
  'cms-test-ecg': { code: '93000', work: 0.17, peNonFacility: 0.27, mp: 0.02 },
  'cms-test-eeg': { code: '95819', work: 1.05, peNonFacility: 13.28, mp: 0.11 },
  'cms-test-emg': { code: '95886', work: 0.84, peNonFacility: 2.12, mp: 0.03 },
  'cms-test-event-monitor': { code: '93268', work: 0.51, peNonFacility: 4.53, mp: 0.04 },
  'cms-test-hearing': { code: '92557', work: 0.6, peNonFacility: 0.46, mp: 0.01 },
  'cms-test-holter': { code: '93224', work: 0.38, peNonFacility: 1.7, mp: 0.03 },
  'cms-test-lung-volumes': { code: '94727', work: 0.25, peNonFacility: 1.22, mp: 0.02 },
  'cms-test-neurobehavioral-1h': { code: '96116', work: 1.86, peNonFacility: 0.9, mp: 0.06 },
  'cms-test-neuropsych-1h': { code: '96132', work: 2.56, peNonFacility: 1.03, mp: 0.07 },
  'cms-test-sleep-study': { code: '95810', work: 2.44, peNonFacility: 17.47, mp: 0.26 },
  'cms-test-spirometry': { code: '94010', work: 0.17, peNonFacility: 0.7, mp: 0.02 },
  'cms-test-stress-test': { code: '93015', work: 0.73, peNonFacility: 1.43, mp: 0.04 },
  'cms-test-tilt-table': { code: '93660', work: 1.84, peNonFacility: 3.11, mp: 0.09 },
  'cms-g0442': { code: 'G0442', work: 0.18, peNonFacility: 0.37, mp: 0.01 },
  'cms-g0444': { code: 'G0444', work: 0.18, peNonFacility: 0.37, mp: 0.01 },
};

/* ---------- the three published figures ---------- */

/** The CMS allowed amount for this service in this locality, as built and audited
 *  in data/state-prices.json. `null` where CMS publishes no locality figure —
 *  the lab fee schedule, for one, has a single national rate. */
export function localityFigure(itemId: string, localityKey?: string | null): number | null {
  if (!localityKey) return null;
  const row = SP.items[itemId];
  const v = row?.[localityKey];
  return typeof v === 'number' ? v : null;
}

/** The figure the fee schedule publishes for this person's place: their locality
 *  amount where CMS publishes one, the national amount where it does not. */
export function scheduleFigureOf(item: PriceItem, ctx: Ctx): number | null {
  return localityFigure(item.id, ctx.locality) ?? item.valueUsd;
}

export function hasLocalityFigures(itemId: string): boolean {
  return !!SP.items[itemId];
}

/** How many of the table's rows carry a locality figure at all. */
export const LOCALITY_ROW_COUNT = Object.keys(SP.items).length;

export interface FormulaPart { name: string; rvu: number; gpci: number; product: number }

/** The three products CMS's own formula multiplies, for the drawer. Nothing is
 *  rounded until the sum, exactly as data/build_state_prices.py does it. */
export function formulaParts(itemId: string, loc: Locality): { code: string; parts: FormulaPart[]; sum: number; total: number } | null {
  const r = RVU[itemId];
  if (!r) return null;
  const parts: FormulaPart[] = [
    { name: 'Work', rvu: r.work, gpci: loc.pw, product: r.work * loc.pw },
    { name: 'Practice expense', rvu: r.peNonFacility, gpci: loc.pe, product: r.peNonFacility * loc.pe },
    { name: 'Malpractice', rvu: r.mp, gpci: loc.mp, product: r.mp * loc.mp },
  ];
  const sum = parts.reduce((a, p) => a + p.product, 0);
  return { code: r.code, parts, sum, total: Math.round(sum * CONVERSION_FACTOR * 100) / 100 };
}

/** The CY2024 average charge providers submitted for this same service, carried on
 *  34 rows of the price table. CHARGE basis — an alternative measure, never an
 *  addition to the allowed amount. */
export function submittedChargeOf(item: PriceItem): number | null {
  const a = rulesFor(item.id).alternates as Record<string, unknown> | undefined;
  const v = a?.['cy2024_average_submitted_charge_usd'];
  return typeof v === 'number' ? v : null;
}

/** The row's own note about that alternate, printed verbatim rather than paraphrased. */
export function chargeNoteOf(item: PriceItem): string | null {
  const a = rulesFor(item.id).alternates as Record<string, unknown> | undefined;
  const v = a?.['_charge_note'];
  return typeof v === 'string' ? v : null;
}

/** What CMS actually allowed, on average, on CY2024 claims for this same code —
 *  the third published figure on the row, read in the same claims file. */
export function allowedAlternateOf(item: PriceItem): number | null {
  const a = rulesFor(item.id).alternates as Record<string, unknown> | undefined;
  const v = a?.['cy2024_average_allowed_usd'];
  return typeof v === 'number' ? v : null;
}

export interface AltProvenance {
  title: string; url: string; file: string; sha256: string; row: string;
  retrieved: string; placeOfService: string; method: string;
}

/** 🔴 A companion figure on the screen must survive a click exactly as the row's own
 *  figure does. This is the file, the row inside it and the hash, written onto the
 *  row by data/build_cy2024_alternates.py and re-checked by data/verify_price_table.py.
 *  Returns null when the row carries no CY2024 figure — never a guess. */
export function cy2024ProvenanceOf(item: PriceItem): AltProvenance | null {
  const a = rulesFor(item.id).alternates as Record<string, unknown> | undefined;
  const str = (k: string) => (typeof a?.[k] === 'string' ? (a[k] as string) : '');
  const title = str('cy2024_source_title');
  const url = str('cy2024_source_url');
  if (!title || !url) return null;
  return {
    title, url,
    file: str('cy2024_source_file'),
    sha256: str('cy2024_source_file_sha256'),
    row: str('cy2024_source_row'),
    retrieved: str('cy2024_retrieved'),
    placeOfService: str('cy2024_place_of_service'),
    method: str('cy2024_method'),
  };
}

/* ---------- which agency published it ---------- */

/** The agency on the face of every row, from the row's own source title. */
export function agencyOf(item: PriceItem): string {
  const t = item.sourceTitle || '';
  if (/^CMS\b/.test(t)) return 'CMS';
  if (/^AHRQ, MEPS/.test(t)) return 'AHRQ MEPS';
  if (/^AHRQ, HCUP/.test(t)) return 'AHRQ HCUP';
  if (/Bureau of Labor Statistics/i.test(t)) return 'BLS';
  if (/General Services Administration/i.test(t)) return 'GSA';
  if (/MEPS/i.test(t)) return 'Peer-reviewed analysis of MEPS';
  return 'Source named on the line';
}

/** "CMS (5 lines) · AHRQ MEPS (1 line)" — U.S. Open Data breadth, counted on screen. */
export function agencyTally(items: (PriceItem | null | undefined)[]): { agency: string; lines: number }[] {
  const m = new Map<string, number>();
  for (const it of items) { if (!it) continue; const a = agencyOf(it); m.set(a, (m.get(a) ?? 0) + 1); }
  return [...m.entries()].map(([agency, lines]) => ({ agency, lines })).sort((a, b) => b.lines - a.lines);
}

/* ---------- the verdict ---------- */

export type FitVerdict = 'DESCRIBES YOU' | 'REFERENCE PRICE' | 'BILLED AGAINST THIS' | 'NOT DESCRIBED';

/**
 * What can still be shown beside a blank.
 *
 * When no published figure describes this person, the honest screen is not a
 * zero — a zero is a claim that the care was free. It is the blank, plus the
 * two published figures that bracket it, each labelled as what it is. Both
 * come from the same row: the Medicare allowed amount as a floor and, where
 * the row carries one, the CY2024 average submitted charge as a ceiling.
 * Neither is ever added to a total, and neither is ever called their rate.
 */
export interface FitReference {
  floorUsd: number | null;
  floorLabel: string;
  ceilingUsd: number | null;
  ceilingLabel: string | null;
}

export interface Fit {
  verdict: FitVerdict;
  /** one sentence, written for the person, never a methodology note */
  why: string;
  /** the figure to show this person for this line, or null when none describes them */
  figureUsd: number | null;
  /** what that figure is, on the face of the row */
  figureNote: string;
  which: 'schedule' | 'locality' | 'charge' | 'none';
  /** true when the honest answer is "nothing published describes you here" */
  offerGap: boolean;
  /** set only when `figureUsd` is null: what may be shown beside the blank */
  reference: FitReference | null;
}

const isMedicarePop = (i: PriceItem) => /medicare/i.test(i.population);
const isAllPayerPop = (i: PriceItem) => /civilian noninstitutionalized|all payers/i.test(i.population);

/**
 * 🔴 The whole fit rule, in one function, from the row's own fields.
 * Nothing here computes a dollar amount; it chooses between published ones.
 */
export function fitOf(item: PriceItem, ctx: Ctx): Fit {
  const cov = ctx.coverage;
  const loc = localityOf(ctx.locality);
  const localityUsd = loc ? localityFigure(item.id, loc.key) : null;
  const charge = submittedChargeOf(item);

  /* the default figure: the locality amount when the person picked one and CMS
     publishes it for this code, otherwise the national figure already on the row */
  const scheduleUsd = localityUsd ?? item.valueUsd;
  const which: Fit['which'] = localityUsd !== null ? 'locality' : 'schedule';
  /* When a locality is chosen and this code has one, name it. When a locality is
     chosen and this code does NOT have one, print the row's own geography line —
     which is where the table already explains why (the lab fee schedule, for one,
     has a single national rate). With no locality chosen the basis chip says it. */
  const scheduleNote = localityUsd !== null && loc
    ? `Medicare allowed amount, ${loc.displayName}, CY2026 formula`
    : loc ? item.geography : '';

  const base = (verdict: FitVerdict, why: string): Fit =>
    ({ verdict, why, figureUsd: scheduleUsd, figureNote: scheduleNote, which, offerGap: false, reference: null });

  /* the floor-and-ceiling pair, built from this row's own published figures */
  const bracket = (floorLabel: string): FitReference => ({
    floorUsd: scheduleUsd,
    floorLabel,
    ceilingUsd: charge,
    ceilingLabel: charge !== null
      ? 'Average charge providers submitted for the same service, CY2024 — a ceiling, not your rate'
      : null,
  });

  /* survey figures: an average over a population, not a payer's price */
  if (isAllPayerPop(item) && !isMedicarePop(item)) {
    return base(
      'DESCRIBES YOU',
      `This is an average across ${lowerFirst(item.population)} — everyone with any kind of coverage, and people with none. `
      + 'It describes the population you are part of, not the price any one plan pays.',
    );
  }

  if (isMedicarePop(item)) {
    switch (cov) {
      case 'medicare':
        return base('DESCRIBES YOU',
          loc ? `You are on Medicare and you told us ${loc.displayName}. This is the amount Medicare allows there for this service.`
              : 'You are on Medicare, and this is the amount Medicare allows for this service. Choose where you live and it becomes your locality’s figure.');
      case 'employer':
      case 'marketplace':
        /* 🔴 The honest answer for the ~180 million working-age Americans on private
           coverage. We looked for a published federal figure about them — the AHRQ
           MEPS mean expense per office-based visit by source of payment — and could
           not obtain the table at that grain on 2026-09-09 (the MEPS trends tool now
           serves the cut through a Tableau view with no addressable table number).
           So the Medicare figure keeps its position as a REFERENCE PRICE, the absence
           is named on the line rather than papered over. The line keeps the two
           published figures that bracket a private price — the Medicare allowed
           amount below it and the CY2024 average submitted charge above it — so a
           person on employer coverage is told what is known and what is not. */
        return base('REFERENCE PRICE',
          `${cov === 'employer' ? 'Employer plans' : 'Marketplace plans'} negotiate their own prices with each hospital and practice, and no federal file publishes them. `
          + 'This is the federal reference figure for the same service, not your bill — private plans normally pay more than Medicare, '
          + 'and the average charge below is what the same service is billed at before any plan negotiates it down.');
      case 'medicaid':
        return {
          verdict: 'NOT DESCRIBED',
          why: 'Medicaid pays rates each state sets, and no row in this table publishes them. This Medicare figure does not describe what Medicaid pays for you.',
          figureUsd: null,
          figureNote: 'No published federal figure describes you here',
          which: 'none',
          offerGap: true,
          reference: bracket('Reference price, not your rate — what Medicare allows for the same service'),
        };
      case 'uninsured':
        if (charge !== null) {
          return {
            verdict: 'BILLED AGAINST THIS',
            why: 'With no insurance you are billed the provider’s charge, not an allowed amount. This is the average charge submitted for this same service in CY2024.',
            figureUsd: charge,
            figureNote: 'Average submitted charge, CY2024 · billed charge, never added to an allowed amount',
            which: 'charge',
            offerGap: false,
            reference: null,
          };
        }
        return {
          verdict: 'NOT DESCRIBED',
          why: 'This row publishes an allowed amount and no submitted charge, and an uninsured person is billed the charge.',
          figureUsd: null,
          figureNote: 'No published federal figure describes you here',
          which: 'none',
          offerGap: true,
          reference: bracket('Reference price, not your rate — the Medicare allowed amount for the same service'),
        };
      default:
        return base('REFERENCE PRICE',
          'This is what Medicare allows for this service. Say what coverage you have and this line will tell you whether that describes you.');
    }
  }

  if (item.basis === 'charge') {
    return cov === 'uninsured'
      ? base('BILLED AGAINST THIS', 'This row is a billed charge, which is what an uninsured person is billed against.')
      : base('REFERENCE PRICE', 'This row is a billed charge. Almost nobody pays a charge; insurers pay a negotiated amount instead.');
  }

  return base('REFERENCE PRICE', `Published for ${lowerFirst(item.population)}.`);
}

/* ---------- totals, labelled truthfully ---------- */

export interface TotalLabels { primary: string; secondary: string | null }

/** The largest number on the page must name the same basis as the chips under it. */
export function totalLabels(ctx: Ctx): TotalLabels {
  const loc = localityOf(ctx.locality);
  const where = loc ? ` in ${loc.displayName}` : '';
  if (ctx.coverage === 'uninsured') {
    return {
      primary: 'What providers billed on average for these services',
      secondary: `What the published Medicare figures add up to${where}`,
    };
  }
  if (ctx.coverage === 'medicaid') {
    /* Medicaid rates are set state by state and are in no national file, so a
       total on this page can only ever be the Medicare reference. Saying so is
       the whole point: the heading must not claim to be what Medicaid pays. */
    return {
      primary: `What Medicare would allow for these services${where} — a reference, not what Medicaid pays`,
      secondary: null,
    };
  }
  return { primary: `What the published Medicare figures add up to${where}`, secondary: null };
}

/* ==========================================================================
   MEDICAID IS NOT A $0 PRODUCT.

   Medicaid covers roughly 79 million people and is over-represented in exactly
   the population this tool is built for. Every Medicare row in the table comes
   back NOT DESCRIBED for them — correctly — and the old screen then summed
   nothing and printed "$0". A zero is a claim that the care was free.

   So when not one line carries a figure that describes this person, the total
   is suppressed and replaced by three true things: the sentence that says why,
   the published figures that bracket the answer, and the person's own state
   fee schedule, which is where their rate actually is published. Nothing here
   invents a rate, and nothing here is added to a total.
   ========================================================================== */

interface RawFeeSchedule {
  state_name: string; program: string; url: string;
  http_status: number; page_title: string; verified_by: string; verified_on: string;
}
const MFS = medicaidLinks as unknown as {
  _verified_on: string; _states_published: number; _states_omitted: number;
  programs: Record<string, { state_name: string; program: string }>;
  states: Record<string, RawFeeSchedule>;
};

export interface MedicaidFeeSchedule {
  state: string; stateName: string; program: string; url: string; verifiedOn: string;
}

/** The day every address in the list was last fetched and checked. */
export const MEDICAID_LINKS_VERIFIED_ON: string = MFS._verified_on;
/** How many states we can actually send someone to. Printed, never rounded up. */
export const MEDICAID_LINK_COUNT: number = Object.keys(MFS.states).length;

/**
 * That state's own published Medicaid fee schedule, or null.
 *
 * Null is a real answer here: data/verify_medicaid_links.py fetches every
 * address and keeps only the ones that resolve and prove what they are, so a
 * state we could not verify is omitted rather than guessed at. A dead link on
 * this screen would be worse than the blank it replaced.
 */
export function medicaidFeeScheduleFor(stateCode?: string | null): MedicaidFeeSchedule | null {
  if (!stateCode) return null;
  const r = MFS.states[stateCode.toUpperCase()];
  if (!r) return null;
  return {
    state: stateCode.toUpperCase(), stateName: r.state_name, program: r.program,
    url: r.url, verifiedOn: r.verified_on,
  };
}

/**
 * What that state calls its own Medicaid program — for every state, including
 * the four whose fee-schedule page sits behind a bot filter we will not pretend
 * to have read. Naming the program is still a true and useful sentence when we
 * have no address to link, which is better than a blank and safer than a guess.
 */
export function medicaidProgramFor(stateCode?: string | null): { stateName: string; program: string } | null {
  if (!stateCode) return null;
  const r = MFS.programs?.[stateCode.toUpperCase()];
  return r ? { stateName: r.state_name, program: r.program } : null;
}

/** True when not one line on the page carries a figure that describes this
 *  person — the condition under which a total must not be printed. */
export function everyLineUndescribed(fits: Fit[]): boolean {
  return fits.length > 0 && fits.every((f) => f.figureUsd === null);
}

export interface NoFigureCopy {
  headline: string;
  body: string;
  /** what the one control under it says */
  action: string;
  /** what to say instead of comparing the year-ahead figure to a total */
  insteadOfComparison: string;
}

/** The words that stand where the total would have been. About the data, never
 *  about the person, and each one ends in something to do. */
export function noFigureCopy(ctx: Ctx, lines: number): NoFigureCopy {
  const n = `${lines} ${lines === 1 ? 'line' : 'lines'}`;
  if (ctx.coverage === 'medicaid') {
    return {
      headline: 'No federal file publishes what Medicaid pays for this care',
      body: 'Medicaid rates are set by each state and are not in any national dataset, so there is '
        + 'no honest total to put here. What Medicare allows for the same services is shown below as '
        + 'a floor and what providers billed as a ceiling. Neither one is your rate.',
      action: `Count this gap on all ${n}`,
      insteadOfComparison: 'There is no itemized total on this page to set it beside, because no '
        + 'published federal figure prices Medicaid care.',
    };
  }
  if (ctx.coverage === 'uninsured') {
    return {
      headline: 'No published federal charge describes these services',
      body: 'An uninsured person is billed the provider’s charge, and no row on this page carries a '
        + 'published charge for these services. The Medicare allowed amount is shown below as a floor. '
        + 'It is not what you would be billed.',
      action: `Count this gap on all ${n}`,
      insteadOfComparison: 'There is no itemized total on this page to set it beside, because no '
        + 'published charge describes these services.',
    };
  }
  return {
    headline: 'No published federal figure describes these services for you',
    body: 'Every line here came back with a figure that does not describe your coverage. Rather than '
      + 'add them into a total that would describe nobody, they are left blank, with the reference '
      + 'figures shown below.',
    action: `Count this gap on all ${n}`,
    insteadOfComparison: 'There is no itemized total on this page to set it beside.',
  };
}

/* ==========================================================================
   A LENGTH OF TIME IS NEVER A UNIT OF CARE, AND CARE THAT DID NOT HAPPEN IS
   NEVER PRICED.

   The mapper refuses those phrases and hands back a category instead of a
   unit. This is the reading side of that contract: it is deliberately
   defensive, because a rendering surface must not break on a mapper that has
   not shipped the field yet, and must never invent a category of its own.
   ========================================================================== */

interface RawGapCat { id: string; label: string; unit: string }

/** The gap counter's own categories, read from the same file /gap reads, so a
 *  hint on the ledger and the counter it feeds cannot drift apart. */
export const GAP_CATEGORIES: { id: string; label: string; unit: string }[] =
  (gapCats as unknown as { categories: RawGapCat[] }).categories
    .map((c) => ({ id: c.id, label: c.label, unit: c.unit }));

const GAP_BY_ID = new Map(GAP_CATEGORIES.map((c) => [c.id, c]));

export function gapCategoryLabel(id: string): string | null {
  return GAP_BY_ID.get(id)?.label ?? null;
}

export interface GapHint {
  /** one of the ids in data/invisible-events.json */
  category: string;
  /** the label the gap counter uses for that category, or null if unknown */
  label: string | null;
  /** the mapper's own sentence, shown to the person unchanged */
  reason: string;
  /** months, when the phrase was a length of time rather than a unit of care */
  months: number | null;
}

/**
 * Reads a mapper result and returns the counter it belongs in, or null.
 *
 * Every field is read defensively and an unknown category is dropped, so this
 * can never put a phrase into a counter that does not exist.
 */
export function gapHintOf(result: unknown): GapHint | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as { item?: unknown; gapCategory?: unknown; reason?: unknown; months?: unknown };
  if (r.item) return null;
  const category = typeof r.gapCategory === 'string' ? r.gapCategory.trim() : '';
  if (!category || !GAP_BY_ID.has(category)) return null;
  const reason = typeof r.reason === 'string' && r.reason.trim()
    ? r.reason.trim()
    : 'counted, never priced';
  const months = typeof r.months === 'number' && Number.isFinite(r.months) && r.months > 0
    ? r.months
    : null;
  return { category, label: gapCategoryLabel(category), reason, months };
}

function titleCase(s: string): string {
  return s.replace(/\b([A-Z])([A-Z']*)\b/g, (_, a: string, b: string) => a + b.toLowerCase())
    .replace(/\bCnty\b/g, 'County').replace(/\bSurr\.\b/g, 'Surrounding').replace(/\bNyc\b/g, 'NYC')
    .replace(/\bNj\b/g, 'New Jersey').replace(/\bDc\b/g, 'DC').replace(/\bMd\/va\b/g, 'MD/VA')
    .replace(/\bN Nyc\b/g, 'North NYC').replace(/\bSt\./g, 'St.');
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
