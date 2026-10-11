/* ==========================================================================
   One plain line where the register's counts show: how many rows were our own
   team testing the form, and that they are not counted.

   The numbers are the `teamTests` each aggregate already returns (/api/survey,
   /api/corrections, /api/gap, /api/interview, and each block of /api/register;
   cf/functions/api/_counters.js). Nothing is computed here. With no marked rows
   the component renders nothing, so a register with none shows no line.
   Marked rows stay in the open data, flagged team_test, and are listed by
   row_hash at /api/annotations (cf/migrations/0007_annotations.sql).
   ========================================================================== */
import styles from './TeamTestsNote.module.css';

const WORDS = {
  survey: ['survey answer', 'survey answers'],
  interviews: ['written interview', 'written interviews'],
  corrections: ['thumb on a federal figure', 'thumbs on federal figures'],
  gap: ['report of uncounted care', 'reports of uncounted care'],
} as const;

export type TeamTests = Partial<Record<keyof typeof WORDS, number | null | undefined>>;

/** Pure: the sentence, or null when nothing is marked. Exported for tests. */
export function teamTestsSentence(t: TeamTests): string | null {
  const parts: string[] = [];
  let total = 0;
  for (const k of Object.keys(WORDS) as (keyof typeof WORDS)[]) {
    const n = Number(t[k] ?? 0);
    if (!Number.isInteger(n) || n < 1) continue;
    total += n;
    parts.push(`${n} ${WORDS[k][n === 1 ? 0 : 1]}`);
  }
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${list} from the team testing the form ${total === 1 ? 'is' : 'are'} not counted here. ${total === 1 ? 'It stays' : 'They stay'} in the open data, marked team_test.`;
}

export default function TeamTestsNote({ className, ...t }: TeamTests & { className?: string }) {
  const text = teamTestsSentence(t);
  if (!text) return null;
  return (
    <p className={`${styles.note}${className ? ` ${className}` : ''}`}>
      {text} <a href="/api/annotations">Which rows</a>
    </p>
  );
}
