/* /privacy: every table at a glance, counted straight from app/privacy/generated.ts
   (which is generated from the schema). One bar per table: how many of its fields
   are served publicly row by row, how many are encrypted at rest or kept only as a
   one-way hash, and the rest. The numbers are printed beside each bar, so the bar
   is decoration over a text that already says it. Nothing here is typed by hand. */

import type { PrivacyEndpoint } from '@/app/privacy/generated';
import f from './privacy-visual.module.css';

export default function FieldOverview({ endpoints }: { endpoints: PrivacyEndpoint[] }) {
  const max = Math.max(...endpoints.map((e) => e.fields.length));
  return (
    <figure className={f.fo} data-pv="">
      <figcaption className={f.foCap}>
        Every table, its fields counted from the schema. Open one for each field in plain English.
        <span className={f.foKey}>
          <span><i className={f.kPub} aria-hidden="true" />public row by row</span>
          <span><i className={f.kEnc} aria-hidden="true" />not public, encrypted or a one-way hash</span>
          <span><i className={f.kRest} aria-hidden="true" />not public</span>
        </span>
      </figcaption>
      <ul className={f.foList}>
        {endpoints.map((e) => {
          const n = e.fields.length;
          const pub = e.fields.filter((x) => x.published).length;
          const enc = e.fields.filter((x) => !x.published && x.encrypted !== 'no').length;
          const rest = n - pub - enc;
          return (
            <li key={e.id}>
              <a className={f.foName} href={`#fields-${e.id}`}><code>{e.table}</code></a>
              <span className={f.foBar} style={{ width: `${(n / max) * 100}%` }} aria-hidden="true">
                {pub > 0 && <i className={f.kPub} style={{ flexGrow: pub }} />}
                {enc > 0 && <i className={f.kEnc} style={{ flexGrow: enc }} />}
                {rest > 0 && <i className={f.kRest} style={{ flexGrow: rest }} />}
              </span>
              <span className={f.foNums}>
                {n} fields: {pub} public, {enc} encrypted or hashed, {rest} other
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
