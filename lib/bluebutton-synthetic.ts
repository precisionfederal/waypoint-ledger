/* CMS's synthetic beneficiary, as GET /api/bluebutton/claims would return it.
   Kept out of lib/bluebutton.ts so the Cloudflare functions that import that
   module never carry these lines, and loaded only by the import's own lazy
   chunk, when someone presses the button. See SYNTHETIC_SOURCE. */
import type { ClaimsPayload, ClaimLine } from './bluebutton';
import sample from '@/data/bluebutton-cms-synthetic-lines.json';

export const SYNTHETIC_NOTE =
  'This is the one page of ten claims CMS publishes as its example. It is synthetic: no real person is in it.';

export function syntheticPayload(): ClaimsPayload {
  return {
    ok: true,
    claimCount: sample.claimCount,
    lines: sample.lines as ClaimLine[],
    truncated: false,
    note: SYNTHETIC_NOTE,
  };
}
