/* A code block for the technical pages: the same caption and copy button as
   the trust kit's Code, plus colour and line numbers. Coloured on the server
   (components/tech/highlight.ts), so it ships no JavaScript of its own; the
   copy button copies the string passed in, never the rendered page. */

import type { ReactNode } from 'react';
import CopyButton from '../trust/CopyButton';
import trust from '../trust/trust.module.css';
import { highlight, type Lang } from './highlight';
import t from './tech.module.css';

const LANG_NAME: Record<Exclude<Lang, 'auto'>, string> = { shell: 'shell', json: 'JSON', text: 'text', python: 'Python 3' };

export default function HiCode({ code, label, caption, tall = false, lang = 'auto', numbers = true }: {
  code: string; label: string; caption?: ReactNode; tall?: boolean; lang?: Lang; numbers?: boolean;
}) {
  const lines = highlight(code, lang);
  const shown = lang === 'auto' ? (/^\s*[{["]/.test(code) ? 'JSON' : /curl |^BASE=/m.test(code) ? 'shell' : null) : LANG_NAME[lang];
  return (
    <figure className={t.code}>
      <figcaption className={t.cap}>
        <span className={t.capText}>{caption ?? label}</span>
        {shown && <span className={t.lang} aria-hidden="true">{shown}</span>}
        <CopyButton text={code} label={label} className={trust.copy} />
      </figcaption>
      {/* tabIndex so a keyboard can scroll a long block */}
      <pre className={`${t.pre}${tall ? ` ${t.tall}` : ''}${numbers ? ` ${t.nums}` : ''}`} tabIndex={0} aria-label={label}>
        <code>
          {lines.map((l, i) => (
            <span key={i} className={t.ln}>
              {l.map((k, j) => (k.k ? <span key={j} className={t[k.k]}>{k.t}</span> : k.t))}
              {i < lines.length - 1 ? '\n' : null}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
