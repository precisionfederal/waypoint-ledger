'use client';

/* ==========================================================================
   /account — the optional account, and the two doors into it.

   The product's promise is that no account is needed, and that stays true: a
   ledger lives in this browser until the person presses Save, and pressing Save
   is the only thing that sends it anywhere. This page exists for the one thing a
   browser cannot do — the same ledger on a phone and on a laptop, and a way back
   after a person clears their browsing data.

   It also carries the door for people who will never be on this page as an
   account holder: someone who saved a ledger anonymously, wrote down the delete
   code, and wants it gone. That needs no sign-in and is right here.

   Two doors, because one is not enough. A passkey is the better door and needs
   no email and no password. But passkeys are not offered by every browser a
   person is handed — a library computer, a locked-down work laptop, an old
   phone — and telling someone in that position that they cannot keep the ledger
   they just built is not an answer. So: email and password, hashed properly,
   with a ten-word recovery code instead of a reset email.
   ========================================================================== */

import Link from '@/components/IntentLink';
import { useCallback, useEffect, useRef, useState } from 'react';
import AccountDashboard from './AccountDashboard';
import { Icon } from './Icons';
import { TI, trust as s } from './trust/Kit';
import { AUTH_EVENT } from './Shell';
import {
  forgetSavedJourney, login, me, passkeysSupported, recoverWithCode, register,
  signInWithPassword, signUpWithPassword,
  type MeUser,
} from '@/lib/auth-client';
import a from './Account.module.css';
import { ART, Spot } from './ContribKit';

/* app/globals.css line 208 styles textarea, input[type=text], input[type=number]
   and select — it was written before this page existed and does not name
   input[type=email] or input[type=password], so those two render as bare
   browser boxes. The identity is kept here from the same tokens rather than by
   editing a shared stylesheet another lane is appending to in this same round;
   the focus ring on line 210 already covers every input, so it still applies. */
const FIELD: React.CSSProperties = {
  width: '100%', font: 'inherit', color: 'var(--ink)', background: 'var(--surface)',
  border: '1.5px solid #878f9b', borderRadius: 'var(--r-md)', padding: '.75rem .9rem', minHeight: '2.9rem',
};

const NAME_MAX = 40;
const msg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not work.');

/* FLOW contrib-2: a typo in the address is said as a typo, before any request,
   instead of coming back from the server as "does not match an account". The
   pattern is the one the server holds addresses to (cf/functions/api/interview.js
   and the password door both reject anything without a name, an @ and a dot). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function emailProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Type your email address first.';
  if (!EMAIL_RE.test(t)) return 'That does not look like an email address. Check for a missing @ or dot.';
  return null;
}

/* FLOW contrib-14: on a phone the two doors are a switch, so a person with a
   password habit does not scroll past a passkey card first. The last one used is
   remembered on this device only. On a wider screen both doors show side by side. */
type Method = 'passkey' | 'password';
const METHOD_KEY = 'waypoint.account.door';
function readMethod(): Method | null {
  try { const v = localStorage.getItem(METHOD_KEY); return v === 'passkey' || v === 'password' ? v : null; } catch { return null; }
}
function writeMethod(m: Method) { try { localStorage.setItem(METHOD_KEY, m); } catch { /* private mode */ } }

/* The header's account link ("Sign in", then the person's name) is AccountLink
   in components/Shell.tsx; see the note there for why it does not live here. */

/** A link, a slug, or the whole URL a person copied. All three are the same
 *  ledger, and asking someone to work out which part we wanted is rude. */
