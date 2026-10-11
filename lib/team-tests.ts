/* FINAL-1011 honest: the one wording, beside any count that left our own test
   rows out: "plus 5 of our own tests, marked". Null when nothing is marked, so
   a register with no marks prints nothing. Used by the register tiles and by
   the ledger's survey sentence (lib/forgone.ts). Its own module so the routes
   that never print it (the journey map) do not carry it. The rows are marked
   through POST /api/admin/annotations (cf/functions/api/_annotations.js). */
export function teamTestsPhrase(n: unknown): string | null {
  const k = typeof n === 'number' && Number.isInteger(n) ? n : 0;
  return k > 0 ? `plus ${k} of our own ${k === 1 ? 'test' : 'tests'}, marked` : null;
}
