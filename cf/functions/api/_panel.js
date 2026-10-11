/* ==========================================================================
   The research-panel completion code (dormant until Bo approves a paid panel).

   A paid panel (Prolific) pays a participant only when they paste back a code
   the study shows at the end. That code is a secret of the study, so it lives
   only in the environment (PROLIFIC_COMPLETION_CODE, or one per study), never in source, the
   client bundle or any GET. It is added to a successful survey or interview
   POST only when the row's own channel is exactly 'paid-panel'; for every other
   channel, or with the variable unset, the field is absent.
   ========================================================================== */
export const PANEL_CHANNEL = 'paid-panel';

/** `{ completionCode }` for a paid-panel row when the code is configured, else `{}`.
 *  Each study has its own code: PROLIFIC_COMPLETION_CODE_SURVEY or
 *  PROLIFIC_COMPLETION_CODE_INTERVIEW for `kind`, else the shared
 *  PROLIFIC_COMPLETION_CODE. */
export function panelCode(env, channel, kind) {
  const read = (k) => (env && typeof env[k] === 'string' ? env[k].trim() : '');
  const own = kind === 'survey' || kind === 'interview' ? read(`PROLIFIC_COMPLETION_CODE_${kind.toUpperCase()}`) : '';
  const code = own || read('PROLIFIC_COMPLETION_CODE');
  return channel === PANEL_CHANNEL && code ? { completionCode: code } : {};
}
