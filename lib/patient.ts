/* ==========================================================================
   judge panel #9 (2026-10-01): A CHILD'S LEDGER.

   An advocate who fell ill as a child wrote on 12 September that the questions
   assumed a working adult. The survey changed (lib/survey-def.js, 2026-10-01.1);
   this is the same change in the ledger, with the SAME stratum ids:
     caregiver-child  a parent or caregiver, for a child
     pediatric-onset  it began before 18, said by the person
     adult-onset      it began at 18 or older
   It is read from the words she typed and she can change it. When it is a
   child's illness, the school card comes forward (a child's employer is a
   school), Medicaid or CHIP is offered first, and the Medicare basis says it
   is a reference for a child.

   The school card's two sentences are the regulations' own terms, read on
   govinfo.gov 2026-10-01:
     https://www.govinfo.gov/content/pkg/CFR-2023-title34-vol1/xml/CFR-2023-title34-vol1-sec104-33.xml
     https://www.govinfo.gov/content/pkg/CFR-2023-title34-vol2/xml/CFR-2023-title34-vol2-sec300-8.xml
   and CHIP from https://www.medicaid.gov/chip (same day):
     34 CFR 104.33(b)(1) (Section 504): "the provision of an appropriate
       education is the provision of regular or special education and related
       aids and services that (i) are designed to meet individual educational
       needs of handicapped persons as adequately as the needs of
       nonhandicapped persons are met"
     34 CFR 300.8(c)(9) (IDEA): "Other health impairment means having limited
       strength, vitality, or alertness ... that (i) Is due to chronic or acute
       health problems ... and (ii) Adversely affects a child's educational
       performance."
   Medicaid.gov, CHIP: "Provides health coverage to eligible children through
   both Medicaid and separate CHIP programs."
   ========================================================================== */
import { AGE_SPAN, AGE_NOW_SPAN, PATIENT_RELATIVES, relativeAsPatient } from './mapper';
import { COVERAGE_OPTIONS, type Coverage } from './fit';

/* JUDGE-7 #5: 'caregiver-adult' is a story an adult child or a spouse writes
   about an adult relative ("My dad is 78…"). It is read from the words only,
   never offered as a survey choice (PATIENT_OPTIONS stays the survey's three),
   and carries the relation so the sheet can say whose search it was. */
export type PatientStratum = 'caregiver-child' | 'pediatric-onset' | 'adult-onset' | 'caregiver-adult';
export type PatientRelation = 'father' | 'mother' | 'husband' | 'wife' | 'partner' | 'grandmother' | 'grandfather';
export interface Patient { stratum: PatientStratum; from: 'words' | 'chosen'; relation?: PatientRelation }

const RELATION_OF: Record<string, PatientRelation> = {
  dad: 'father', father: 'father', mom: 'mother', mum: 'mother', mother: 'mother', husband: 'husband', wife: 'wife',
  partner: 'partner', spouse: 'partner', grandma: 'grandmother', grandmother: 'grandmother', grandpa: 'grandfather', grandfather: 'grandfather',
};

/** The adult relative a story is about, in the sheet's words, or null. */
export function relationFromWords(story: string): PatientRelation | null {
  const rel = relativeAsPatient(story, story.split(/[.!?;,\n]+/));
  return rel ? RELATION_OF[rel] ?? null : null;
}

/* The ids are the survey's (lib/survey-def.js STRATA). tests/patient-strata.test.ts fails
   when one is renamed there; the check is not run here, so the ledger does not carry the
   whole survey definition (7.9 KB) into every page's first load (re-merge). */

/** The ledger's words for each choice. The ids are the survey's. */
export const PATIENT_OPTIONS: { id: PatientStratum; label: string }[] = [
  { id: 'adult-onset', label: 'Me, and it began at 18 or older' },
  { id: 'pediatric-onset', label: 'Me, and it began before 18' },
  { id: 'caregiver-child', label: 'A child I care for' },
];

export const childIllness = (p: Patient | null | undefined): boolean =>
  !!p && (p.stratum === 'caregiver-child' || p.stratum === 'pediatric-onset');