export function slugFromLink(v: string): string {
  const t = v.trim();
  if (!t) return '';
  const m = /[?&]s=([a-z0-9]{4,32})/i.exec(t) || /\/ledger\/([a-z0-9]{4,32})/i.exec(t);
  if (m) return m[1].toLowerCase();
  const bare = t.replace(/^.*\//, '');
  return /^[a-z0-9-]{4,64}$/i.test(bare) ? bare.toLowerCase() : t;
}

/* ---- the door for someone who saved without an account ----
   Saving is opt-in and it does send the ledger to this site. Until now nothing
   could take it back unless you had signed in, which the majority of people
   here never do. The save hands back a delete code once; this is where it is
   used, from any device, with no account at all. */
function ForgetASave() {
  const [link, setLink] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <div className={`card ${a.forget}`} style={{ maxWidth: '46rem' }}>
      <h3 className={a.doorH}><span className={a.doorIcon} aria-hidden="true"><TI.trash /></span>Delete a ledger you saved without an account</h3>
      <p>
        Pressing <strong>Save across devices</strong> on the ledger sends that ledger here so its link opens anywhere. You were given a
        delete code at the same moment. Paste the link and the code and it is gone from this site: no account, no email,
        from any device. It also stops opening on its own 180 days after it was saved.
      </p>
      {err && <div className="notice warn" role="alert"><p>{err}</p></div>}
      {done && <div className="notice" role="status"><p>That ledger is deleted. Its link no longer opens, for you or for anyone you sent it to.</p></div>}
      <label className="field">
        <span>The share link (or just the code at the end of it)</span>
        <input type="text" style={FIELD} value={link} placeholder="https://…/ledger?s=…"
          onChange={(e) => { setLink(e.target.value); setDone(false); }} />
      </label>
      <label className="field">
        <span>Your delete code (16 characters)</span>
        <input type="text" style={FIELD} value={code} autoComplete="off" spellCheck={false}
          onChange={(e) => { setCode(e.target.value); setDone(false); }} />
      </label>
      <div className="step-actions">
        <button type="button" className={`btn ghost ${a.forgetBtn}`} disabled={busy || !link.trim() || !code.trim()}
          data-testid="forget-save"
          onClick={async () => {
            setBusy(true); setErr(null); setDone(false);
            try { await forgetSavedJourney(slugFromLink(link), code); setDone(true); setLink(''); setCode(''); }
            catch (e) { setErr(msg(e)); } finally { setBusy(false); }
          }}>{busy ? 'Deleting…' : 'Delete that ledger'}</button>
      </div>
      <p className="micro">
        We keep only a scrambled form of the code, so nobody here can look yours up: not us, and not anyone who copies
        this database. If it is lost, the ledger stops opening on its own after 180 days.
      </p>
    </div>
  );
}

type Door = 'signup' | 'signin' | 'recover';

