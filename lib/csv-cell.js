/** The one rule for spreadsheet formula cells, shared by the server exports
 *  (cf/functions/api/export/_csv.js) and the in-browser ledger CSV (lib/sheet.ts).
 *  It lives in lib/ because the static build ships lib/ but never cf/. */
export const isFormulaCell = (s) => /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s);
