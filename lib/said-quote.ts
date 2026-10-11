/* ==========================================================================
   JUDGE-6 #10: A QUOTE ENDS ON A WORD SHE SAID IT ON.

   "A GI doctor finally did an endoscopy" prices the endoscopy and, from what
   the match left over, the specialist visit; the visit's words are that
   remainder, "GI doctor finally did an", and the ledger quoted it as what she
   said. A line's words that stop on a joining word (an article, a preposition,
   a conjunction, a helping verb) were cut there, so the quote ends on the last
   word that carries meaning and says it was cut with an ellipsis: "GI doctor
   finally…". A line that ends a sentence, or ends on any other word, is quoted
   whole. The stored words are never changed; this is how they are shown.
   ========================================================================== */
const DANGLING = /\s+(?:a|an|the|of|to|for|with|and|or|but|did|do|does|had|has|have|got|was|were|is|are|be|been|my|her|his|their|our|your|its|some|any|at|by|from|into|who|which)$/i;

/* JUDGE-7 #10: a story cut at a comma inside brackets left "a ton of labs
   (ANA" and "sed rate)." on the ledger and the sheet. A bracket is quoted only
   with its pair; one whose pair sits in another line is left out. */
function pairedBrackets(raw: string): string {
  const keep = Array.from(raw, () => true);
  const open: number[] = [];
  Array.from(raw).forEach((c, i) => {
    if (c === '(' || c === '[') open.push(i);
    else if (c === ')' || c === ']') {
      const j = open.length ? open[open.length - 1] : -1;
      if (j >= 0 && (raw[j] === '(') === (c === ')')) open.pop();
      else keep[i] = false;
    }
  });
  for (const j of open) keep[j] = false;
  return Array.from(raw).filter((_, i) => keep[i]).join('').replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ');
}

/** The words of a line as they are quoted: whole, or cut on a word with "…". */
export function saidQuote(raw: string): string {
  const t = pairedBrackets(raw).trim();
  if (!t || /[.!?)"”]$/.test(t)) return t;
  let s = t;
  for (let m = s.match(DANGLING); m && m.index! > 0; m = s.match(DANGLING)) s = s.slice(0, m.index).trimEnd();
  return s === t ? t : `${s.replace(/[,;:]$/, '')}…`;
}
