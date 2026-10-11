'use client';

/* ==========================================================================
   /adopt/kit — the kit for a patient organization or a clinic. No code.

   A volunteer who runs a patient group types the group's name and gets, on one
   screen: the survey link with its own label, a QR code (PNG and SVG), a
   paragraph to paste, a one-page flyer to print, and the page where the group's
   own count appears. R3-advocate (30 Sep 2026) named this the most valuable
   thing the site lacked: "There is no box to type my org's name and get a link,
   no QR code and no preview."

   The name never leaves this browser. Only the label it becomes is ever sent,
   and only by the survey, when someone answers through the link. The QR code is
   drawn here by lib/qr.ts, our own encoder, checked module for module against
   an independent one (scripts/qr-verify.mjs): no third-party code runs on this
   page and nothing is fetched to draw it.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from '@/components/IntentLink';
import { qrMatrix, qrPath } from '@/lib/qr';
import { normalizeChannel, SMALL_CELL_MIN } from '@/lib/survey-def';
import {
  RESERVED_SLUGS, slugFor, baseFor, surveyLink, countLink, blurbFor, wordCount, flyerSentences, PRIVACY_QUOTE,
} from './OrgKitText';
import s from '@/app/adopt/kit/kit.module.css';

const INK = '#000000';
const PAPER = '#ffffff';

/* POLISH-B (2026-09-30, judge-2 fix 15): until a name is typed the kit shows its
   five outputs for this placeholder, greyed and marked "Sample", so a visitor
   sees the product without typing. It is not an organization, real or invented.
   The link and the QR code come from the same functions as a real kit; the
   sample is never handed out: its link is text, not a link, its QR code is
   crossed by a "Sample" band that covers a third of the code (more than level-M
   error correction can repair), and every copy, download and print button is
   aria-disabled with the reason. Typing a name replaces it at once. */
const SAMPLE_NAME = 'Your organization';