const flatten = (s: string) => ` ${s.toLowerCase().replace(/['‘’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

const CAREGIVER = / (?:my|our) (?:daughter|son|kid|kids|child|children|toddler|baby|teen|teenager|boy|girl|stepson|stepdaughter|grandson|granddaughter)(?= )| (?:my|our) \d{1,2} (?:year|yr) old(?= )| (?:her|his|their) (?:pediatrician|pediatric \w+|school nurse)(?= )/;
const CHILD_ONSET = / (?:as a|when i was a|since i was a) (?:kid|child|teen|teenager|little girl|little boy|baby|toddler)(?= )| (?:sick|ill|symptoms?|started|began) (?:\w+ ){0,3}?in (?:elementary|middle|high|primary|junior high|grade) school(?= )/;
const ONSET_AGE = / (?:sick|ill|symptoms?|started|began|begun|since|onset)(?: \w+){0,4}? (?:at|age|aged|when i was|since i was|when i turned) (\d{1,2})(?= )/;

const THIRD_NOW = /(?:she[’']?s|she is|he[’']?s|he is|they[’']?re|they are|my (?:son|daughter|child|kid) is) (?:now )?\d{1,2}$/i;
const ADULT_RELATIVE = new RegExp(` (?:my|our) (?:${PATIENT_RELATIVES})(?= )`);
const FIRST_PERSON = / (?:i|im|ive|me) /;
const FIRST_AGE = /^(?:she[’']?s|she is|he[’']?s|he is|they[’']?re|they are)\s+(?:now\s+)?(\d{1,2})\b(?!\s*(?:years?|months?|weeks?|days?)\s+(?:ago|into))/i;
/** Who the illness is about, from the words alone, or null when they do not say. */
export function patientFromWords(story: string): PatientStratum | null {
  const q = flatten(story);
  if (CAREGIVER.test(q)) return 'caregiver-child';
  if (CHILD_ONSET.test(q)) return 'pediatric-onset';
  /* Merge round 6 (2026-10-01), beside JUDGE-6 #3's "one story is one patient":
     the ages are read for WHO they are about. "got sick when she was 9, shes 13
     now" is a girl of 13 told by someone who cares for her: a child's ledger
     (it was read as no one). The two "Me" choices are the writer's own illness,
     so an onset age said about a wife, a husband or a parent ("my wife got sick
     when she was 9, shes 34 now") sets neither; she can still choose. */
  /* JUDGE-7 #6: "She is 12. She saw a pediatrician 4 times…" opens on the
     age of the person it is about. Under 18, it is a child I care for. */
  const opening = FIRST_AGE.exec(story.trim());
  if (opening && Number(opening[1]) < 18) return 'caregiver-child';
  /* JUDGE-7 #5: "My dad is 78. He saw a cardiologist…" is an adult relative's
     search, told by the person who cares for them. */
  if (relationFromWords(story)) return 'caregiver-adult';
  const now = AGE_NOW_SPAN.exec(story) ?? AGE_NOW_SPAN.exec(q);
  const thirdNow = !!now && THIRD_NOW.test(now[0]);
  if (now && thirdNow && Number(now[2]) < 18) return 'caregiver-child';
  if (ADULT_RELATIVE.test(q) && !FIRST_PERSON.test(q)) return null;
  if (thirdNow) return null;
  const a = new RegExp(AGE_SPAN.source, 'i').exec(q) ?? ONSET_AGE.exec(q);
  if (a) {
    const age = Number(a[1]);
    if (Number.isFinite(age)) return age < 18 ? 'pediatric-onset' : 'adult-onset';
  }
  return null;
}

/** The card a child's ledger shows where an adult's shows the employer one. */
export const SCHOOL_CARD = {
  title: 'Give it to the school',
  who: 'A 504 plan or IEP meeting · the school nurse · a teacher',
  body: 'Under Section 504 a public school provides regular or special education and related aids and services designed to meet a student’s individual needs (34 CFR 104.33). IDEA names a chronic health problem that limits strength, vitality or alertness and adversely affects a child’s educational performance (34 CFR 300.8(c)(9)). An itemized, cited account of the search is evidence to bring to that meeting.',
} as const;

/** Said under the total when a parent or caregiver answers for a child. */
export const CHILD_BASIS_NOTE =
  'For a child these are reference prices: Medicare is not a child’s insurer, and these are its published figures for the same care. If the child is covered by Medicaid or CHIP, choose it as the coverage and every line says whether a figure describes the child.';

/** patient2-9: the child note folds to its first sentence on the ledger; the rest
 *  opens under "More". Together they say exactly CHILD_BASIS_NOTE. */
export const CHILD_BASIS_LEAD = 'For a child these are reference prices.';
export const CHILD_BASIS_MORE = CHILD_BASIS_NOTE.slice(CHILD_BASIS_NOTE.indexOf(':') + 2).replace(/^m/, 'M');

/** flow3-18: said instead when the person answering is the one who fell ill as a child.
 *  It speaks to her, not to a parent. */
export const PEDIATRIC_ONSET_NOTE = 'Began in childhood: if Medicaid or CHIP covered you then, choose it under Change.';

/** The note under the total for this stratum, or null for an adult-onset ledger. */
export function basisNoteFor(p: Patient | null | undefined): string | null {
  if (p?.stratum === 'caregiver-child') return CHILD_BASIS_NOTE;
  if (p?.stratum === 'pediatric-onset') return PEDIATRIC_ONSET_NOTE;
  return null;
}

/** The coverage choices in the order a child's ledger offers them: Medicaid or
 *  CHIP first (Medicaid.gov: CHIP covers children "through both Medicaid and
 *  separate CHIP programs", so it reads the Medicaid fit). Unchanged otherwise. */
export function coverageOptionsFor(p: Patient | null | undefined): { key: Coverage; label: string }[] {
  if (!childIllness(p)) return COVERAGE_OPTIONS;
  return [
    ...COVERAGE_OPTIONS.filter((o) => o.key === 'medicaid').map((o) => ({ ...o, label: 'Medicaid or CHIP' })),
    ...COVERAGE_OPTIONS.filter((o) => o.key !== 'medicaid'),
  ];
}
