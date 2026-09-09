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

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import AccountDashboard from './AccountDashboard';
import { Icon } from './Icons';
import {
  forgetSavedJourney, login, me, passkeysSupported, recoverWithCode, register,
  signInWithPassword, signUpWithPassword, signedInHint,
  type MeUser,
} from '@/lib/auth-client';

/* app/globals.css line 208 styles textarea, input[type=text], input[type=number]
   and select — it was written before this page existed and does not name
   input[type=email] or input[type=password], so those two render as bare
   browser boxes. The identity is kept here from the same tokens rather than by
   editing a shared stylesheet another lane is appending to in this same round;
   the focus ring on line 210 already covers every input, so it still applies. */
const FIELD: React.CSSProperties = {
  width: '100%', font: 'inherit', color: 'var(--ink)', background: 'var(--surface)',
  border: '1.5px solid var(--line)', borderRadius: 'var(--r-md)', padding: '.75rem .9rem', minHeight: '2.9rem',
};

const NAME_MAX = 40;
const msg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not work.');

/* ---- the header link: "Save" until this device has signed in, then the name ---- */
export function AccountLink() {
  const path = usePathname();
  const [label, setLabel] = useState('Save');
  useEffect(() => {
    if (!signedInHint()) return;               // an anonymous visitor makes no request
    let live = true;
    me().then((u) => { if (live && u) setLabel(u.displayName || 'My account'); }).catch(() => { /* stay quiet */ });
    return () => { live = false; };
  }, []);
  return <Link href="/account" aria-current={path === '/account' ? 'page' : undefined}>{label}</Link>;
}

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
    <div className="card">
      <h2>Delete a ledger you saved without an account</h2>
      <p>
        Pressing <strong>Save and share</strong> sends that ledger here so its link opens anywhere. You were given a
        delete code at the same moment. Paste the link and the code and it is gone from this site — no account, no email,
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
        <button type="button" className="btn ghost small" disabled={busy || !link.trim() || !code.trim()}
          data-testid="forget-save"
          onClick={async () => {
            setBusy(true); setErr(null); setDone(false);
            try { await forgetSavedJourney(slugFromLink(link), code); setDone(true); setLink(''); setCode(''); }
            catch (e) { setErr(msg(e)); } finally { setBusy(false); }
          }}>{busy ? 'Deleting…' : 'Delete that ledger'}</button>
      </div>
      <p className="micro">
        We keep only a scrambled form of the code, so nobody here can look yours up — not us, and not anyone who copies
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

  const [door, setDoor] = useState<Door>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [nameField, setNameField] = useState('');

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(passkeysSupported());
    let live = true;
    me().then((u) => { if (!live) return; setUser(u); setReady(true); })
      .catch(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  const act = useCallback(async (kind: string, fn: () => Promise<void>) => {
    setBusy(kind); setErr(null);
    try { await fn(); } catch (e) { setErr(msg(e)); } finally { setBusy(null); }
  }, []);

  if (user) {
    return (
      <AccountDashboard
        user={user}
        initialRecoveryCode={recoveryCode}
        onUser={(u) => { setUser(u); if (!u) { setRecoveryCode(null); setPassword(''); setCode(''); } }}
      />
    );
  }

  const pwLabel = door === 'signup' ? 'Choose a password (at least 10 characters)'
    : door === 'signin' ? 'Your password' : 'Your new password (at least 10 characters)';

  return (
    <section className="step survey">
      <div className="wrap narrow">
        <p className="eyebrow">Your account &middot; entirely optional</p>
        <h1>Keep my ledger on every device I use.</h1>
        <p className="sub">
          An account does one thing: the ledgers you save open on your phone, your laptop and the computer at the clinic.
          Nothing else about you is collected, and you can delete it, and everything in it, in two clicks.
        </p>

        {err && <div className="notice warn" role="alert"><p>{err}</p></div>}

        {/* Two doors, the same width: neither is the lesser one. auto-fit keeps
            them side by side on a laptop and stacks them on a phone. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(20rem,1fr))', gap: 'var(--sp-4)' }}>
          {/* ---- door one: a passkey ---- */}
          <div className="card">
            <h2>Continue with a passkey</h2>
            <p>
              Your face, your fingerprint or your screen lock instead of a password. Your device makes it and keeps it;
              there is nothing to remember, nothing to reuse and no email address to hand over.
            </p>
            <label className="field">
              <span>Display name (optional, up to {NAME_MAX} characters)</span>
              <input type="text" maxLength={NAME_MAX} value={nameField} placeholder="Blank is fine"
                onChange={(e) => setNameField(e.target.value)} disabled={!supported} />
            </label>
            <div className="step-actions">
              <button type="button" className="btn primary" disabled={busy !== null || !supported}
                onClick={() => act('passkey-new', async () => { setUser(await register(nameField.trim() || undefined)); })}>
                {busy === 'passkey-new' ? 'Waiting for your device…' : 'Create a passkey'} <Icon.Shield />
              </button>
              <button type="button" className="btn ghost" disabled={busy !== null || !supported}
                onClick={() => act('passkey-in', async () => { setUser(await login()); })}>
                {busy === 'passkey-in' ? 'Waiting for your device…' : 'Use my passkey'}
              </button>
            </div>
            {!supported && (
              <p className="micro">This browser does not offer passkeys. Use the email and password door beside this one &mdash; it works everywhere.</p>
            )}
          </div>

          {/* ---- door two: email and password ---- */}
          <div className="card">
            <h2>Email and password</h2>
            <div className="tabs" role="tablist" aria-label="Email and password">
              {([['signup', 'Create an account'], ['signin', 'Sign in'], ['recover', 'I forgot my password']] as [Door, string][]).map(([k, lab]) => (
                <button key={k} type="button" role="tab" aria-selected={door === k} className={door === k ? 'is-on' : ''}
                  onClick={() => { setDoor(k); setErr(null); }}>{lab}</button>
              ))}
            </div>

            <label className="field">
              <span>Email address</span>
              <input type="email" autoComplete="email" maxLength={120} style={FIELD} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>

            {door === 'recover' && (
              <label className="field">
                <span>Your ten-word recovery code</span>
                <input type="text" autoComplete="one-time-code" value={code} placeholder="ten words, in order" style={FIELD}
                  onChange={(e) => setCode(e.target.value)} />
              </label>
            )}

            <label className="field">
              <span>{pwLabel}</span>
              <input type={showPw ? 'text' : 'password'} value={password} style={FIELD}
                autoComplete={door === 'signin' ? 'current-password' : 'new-password'}
                onChange={(e) => setPassword(e.target.value)} />
            </label>
            <div className="check">
              <input id="showpw-in" type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
              <label htmlFor="showpw-in">Show what I am typing</label>
            </div>

            <div className="step-actions">
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
                  {busy === 'signin' ? 'Signing in…' : 'Sign in'}
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
              {door === 'signup' && 'You will get ten words to write down. They are the only way back in if the password goes — there is no reset email, because this site sends no mail.'}
              {door === 'signin' && 'Ten wrong tries on one address in an hour and it stops answering for the rest of the hour.'}
              {door === 'recover' && 'The ten words you wrote down when you made the account. Spaces, hyphens and capital letters do not matter.'}
            </p>
          </div>
        </div>

        <ForgetASave />

        <div className="card">
          <h2>What an account is, exactly</h2>
          <dl className="kv">
            <dt>Kept</dt><dd>A random account number, the ledgers you press save on — the lines you typed are stored here so the link opens on your other devices — and whichever way in you chose: the public half of a passkey, or an email address and a scrambled form of your password that cannot be turned back into it.</dd>
            <dt>Optional</dt><dd>A display name, only if you type one.</dd>
            <dt>Never kept</dt><dd>Your real name, your diagnosis, your IP address, a ledger you did not press save on, or any mailing list. This site sends no mail at all.</dd>
            <dt>Removable</dt><dd>Everything, from this page, whenever you want.</dd>
          </dl>
          {!ready && <p className="micro">Checking whether this device is already signed in&hellip;</p>}
        </div>

        <div className="step-actions">
          <Link className="btn ghost small" href="/ledger">Back to my ledger</Link>
          <Link className="btn ghost small" href="/privacy">What this site keeps</Link>
        </div>
      </div>
    </section>
  );
}