function svgFor(text: string): string {
  const { side, d } = qrPath(text, 'M');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side * 12}" height="${side * 12}" shape-rendering="crispEdges">`
    + `<rect width="${side}" height="${side}" fill="${PAPER}"/><path d="${d}" fill="${INK}"/></svg>`;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function pngFor(text: string, scale = 24): Promise<Blob | null> {
  const m = qrMatrix(text, 'M');
  const quiet = 4, side = m.length + quiet * 2;
  const c = document.createElement('canvas');
  c.width = c.height = side * scale;
  const g = c.getContext('2d');
  if (!g) return Promise.resolve(null);
  g.fillStyle = PAPER; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = INK;
  m.forEach((row, r) => row.forEach((on, col) => { if (on) g.fillRect((col + quiet) * scale, (r + quiet) * scale, scale, scale); }));
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

/** The survey link cut where a line may break: after the host, and after "?". */
function urlParts(link: string): string[] {
  const m = /^(https?:\/\/[^/]+)(\/[^?]*\?)?(.*)$/.exec(link);
  return m ? [m[1], m[2] || '', m[3]].filter(Boolean) : [link];
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch { return false; }
}

export default function OrgKit() {
  const [name, setName] = useState('');
  const [slugTyped, setSlugTyped] = useState<string | null>(null);
  const [base, setBase] = useState(baseFor(null));
  const [said, setSaid] = useState('');

  useEffect(() => { setBase(baseFor(window.location.origin)); }, []);
  /* FLOW adopter-12: /register/channel hands a label over as ?c=, so the group
     lead does not retype it. It is read the way the survey reads it. */
  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get('c');
      if (c && normalizeChannel(c)) setSlugTyped(normalizeChannel(c));
    } catch { /* no query: an empty kit */ }
  }, []);

  const slug = slugTyped !== null ? normalizeChannel(slugTyped) : slugFor(name);
  const reserved = !!slug && RESERVED_SLUGS.includes(slug);
  const ready = !!slug && !reserved;
  const sample = !ready;
  const org = sample ? SAMPLE_NAME : name;
  const label = sample ? (slugFor(SAMPLE_NAME) as string) : (slug as string);
  const link = surveyLink(base, label);
  const count = countLink(base, label);
  const blurb = blurbFor(org, link);
  const qr = useMemo(() => qrPath(link, 'M'), [link]);
  const sentences = flyerSentences(org);
  const file = `waypoint-survey-${label}`;

  /* FLOW5 flow5-5: the first time a link is made on a phone, the line that
     shows it is brought into view (nearest edge only, so nothing jumps when it
     is already on screen). Once, so typing on is never fought. */
  const linkNowRef = useRef<HTMLParagraphElement>(null);
  const shownOnce = useRef(false);
  useEffect(() => {
    if (!ready || shownOnce.current) return;
    shownOnce.current = true;
    const el = linkNowRef.current;
    if (el && window.matchMedia('(max-width: 479.98px)').matches) el.scrollIntoView({ block: 'nearest' });
  }, [ready]);

  const doCopy = async (text: string, what: string) => setSaid((await copy(text)) ? `${what} copied.` : `Could not copy. Select the ${what.toLowerCase()} and copy it by hand.`);
  /* Every button that copies, downloads, opens or prints: live for a real kit;
     for the sample, aria-disabled (still focusable, so the reason is read) and
     a press says why instead of acting. */
  const act = (fn: () => void) => (sample
    ? { 'aria-disabled': true as const, 'aria-describedby': 'kit-sample-why', onClick: () => setSaid('This is a sample. Type your organization’s name above to make your own link, code, paragraph and flyer.') }
    : { onClick: fn });
  const typeName = () => document.getElementById('kit-name')?.focus();
  const qrLabel = sample ? `Sample QR code, crossed out so it does not scan. Type your organization’s name to make yours.` : `QR code opening ${link}`;
  const qrArt = (cls: string) => (
    <span className={`${s.qrBox}${cls === s.flyerQr ? ` ${s.qrBoxFlyer}` : ''}`}>
      <svg className={cls} viewBox={`0 0 ${qr.side} ${qr.side}`} shapeRendering="crispEdges" role="img" aria-label={qrLabel}>
        <rect width={qr.side} height={qr.side} fill={PAPER} /><path d={qr.d} fill={INK} />
      </svg>
      {sample && <span className={s.qrBand} aria-hidden="true">Sample</span>}
    </span>
  );

  return (
    /* VISUAL-4b: the hero and the five-tile overview render on the server page */
    <>
        <div className="no-print">
          <div className={`card ${s.form}`} id="kit-form">
            <h2 className={s.formH}>Start with your organization&rsquo;s name</h2>
            <label className="field">
              <span>Your organization&rsquo;s name</span>
              <input id="kit-name" type="text" value={name} maxLength={120} autoComplete="organization"
                     onChange={(e) => setName(e.target.value)} placeholder="For example: Riverside Long COVID Group" />
            </label>
            {/* FLOW5 flow5-5: on a phone the link card is a screen and a half down,
                so the link shows here as it is made, with its own Copy. */}
            {ready && (
              <p className={s.linkNow} data-testid="kit-link-now" ref={linkNowRef}>
                <span>Your link: <span className={s.mono}>{link}</span></span>
                <button type="button" className="btn primary sm" onClick={() => doCopy(link, 'Link')}>Copy</button>
              </p>
            )}
            <label className="field">
              <span>Link label (made from the name; you can change it)</span>
              <input type="text" value={slugTyped ?? (slug || '')} maxLength={60} spellCheck={false} autoCapitalize="none"
                     aria-describedby="kit-slug-rule" onChange={(e) => setSlugTyped(e.target.value)} />
            </label>
            <p id="kit-slug-rule" className="micro">
              Lowercase letters, digits and hyphens, 24 at most. Anything else becomes a hyphen, exactly the way the
              survey reads a link. The name stays in this browser; only the label is ever sent, and only when
              someone answers through your link.
              {slugTyped !== null && <> <button type="button" className={s.linkish} onClick={() => setSlugTyped(null)}>Make it from the name again</button></>}
            </p>
            {!slug && (name || slugTyped) && <p className={s.warn} role="status">That label has no letters or digits left once it is read. Add some.</p>}
            {reserved && <p className={s.warn} role="status">&ldquo;{slug}&rdquo; is a label this site already uses, so your answers would be mixed with others. Choose another.</p>}
          </div>
        </div>

        <div className={sample ? s.sample : undefined} data-testid={sample ? 'kit-sample' : 'kit-made'}>
            {sample && (
              <div className={`no-print ${s.sampleBar}`}>
                <span className={s.sampleTag}>Sample</span>
                <p id="kit-sample-why"><strong>Sample:</strong> type your organization&rsquo;s name to make yours. Below is what you get, made for &ldquo;{SAMPLE_NAME}&rdquo;; nothing here can be copied, downloaded or printed until you do.</p>
                <button type="button" className="btn primary sm" onClick={typeName}>Type the name</button>
              </div>
            )}
            <div className={`no-print ${s.grid}`} data-testid="kit-out">
              <div className="card">
                <p className="lbl">1 &middot; Your survey link</p>
                <p className={`${s.mono} ${s.well}`} data-testid="kit-link">{link}</p>
                <div className="row">
                  <button type="button" className="btn primary sm" {...act(() => doCopy(link, 'Link'))}>Copy the link</button>
                  {sample
                    ? <button type="button" className="btn ghost sm" {...act(() => undefined)}>Open it</button>
                    : <a className="btn ghost sm" href={link} target="_blank" rel="noopener noreferrer">Open it</a>}
                </div>
                <p className="micro">
                  Every answer through this link is counted under &ldquo;{label}&rdquo;, in the public register and in the
                  open export. Anyone who has the link can answer through it, so read the count as answers through
                  your link, not as a count of your members.
                </p>
              </div>

              <div className="card">
                <p className="lbl">2 &middot; QR code</p>
                {qrArt(s.qr)}
                <div className="row">
                  <button type="button" className="btn ghost sm" {...act(async () => { const b = await pngFor(link); if (b) { save(b, `${file}.png`); setSaid('PNG saved.'); } })}>Download PNG</button>
                  <button type="button" className="btn ghost sm" {...act(() => { save(new Blob([svgFor(link)], { type: 'image/svg+xml' }), `${file}.svg`); setSaid('SVG saved.'); })}>Download SVG</button>
                </div>
                <p className="micro">Black on white with the quiet margin the standard asks for, so it scans from paper and from a screen. SVG stays sharp at any size.</p>
              </div>

              <div className="card">
                <p className="lbl">3 &middot; A paragraph to paste</p>
                <p className={s.blurb} data-testid="kit-blurb">{blurb}</p>
                <div className="row">
                  <button type="button" className="btn ghost sm" {...act(() => doCopy(blurb, 'Paragraph'))}>Copy the paragraph</button>
                </div>
                <p className="micro">{wordCount(blurb)} words, for a newsletter, a group post or a waiting-room screen. Change any word you like; the link is what counts the answers.</p>
              </div>

              <div className="card">
                <p className="lbl">4 &middot; Your own count</p>
                <p>{sample
                  ? <span className={s.mono} data-testid="kit-count">{count}</span>
                  : <Link href={`/register/channel?c=${label}`} data-testid="kit-count">{count}</Link>}</p>
                <p className="micro">
                  Your answers, counted on their own, with the first and last day and the community&rsquo;s ranking of
                  the five costs. Until {SMALL_CELL_MIN} answers have come through your link the page says only
                  &ldquo;fewer than {SMALL_CELL_MIN}&rdquo;, so a handful of answers can never point at a person.
                </p>
              </div>
            </div>

            <div className={`no-print ${s.flyerHead}`}>
              <p className="lbl">5 &middot; A one-page flyer</p>
              <button type="button" className="btn primary sm" {...act(() => window.print())}>Print the flyer</button>
            </div>
            <div className={s.stage}>
            <article className={s.flyer} data-testid="kit-flyer" aria-label={sample ? 'Sample flyer preview' : 'Flyer preview'}>
              <p className={s.flyerOrg}>{sample ? SAMPLE_NAME : (name.trim() || label)}</p>
              <h2 className={s.flyerH}>What did your search for a diagnosis cost?</h2>
              <div className={s.flyerBody}>
                <figure className={s.flyerFig}>
                  {qrArt(s.flyerQr)}
                  <figcaption className={s.flyerCap}>Point your phone&rsquo;s camera here.</figcaption>
                </figure>
                <div>
                  {sentences.map((t) => <p key={t}>{t}</p>)}
                </div>
              </div>
              {/* FLOW adopter-11: the address breaks only where a person would, after the
                  host and after the "?", never inside the label */}
              <p className={s.flyerUrl}>{urlParts(link).map((part, i) => <span key={i}>{i > 0 && <wbr />}{part}</span>)}</p>
              <blockquote className={s.quote}>
                <p>&ldquo;{PRIVACY_QUOTE}&rdquo;</p>
                <footer>From the privacy page, {base.replace(/^https?:\/\//, '')}/privacy</footer>
              </blockquote>
              <p className={s.flyerFoot}>Waypoint Ledger &middot; free, no account &middot; prices from published federal files</p>
            </article>
            </div>
        </div>

        <p className="micro no-print" aria-live="polite" role="status">{said}</p>

        <p className="micro no-print">
          Running the whole application yourself, for an agency or a health system, is on <Link href="/adopt">/adopt</Link>.
          Putting a &ldquo;Price your diagnostic journey&rdquo; button on your own website is on{' '}
          <Link href="/developers#agency-reuse">/developers</Link>.
        </p>
    </>
  );
}
