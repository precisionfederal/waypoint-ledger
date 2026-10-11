/* ==========================================================================
   /privacy: what we store, one row per thing, in four columns a person can
   scan: what it is, where it is kept, why, and for how long.

   🔴 EVERY CELL IS A STATEMENT app/privacy/page.tsx OR app/privacy/generated.ts
   ALREADY MAKES. Nothing here is new. Where the page states no period, the
   cell says so plainly ("No end date is set"): cf/functions has no path that
   deletes a gap report or a daily count, and FLOW contrib-17 left the survey
   with no retention period because the code defines none. Change a fold on the
   page and change its row here.
   ========================================================================== */

import type { ReactNode } from 'react';
import { TI, trust as s } from '@/components/trust/Kit';
import f from './privacy-visual.module.css';

type Row = { icon: ReactNode; what: ReactNode; where: ReactNode; why: ReactNode; long: ReactNode; device?: boolean };

const ROWS: Row[] = [
  {
    icon: <TI.device />, device: true,
    what: 'Your journey',
    where: 'This browser only, in local storage',
    why: 'So the ledger works with no account',
    long: <>Until you press &ldquo;Start over&rdquo; or clear your browser data</>,
  },
  {
    icon: <TI.device />, device: true,
    what: 'Your coverage and where you live',
    where: <>This browser only, under <code>waypoint-ledger.ctx.v1</code>. Not attached to a correction, a gap report, a share link or a saved ledger</>,
    why: 'To pick which published figure each line shows. The fit is worked out on your device',
    long: 'Until you clear your browser data',
  },
  {
    icon: <TI.reader />,
    what: 'An AI reader answer (it carries the phrases you typed)',
    where: 'Our side, under a one-way hash of what you typed',
    why: 'So the same sentence is not read twice',
    long: 'One day, then it is gone',
  },
  {
    icon: <TI.open />,
    what: 'A ledger you Save: units, counts and your short phrases',
    where: 'Our database. The delete code only as a one-way hash',
    why: 'So the link you get back opens the ledger again',
    long: 'An anonymous save stops opening after 180 days; a save on an account has no expiry. The delete code removes it',
  },
  {
    icon: <TI.target />,
    what: 'A correction',
    where: 'Our database. No name, diagnosis or IP address on the row',
    why: 'To count how each published figure is marked; the aggregate is public',
    long: 'Stays counted. Deleting your account removes the link to you',
  },
  {
    icon: <TI.steps />,
    what: 'A gap report',
    where: 'Our database. Context published only as counts, any value under 11 not shown. The note is never published',
    why: 'To record care you needed and did not get',
    long: 'No end date is set',
  },
  {
    icon: <TI.eye />,
    what: 'A burden survey answer',
    where: 'Our database. Your note encrypted at rest and never published',
    why: 'To rank which burden weighed most',
    long: 'Nothing points back to you, so this site has no way to delete one',
  },
  {
    icon: <TI.mail />,
    what: 'A written interview',
    where: 'Our database, encrypted at rest. Only our team reads it',
    why: 'Your own story, quoted only the way you chose',
    long: 'Until you ask us to remove it, through Contact',
  },
  {
    icon: <TI.key />,
    what: 'An account, only if you make one',
    where: 'Our database. Your password and recovery code only in a scrambled form',
    why: 'So a ledger follows you between devices',
    long: 'Until you delete it from /account',
  },
  {
    icon: <TI.shield />,
    what: 'The sign-in cookie',
    where: 'Your browser holds one random value; the session is on our side',
    why: 'To keep you signed in',
    long: 'Until you sign out',
  },
  {
    icon: <TI.clock />,
    what: 'Daily counts of a few actions',
    where: 'Our server: one number per day, nothing about who',
    why: 'To count site use, with no cookie, no address, no identifier and nothing you typed. Public on the live register',
    long: 'No end date is set',
  },
];

export default function StoreTable() {
  return (
    <div className={`table-scroll ${f.storeWrap}`} tabIndex={0} data-pv="">
      <table className={`${s.tbl} ${f.store}`}>
        <caption>What is kept, where, why and for how long. Each row is stated in full in the sections below.</caption>
        <thead>
          <tr>
            <th scope="col">What</th>
            <th scope="col">Where it is kept</th>
            <th scope="col">Why</th>
            <th scope="col">How long</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r, i) => (
            <tr key={i} className={r.device ? f.onDevice : undefined}>
              <th scope="row"><span className={f.rowHead}><span className={f.rowIc} aria-hidden="true">{r.icon}</span><span>{r.what}</span></span></th>
              <td data-label="Where">{r.where}</td>
              <td data-label="Why">{r.why}</td>
              <td data-label="How long" className={f.long}>{r.long}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
