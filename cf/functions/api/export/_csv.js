/* ==========================================================================
   CSV, written once.

   SAFE TO OPEN. A cell that begins with = + - @, a tab or a carriage return is
   a formula to Excel, Numbers and Sheets. Every such cell is quoted and given a
   leading apostrophe, so the file a policy shop opens is data, never a command.
   Plain numbers are left as numbers.

   Both export routes and the defect report share this one definition; a second
   copy would be a disagreement waiting to happen.
   ========================================================================== */

/** A cell that a spreadsheet would execute. Numbers are not formulas. */
export const isFormulaCell = (s) => /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s);

export const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  if (isFormulaCell(s)) return '"\'' + s.replace(/"/g, '""') + '"';
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function csvOf(header, rows, comment) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
  return comment ? '# ' + String(comment).replace(/\r?\n/g, ' ') + '\n' + body : body;
}
