/* JUDGE-7 #5: WHOSE SEARCH THE SHEET IS ABOUT. A parent answering for a child
   already gets "What my child's diagnostic search has cost" (FLOW5 flow5-3).
   An adult child answering for a parent got "What my diagnostic search has
   cost" over "My dad is 78." Now, when the story is a caregiver's for an adult
   (stratum 'caregiver-adult') and names who it is about, the title and the
   sheet's "who" words name that person: "What my father's diagnostic search
   has cost", "Does the published figure describe your father". With no
   relation word, or any other stratum, the words are exactly today's. The
   relation is read only from a fixed list, so no other word ever reaches the
   title. Pure, so tests/sheet-who.test.ts pins every case. */

/** The words a person may use for the adult they care for, and the word the sheet prints. */
export const RELATION_WORD: Readonly<Record<string, string>> = {
  father: 'father', dad: 'father', daddy: 'father', papa: 'father',
  mother: 'mother', mom: 'mother', mum: 'mother', mommy: 'mother', mama: 'mother',
  husband: 'husband', wife: 'wife', partner: 'partner', spouse: 'spouse',
  grandmother: 'grandmother', grandma: 'grandmother', granny: 'grandmother', nana: 'grandmother',
  grandfather: 'grandfather', grandpa: 'grandfather', granddad: 'grandfather', grandad: 'grandfather',
  brother: 'brother', sister: 'sister', son: 'son', daughter: 'daughter',
  aunt: 'aunt', uncle: 'uncle', 'father-in-law': 'father-in-law', 'mother-in-law': 'mother-in-law',
};

/** The relation as the sheet prints it, or null when the word is not one it knows. */
export function relationWord(raw: string | null | undefined): string | null {
  const k = (raw ?? '').trim().toLowerCase().replace(/^my\s+/, '');
  return RELATION_WORD[k] ?? null;
}

export interface SheetWho {
  /** The h1. */
  title: string;
  /** "Does the published figure describe {who}" */
  who: string;
  /** "Say who pays for {whose} care" */
  whose: string;
  /** The child's own figures and verdict words (lib/fit) apply only to a child. */
  forChild: boolean;
}

export function sheetWho(stratum: string | null | undefined, relation?: string | null): SheetWho {
  if (stratum === 'caregiver-child') {
    return { title: 'What my child’s diagnostic search has cost', who: 'the child', whose: 'the child’s', forChild: true };
  }
  const r = stratum === 'caregiver-adult' ? relationWord(relation) : null;
  if (r) return { title: `What my ${r}’s diagnostic search has cost`, who: `your ${r}`, whose: `your ${r}’s`, forChild: false };
  return { title: 'What my diagnostic search has cost', who: 'you', whose: 'your', forChild: false };
}
