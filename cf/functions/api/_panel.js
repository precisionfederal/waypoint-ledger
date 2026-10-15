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
/** A second paid panel (CloudResearch Connect) issues its own codes, so it has its own channel. */
export const PANEL2_CHANNEL = 'paid-panel-2';
/** A paid-panel row collects no name and no email: the panel forbids contact details,
 *  so the form hides "quote me by name" and the follow-up box, and the server refuses them. */
export const isPanelChannel = (channel) => channel === PANEL_CHANNEL || channel === PANEL2_CHANNEL;
const CODE_VAR = { [PANEL_CHANNEL]: 'PROLIFIC_COMPLETION_CODE', [PANEL2_CHANNEL]: 'PANEL2_COMPLETION_CODE' };

/** `{ completionCode }` for a paid-panel row when the code is configured, else `{}`.
 *  Each study has its own code: <VAR>_SURVEY or <VAR>_INTERVIEW for `kind`, else
 *  the shared <VAR>, where <VAR> is PROLIFIC_COMPLETION_CODE for 'paid-panel' and
 *  PANEL2_COMPLETION_CODE for 'paid-panel-2'. */
export function panelCode(env, channel, kind) {
  const base = Object.prototype.hasOwnProperty.call(CODE_VAR, channel) ? CODE_VAR[channel] : '';
  if (!base) return {};
  const read = (k) => (env && typeof env[k] === 'string' ? env[k].trim() : '');
  const own = kind === 'survey' || kind === 'interview' ? read(`${base}_${kind.toUpperCase()}`) : '';
  const code = own || read(base);
  return code ? { completionCode: code } : {};
}