export default function Account() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<MeUser | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  /* Most people who open this page already have an account somewhere, so it
     opens on Sign in; making one is the second tab. */
  const [door, setDoor] = useState<Door>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [nameField, setNameField] = useState('');

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /* Which door the error belongs to, so it renders beside the button that was
     pressed (FLOW contrib-1) instead of at the top of the card, off screen. */
  const [errAt, setErrAt] = useState<Method>('password');
  const [supported, setSupported] = useState(true);
  const [method, setMethod] = useState<Method>('passkey');
  /* After "Yes, erase it" (FLOW contrib-3): what went, from the server's own answer. */
  const [erased, setErased] = useState<string | null>(null);
  const errRef = useRef<HTMLDivElement>(null);
  const erasedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ok = passkeysSupported();
    setSupported(ok);
    setMethod(readMethod() ?? (ok ? 'passkey' : 'password'));
    let live = true;
    me().then((u) => { if (!live) return; setUser(u); setReady(true); })
      .catch(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  /* Tell the header who is signed in, so its link turns into the name (or back
     into "Sign in") the moment it changes, without a reload. */
  useEffect(() => {
    if (!ready) return;
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: user ? { displayName: user.displayName ?? null } : null }));
  }, [user, ready]);

  const act = useCallback(async (kind: string, fn: () => Promise<void>) => {
    const at: Method = kind.startsWith('passkey') ? 'passkey' : 'password';
    setBusy(kind); setErr(null); setErased(null); setErrAt(at);
    if (at === 'password') {
      const bad = emailProblem(email);
      if (bad) { setErr(bad); setBusy(null); return; }
    }
    try { await fn(); writeMethod(at); } catch (e) { setErr(msg(e)); } finally { setBusy(null); }
  }, [email]);

  /* An error is announced (role=alert) and focus moves to it, so the person sees
     the answer to the press they just made without hunting for it. */
  useEffect(() => { if (err) errRef.current?.focus(); }, [err]);
  useEffect(() => {
    if (!erased || user) return;
    window.scrollTo({ top: 0 });
    erasedRef.current?.focus();
  }, [erased, user]);

  const errBox = (at: Method) => (err && errAt === at
    ? <div className="notice warn" role="alert" tabIndex={-1} ref={errRef} data-testid={`account-error-${at}`}><p>{err}</p></div>
    : null);
  const pick = (m: Method) => { setMethod(m); writeMethod(m); setErr(null); };

  if (user) {
    return (
      <AccountDashboard
        user={user}
        initialRecoveryCode={recoveryCode}
        onUser={(u, gone) => { setUser(u); if (!u) { setRecoveryCode(null); setPassword(''); setCode(''); setDoor('signin'); setErased(gone ?? null); } }}
      />
    );
  }

  const pwLabel = door === 'signup' ? 'Choose a password (at least 10 characters)'
    : door === 'signin' ? 'Your password' : 'Your new password (at least 10 characters)';

  return (
    <section className="page">
      <div className="wrap">
        {erased && (
          <div className="notice" role="status" tabIndex={-1} ref={erasedRef} data-testid="account-erased">
            <p><strong>{erased}</strong></p>
            <p>Nothing of the account is left on this site. You can still use everything here without one.</p>
          </div>
        )}
        <div className={s.acctHero}>
          <div>
            <Spot art={ART.account} className={a.spot} eager />
            <p className="eyebrow">Your account &middot; entirely optional</p>
            <h1>Sign in to keep your ledger on every device</h1>
            <p className={s.lead}>You do not need one. Pricing a journey, the ledger in this browser, corrections and the survey all work without signing in.</p>
            <ul className={s.assure}>
              <li><span><TI.device /></span><span><b>An account does one thing:</b> the ledgers you save open on your phone, your laptop and the computer at the clinic.</span></li>
              <li><span><TI.eye /></span><span><b>Nothing else about you is collected.</b> This site sends no mail at all.</span></li>
              <li><span><TI.trash /></span><span><b>You can delete it, and everything in it, in two clicks.</b></span></li>
            </ul>
            <div className={s.footLinks}>
              <Link className="btn ghost" href="/ledger">Back to my ledger</Link>
              <Link className="btn ghost" href="/privacy">What this site keeps</Link>
            </div>
          </div>

          <div className={`${s.signCard} ${a.card}`} data-door={method}>
            {/* access2-14: a pair of pressed buttons, not tabs: there is no tab panel or arrow-key pattern behind them. */}
            <div className={`tabs ${a.switch}`} role="group" aria-label="How to sign in">
              {([['passkey', 'Passkey'], ['password', 'Email and password']] as [Method, string][]).map(([k, lab]) => (
                <button key={k} type="button" aria-pressed={method === k} aria-controls={`door-${k}`}
                  className={method === k ? 'is-on' : ''} onClick={() => pick(k)}>{lab}</button>
              ))}
            </div>

            {/* ---- door one: a passkey ---- */}
            <div id="door-passkey" className={a.passkey}>
            <h2 className={a.doorH}><span className={a.doorIcon} aria-hidden="true"><TI.key /></span>Continue with a passkey</h2>
            <p>
              Your face, your fingerprint or your screen lock instead of a password. Your device makes it and keeps it;
              there is nothing to remember, nothing to reuse and no email address to hand over.
            </p>
            <label className="field">
              <span>Display name for a new passkey (optional, up to {NAME_MAX} characters)</span>
              <input type="text" maxLength={NAME_MAX} value={nameField} placeholder="Blank is fine"
                onChange={(e) => setNameField(e.target.value)} disabled={!supported} />
            </label>
            <div className={s.stack} style={{ marginTop: '.9rem' }}>
              {/* A device that already holds a passkey signs in; it does not fork a
                  second account. So "Use my passkey" leads, and making one follows. */}
              <button type="button" className="btn primary" disabled={busy !== null || !supported}
                onClick={() => act('passkey-in', async () => { setUser(await login()); })}>
                {busy === 'passkey-in' ? 'Waiting for your device…' : 'Use my passkey'} <Icon.Shield />
              </button>
              <button type="button" className="btn ghost" disabled={busy !== null || !supported}
                onClick={() => act('passkey-new', async () => { setUser(await register(nameField.trim() || undefined)); })}>
                {busy === 'passkey-new' ? 'Waiting for your device…' : 'Create a passkey'}
              </button>
            </div>
            {!supported && (
              <p className="micro">This browser does not offer passkeys. Use the email and password door; it works everywhere.</p>
            )}
            {errBox('passkey')}
            </div>

            <p className={`${s.or} ${a.or}`}>or</p>

            {/* ---- door two: email and password. Two doors, because passkeys are not
                offered by every browser a person is handed. ---- */}
            <div id="door-password" className={a.password}>
            <h2 className={a.doorH}><span className={a.doorIcon} aria-hidden="true"><TI.mail /></span>Email and password</h2>
            {door === 'recover' ? (
              <p className="door-back">
                <strong>Set a new password with your ten words.</strong>{' '}
                <button type="button" className="link-btn" onClick={() => { setDoor('signin'); setErr(null); }}>Back to sign in</button>
              </p>
            ) : (
              <div className="tabs" role="group" aria-label="Sign in or create an account">
                {([['signin', 'Sign in'], ['signup', 'Create an account']] as [Door, string][]).map(([k, lab]) => (
                  <button key={k} type="button" aria-pressed={door === k} className={door === k ? 'is-on' : ''}
                    onClick={() => { setDoor(k); setErr(null); }}>{lab}</button>
                ))}
              </div>
            )}

            <label className="field">
              <span>Email address</span>
              <input type="email" autoComplete="email" maxLength={120} style={FIELD} value={email}
                aria-invalid={err !== null && errAt === 'password' && emailProblem(email) !== null ? true : undefined}
                onChange={(e) => setEmail(e.target.value)} />
            </label>

            {door === 'recover' && (
              <label className="field" style={{ marginTop: '.75rem' }}>
                <span>Your ten-word recovery code</span>
                <input type="text" autoComplete="one-time-code" value={code} placeholder="ten words, in order" style={FIELD}
                  onChange={(e) => setCode(e.target.value)} />
              </label>
            )}

            <label className="field" style={{ marginTop: '.75rem' }}>
              <span>{pwLabel}</span>
              <input type={showPw ? 'text' : 'password'} value={password} style={FIELD}
                autoComplete={door === 'signin' ? 'current-password' : 'new-password'}
                onChange={(e) => setPassword(e.target.value)} />
            </label>
            <div className="check">
              <input id="showpw-in" type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
              <label htmlFor="showpw-in">Show what I am typing</label>
            </div>
            {door === 'signin' && (
              <p className="door-forgot">
                <button type="button" className="link-btn" onClick={() => { setDoor('recover'); setErr(null); }}>I forgot my password</button>
              </p>
            )}

            {errBox('password')}
            <div className={s.stack}>
              {door === 'signup' && (
                <button type="button" className="btn primary" disabled={busy !== null}
                  onClick={() => act('signup', async () => {
                    const r = await signUpWithPassword(email.trim(), password, nameField.trim() || undefined);
                    setRecoveryCode(r.recoveryCode); setUser(r.user);
                  })}>{busy === 'signup' ? 'Creating your account…' : 'Create my account'}</button>
              )}
              {door === 'signin' && (
                <button type="button" className="btn primary" disabled={busy !== null}
                  onClick={() => act('signin', async () => { setUser(await signInWithPassword(email.trim(), password)); })}>
                  {busy === 'signin' ? 'Signing in…' : 'Sign in with my password'}
                </button>
              )}
              {door === 'recover' && (
                <button type="button" className="btn primary" disabled={busy !== null}
                  onClick={() => act('recover', async () => {
                    const r = await recoverWithCode(email.trim(), code, password);
                    setRecoveryCode(r.recoveryCode); setUser(r.user);
                  })}>{busy === 'recover' ? 'Checking your code…' : 'Set a new password'}</button>
              )}
            </div>

            <p className="micro">
              {door === 'signup' && 'You will get ten words to write down. They are the only way back in if the password goes. There is no reset email, because this site sends no mail.'}
              {door === 'signin' && 'Ten wrong tries on one address in an hour and it stops answering for the rest of the hour.'}
              {door === 'recover' && 'The ten words you wrote down when you made the account. Spaces, hyphens and capital letters do not matter.'}
            </p>
            </div>
          </div>

          <div className={s.acctFacts}>
          <h2 className={s.h2} style={{ marginTop: '2rem' }}>What an account is, exactly</h2>
          <dl className={s.kv}>
            <div><dt><span><TI.key /></span>Kept</dt><dd>A random account number, the ledgers you press save on (the lines you typed are stored here so the link opens on your other devices) and whichever way in you chose: the public half of a passkey, or an email address and a scrambled form of your password that cannot be turned back into it.</dd></div>
            <div><dt><span><TI.device /></span>Optional</dt><dd>A display name, only if you type one.</dd></div>
            <div><dt><span><TI.never /></span>Never kept</dt><dd>Your real name, your diagnosis, your IP address, a ledger you did not press save on, or any mailing list. This site sends no mail at all.</dd></div>
            <div><dt><span><TI.trash /></span>Removable</dt><dd>Everything, from this page, whenever you want.</dd></div>
          </dl>
          </div>
        </div>

        {!ready && <p className="micro">Checking whether this device is already signed in&hellip;</p>}

        <h2 className={s.h2}>Saved without an account?</h2>
        <ForgetASave />
      </div>
    </section>
  );
}
