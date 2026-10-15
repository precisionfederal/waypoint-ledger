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

/* judge panel 15 Oct #2.8: "9 lines are a reference price · 1 line is a describes you".
   Each verdict reads as its own sentence: a noun takes "is a", a verb takes no
   article and agrees with the count. `who` is the sheet's own who ("you", "the
   child", "your father"). Pure, so tests/sheet-polish-1015.test.ts pins every case. */
export function tallyPhrase(verdict: string, n: number, who: string): string {
  const one = n === 1;
  switch (verdict) {
    case 'DESCRIBES YOU': return `${n} ${one ? 'line describes' : 'lines describe'} ${who}`;
    case 'REFERENCE PRICE': return `${n} ${one ? 'line is a' : 'lines are a'} reference price`;
    case 'BILLED AGAINST THIS': return `${n} ${one ? 'line is' : 'lines are'} what an uninsured person is billed against`;
    case 'NOT DESCRIBED': return `${n} ${one ? 'line does' : 'lines do'} not describe ${who}`;
    default: return `${n} ${one ? 'line is' : 'lines are'} ${verdict.toLowerCase()}`;
  }
}

/* judge panel 15 Oct #2.8: an unpriced stop on the journey strip read only "No
   federal figure". It now carries her own words, as the table row does, cut at a
   word to stay one short label; hidden when she hid her words. */
const STOP_WORDS_MAX = 40;
export function stopWords(quoted: string, hideWords: boolean, fallback: string): string {
  const t = quoted.replace(/^(?:and|then|so|but)\s+/i, '').trim();
  if (hideWords || !t) return fallback;
  if (t.length <= STOP_WORDS_MAX) return `“${t}”`;
  const cut = t.slice(0, STOP_WORDS_MAX + 1).replace(/\s+\S*$/, '').replace(/[,;:]$/, '');
  return `“${cut || t.slice(0, STOP_WORDS_MAX)}…”`;
}
