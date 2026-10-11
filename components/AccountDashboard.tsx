'use client';

/* ==========================================================================
   The signed-in half of /account.

   Three things a person should be able to see about themselves here, and
   nothing else exists to show: the ledgers they saved, what they have told the
   government from this browser, and the two ways back in. Everything is
   removable from this page, including the account itself.
   ========================================================================== */

import Link from '@/components/IntentLink';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icons';
import { Caveat, trust as s } from './trust/Kit';
import { TABLE } from '@/lib/table';
import {
  addPasskey, changePassword, deleteJourney, eraseAccount, logout, me, myCorrections,
  myJourneys, passkeysSupported, renameJourney, setName as saveDisplayName,
  type ErasedCounts, type MeUser, type MyCorrection, type SavedJourney,
} from '@/lib/auth-client';
import a from './AccountDashboard.module.css';
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
const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const labelOf = (priceId: string) => TABLE.find((i) => i.id === priceId)?.label ?? priceId;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A saved ledger with no title is named by when it was saved, to the minute, so
 *  two saves on one day can be told apart; never "Untitled". */
export function ledgerTitle(j: Pick<SavedJourney, 'title' | 'createdAt'>): string {
  if (j.title && j.title.trim()) return j.title;
  const d = new Date(j.createdAt);
  if (Number.isNaN(d.getTime())) return 'Ledger saved without a name';
  return `Ledger saved ${d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

/** "2026-09-09.1" is the price table's own version id; a person reads its date. */
export function tableVersionText(v: string | null): string {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return `priced with federal table ${v}`;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `priced with the federal figures of ${d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}`;
}

/** The sentence a person reads after erasing their account, built only from what
 *  DELETE /api/me returned (cf/functions/api/me.js: removed = { journeys,
 *  passkeys, corrections }) and from what the account held a moment before. A
 *  count the server could not read is said so, never shown as zero. */
export function erasedSentence(user: Pick<MeUser, 'email' | 'hasPassword'>, c: ErasedCounts | null): string {
  const parts: string[] = [];
  if (user.email) parts.push(user.hasPassword ? 'your email address and password' : 'your email address');
  if (!c) return `Your account is erased${parts.length ? `, with ${parts[0]}` : ''}. Its saved ledgers went with it.`;
  if (c.passkeys === null) parts.push('its passkeys');
  else if (c.passkeys > 0) parts.push(plural(c.passkeys, 'passkey', 'passkeys'));
  parts.push(c.journeys === null ? 'its saved ledgers' : c.journeys === 0 ? 'no saved ledgers' : plural(c.journeys, 'saved ledger', 'saved ledgers'));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  let out = `Your account is erased: ${list}.`;
  if (c.journeys === null || c.journeys > 0) out += ' Their links no longer open, for you or for anyone you sent them to.';
  if (c.corrections !== null && c.corrections > 0) {
    out += ` The ${plural(c.corrections, 'correction', 'corrections')} you sent ${c.corrections === 1 ? 'stays' : 'stay'} in the public register, no longer linked to you.`;
  }
  return out;
}

/* ---------------- the code that is shown once ---------------- */

export function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="notice" role="status">
      <p><strong>Write this down before you leave this page.</strong> These ten words are the only way back into your account if you forget your password. There is no reset email from this site, because this site holds no mailbox for you.</p>
      <p style={{ fontFamily: 'var(--font-m)', fontSize: '1.05rem', lineHeight: 1.7, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '.85rem 1rem', margin: '.6rem 0', wordSpacing: '.3rem' }} data-testid="recovery-code">
        {code}
      </p>
      <div className="step-actions">
        <button type="button" className="btn ghost small" onClick={async () => {
          try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setCopied(false); }
        }}>{copied ? 'Copied' : 'Copy the words'}</button>
        <button type="button" className="btn primary small" onClick={onDone}>I have written it down</button>
      </div>
      <p className="micro">
        We keep only a scrambled form of these words, so nobody here can read them back to you: not us, and not anyone who ever
        copies this database. If you lose them, change your password on this page while you are still signed in: a fresh set comes with it.
      </p>
    </div>
  );
}

/* ---------------- saved ledgers ---------------- */

export function AccountJourneys({ compact = false }: { compact?: boolean }) {
  const [rows, setRows] = useState<SavedJourney[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  /* Signed out is not an error: /account/journeys is a page a person reaches
     from a bookmark or another device. A red "Sign in first." alert with no
     way to sign in was the old answer; this asks who it is first. */
  const load = useCallback(async () => {
    try { setRows(await myJourneys()); setSignedOut(false); }
    catch (e) {
      const u = await me().catch(() => undefined);
      if (u === null) { setSignedOut(true); setRows([]); return; }
      setErr(msg(e)); setRows([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function doRename(j: SavedJourney) {
    const title = draft.trim();
    if (!title) { setRenaming(null); return; }
    setBusy(true); setErr(null);
    try { await renameJourney(j.slug ?? j.id, title); setRenaming(null); await load(); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  async function doDelete(j: SavedJourney) {
    setBusy(true); setErr(null);
    try { await deleteJourney(j.id); setConfirmDelete(null); await load(); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  const shown = compact && rows ? rows.slice(0, 4) : rows;

  if (signedOut) {
    return (
      <div className={`signed-out ${a.out}`} data-testid="journeys-signed-out">
        <Spot art={ART.account} className={a.outSpot} />
        <h2>Sign in to see the ledgers you saved</h2>
        <p>Saved ledgers belong to an account, so they show here once this browser is signed in. A ledger you have not saved is still on this device, in My ledger.</p>
        <div className="step-actions">
          <Link className="btn primary" href="/account">Sign in</Link>
          <Link className="btn ghost" href="/ledger">Open my ledger</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {err && <div className="notice warn" role="alert"><p>{err}</p></div>}
      {rows === null && <p className="micro">Reading your saved ledgers&hellip;</p>}
      {rows !== null && rows.length === 0 && (
        <p>
          None saved yet. Your ledger is kept in this browser until you save it. Open it and press <strong>Save across devices</strong>: that is the one action that sends your
          lines to this site, and it is what makes the link open on any device you sign in on. Nothing is sent until you press it.
        </p>
      )}
      {shown && shown.length > 0 && (
        <div className={`acts ${a.ledgers}`}>
          {shown.map((j) => (
            <article className={`act-card ${a.ledger}`} key={j.id}>
              <span className={a.ledgerIcon} aria-hidden="true"><Icon.Sheet /></span>
              <div className={a.ledgerMain}>
                <p className="who">{dateOf(j.updatedAt)}</p>
                {renaming === j.id ? (
                  <label className="field">
                    <span>Name this ledger</span>
                    <input type="text" maxLength={120} value={draft} autoFocus
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void doRename(j); if (e.key === 'Escape') setRenaming(null); }} />
                  </label>
                ) : (
                  <h3>{ledgerTitle(j)}</h3>
                )}
                {j.tableVersion && <p className={a.version}>{tableVersionText(j.tableVersion)[0].toUpperCase() + tableVersionText(j.tableVersion).slice(1)}</p>}
              </div>
              <p className={a.lines}><span className={a.linesN}>{j.entryCount}</span> {j.entryCount === 1 ? 'line' : 'lines'}</p>
              {confirmDelete === j.id ? (
                <div className={`notice warn ${a.confirm} ${a.ledgerActs}`}>
                  <p>Delete this ledger? Its share link stops working for anyone who has it.</p>
                  <div className="step-actions">
                    <button type="button" className={`btn small ${a.dangerFill}`} disabled={busy} onClick={() => void doDelete(j)}>Yes, delete it</button>
                    <button type="button" className="btn ghost small" disabled={busy} onClick={() => setConfirmDelete(null)}>Keep it</button>
                  </div>
                </div>
              ) : (
                <div className={`row ${a.acts} ${a.ledgerActs}`}>
                  {j.slug && <Link className="btn ghost small" href={`/ledger?s=${j.slug}`}>Open <Icon.Arrow /></Link>}
                  {renaming === j.id ? (
                    <button type="button" className="btn primary small" disabled={busy} onClick={() => void doRename(j)}>Save the name</button>
                  ) : (
                    <button type="button" className="btn ghost small" aria-label={`Rename ${ledgerTitle(j)}`} onClick={() => { setRenaming(j.id); setDraft(j.title ?? ''); }}>Rename</button>
                  )}
                  <button type="button" className={`btn ghost small ${a.danger}`} aria-label={`Delete ${ledgerTitle(j)}`} onClick={() => setConfirmDelete(j.id)}>Delete</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {compact && rows && rows.length > 4 && (
        <p className="micro" style={{ marginTop: 'var(--sp-3)' }}>
          <Link href="/account/journeys">See all {rows.length} saved ledgers</Link>
        </p>
      )}
    </>
  );
}

/* ---------------- what this person has told the government ---------------- */

function MyCorrections() {
  const [rows, setRows] = useState<MyCorrection[] | null>(null);
  useEffect(() => { myCorrections().then(setRows).catch(() => setRows([])); }, []);
  if (rows === null) return <p className="micro">Reading what you have sent&hellip;</p>;
  if (rows.length === 0) {
    return (
      <p>
        Nothing yet. Every line in your ledger carries a thumb: press it when a published figure does or does not describe what you
        were charged, and it lands in the <Link href="/register">public register</Link> against that exact federal row. Sent while
        you are signed in, it is listed here so you can see your own contribution.
      </p>
    );
  }
  return (
    <div className="table-card card" style={{ padding: 0 }}>
      <div className="table-scroll" tabIndex={0}>
        <table className="ledger-table">
          <caption className="sr-only">Corrections you have sent, newest first</caption>
          <thead>
            <tr><th scope="col">The federal figure</th><th scope="col">What you said</th><th scope="col">Sent</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/register#c-${c.priceId}`}>{labelOf(c.priceId)}</Link><div className="micro" style={{ margin: 0 }}>{c.priceId}</div></td>
                <td>
                  {c.verdict === 'right' ? 'It describes what I was charged' : 'It does not describe what I was charged'}
                  {c.believedUsd !== null && <div className="micro" style={{ margin: 0 }}>You said ${c.believedUsd.toLocaleString()}</div>}
                  {c.note && <div className="micro" style={{ margin: 0 }}>&ldquo;{c.note}&rdquo;</div>}
                </td>
                <td>{dateOf(c.receivedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- the page ---------------- */

export default function AccountDashboard({ user, onUser, initialRecoveryCode = null }: {
  user: MeUser;
  /** `erased` is the sentence to show once the account is gone (set only by Delete). */
  onUser: (u: MeUser | null, erased?: string) => void;
  initialRecoveryCode?: string | null;
}) {
  const [code, setCode] = useState<string | null>(initialRecoveryCode);
  const [nameField, setNameField] = useState(user.displayName ?? '');
  const [emailField, setEmailField] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const supported = typeof window !== 'undefined' && passkeysSupported();

  useEffect(() => { setCode(initialRecoveryCode); }, [initialRecoveryCode]);

  async function act(kind: string, fn: () => Promise<void>) {
    setBusy(kind); setErr(null); setNote(null);
    try { await fn(); } catch (e) { setErr(msg(e)); } finally { setBusy(null); }
  }

  const who = user.displayName || user.email || 'your passkey';

  return (
    <section className="page">
      <div className="wrap">
        <div className={a.who}>
          <span className={a.avatar} aria-hidden="true">{(user.displayName || user.email || '').trim().charAt(0).toUpperCase() || <Icon.Shield />}</span>
          <div>
            <p className="eyebrow">Your account</p>
            <h1>Signed in as {who}.</h1>
          </div>
        </div>
        <p className={s.lead}>
          Your ledgers open on any device you sign in on. Everything else about you is still nothing:
          no diagnosis, no journey you did not save, no tracking, and no mail from this site.
        </p>

        {err && <div className="notice warn" role="alert"><p>{err}</p></div>}
        {note && <div className="notice" role="status"><p>{note}</p></div>}
        {code && <RecoveryCode code={code} onDone={() => setCode(null)} />}

        <div className={s.dash}>
        <div className={s.dashMain}>
        <div className="card">
          <h2>Your ledgers</h2>
          <AccountJourneys compact />
        </div>

        <div className="card">
          <h2>What I have flagged</h2>
          <p className="micro">
            Corrections go to the public register with the federal row they are about, and nothing that identifies you.
            This list is the private copy of your own.
          </p>
          <MyCorrections />
        </div>
        </div>
        <div className={s.dashSide}>

        <div className="card">
          <h2>How you sign in</h2>
          <dl className="kv">
            <dt>Email</dt><dd>{user.email ?? 'None. This account signs in with a passkey.'}</dd>
            <dt>Password</dt><dd>{user.hasPassword ? 'Set.' : 'None yet.'}</dd>
            <dt>Passkey</dt><dd>{user.hasPasskey ? 'On at least one device.' : 'None yet.'}</dd>
            <dt>Since</dt><dd>{dateOf(user.createdAt)}</dd>
          </dl>

          <label className="field" style={{ marginTop: 'var(--sp-4)' }}>
            <span>Display name (optional, shown only back to you)</span>
            <input type="text" maxLength={NAME_MAX} value={nameField} placeholder="Blank is fine"
              onChange={(e) => setNameField(e.target.value)} />
          </label>
          <div className="step-actions">
            <button type="button" className="btn ghost small" disabled={busy !== null} onClick={() => act('name', async () => {
              const u = await saveDisplayName(nameField.trim() || null);
              onUser(u); setNote(u.displayName ? 'Saved.' : 'Your display name is cleared.');
            })}>{busy === 'name' ? 'Saving…' : 'Save this name'}</button>
          </div>

          <h3 style={{ marginTop: 'var(--sp-5)' }}>{user.hasPassword ? 'Change your password' : 'Add an email address and a password'}</h3>
          <p className="micro">
            {user.hasPassword
              ? 'Changing it signs out every other device and issues a new recovery code.'
              : 'So you can also sign in on a browser that does not do passkeys: a library computer, a work laptop, a phone you borrowed. The address is used for nothing else; this site sends no mail.'}
          </p>
          {!user.email && (
            <label className="field">
              <span>Email address</span>
              <input type="email" autoComplete="email" maxLength={120} style={FIELD} value={emailField} onChange={(e) => setEmailField(e.target.value)} />
            </label>
          )}
          {user.hasPassword && (
            <label className="field">
              <span>Current password</span>
              <input type={showPw ? 'text' : 'password'} autoComplete="current-password" style={FIELD} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>New password (at least 10 characters)</span>
            <input type={showPw ? 'text' : 'password'} autoComplete="new-password" style={FIELD} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </label>
          <div className="check">
            <input id="showpw" type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
            <label htmlFor="showpw">Show what I am typing</label>
          </div>
          <div className="step-actions">
            <button type="button" className="btn ghost small" disabled={busy !== null} onClick={() => act('pw', async () => {
              const r = await changePassword({
                ...(user.hasPassword ? { currentPassword: currentPw } : {}),
                ...(user.email ? {} : { email: emailField.trim() }),
                newPassword: newPw,
              });
              onUser(r.user); setCode(r.recoveryCode); setCurrentPw(''); setNewPw('');
              setNote(user.hasPassword ? 'Your password is changed, and every other device is signed out.' : 'You can now sign in with your email address and password as well as your passkey.');
            })}>{busy === 'pw' ? 'Saving…' : (user.hasPassword ? 'Change my password' : 'Add this password')}</button>
          </div>

          <h3 style={{ marginTop: 'var(--sp-5)' }}>A passkey on this device</h3>
          <p className="micro">
            A passkey is your face, your fingerprint or your screen lock instead of a password. Most travel with your phone or your
            password manager; adding one here joins it to this same account and the same ledgers.
          </p>
          <div className="step-actions">
            <button type="button" className="btn ghost small" disabled={busy !== null || !supported} onClick={() => act('add', async () => {
              const u = await addPasskey(); onUser(u);
              setNote('This device has its own passkey now. It signs in to the same account and the same saved ledgers.');
            })}>{busy === 'add' ? 'Waiting for your device…' : 'Add a passkey on this device'}</button>
          </div>
          {!supported && <p className="micro">This browser does not offer passkeys. Your email address and password work here as they are.</p>}
        </div>

        <div className="card">
          <h2>Leaving</h2>
          <Caveat label="Sign out">Signing out ends the session on this device only.</Caveat>
          <Caveat label="Delete">Deleting removes the account itself: the passkeys, the password,
            the email address and every ledger saved to it, and the answer says how many of each went.</Caveat>
          <Caveat label="Corrections stay">Corrections you already sent
            stay in the public register, because other people&rsquo;s counts are built on them, but the link back to you is cut, and
            nothing here can say who sent them again.</Caveat>
          <Caveat label="This browser">Whatever is stored in this browser stays in this browser either way, and a
            ledger you saved anonymously before you made this account is not reached from here: it carries its own delete code.</Caveat>
          <div className="step-actions">
            <button type="button" className="btn ghost small" disabled={busy !== null} onClick={() => act('out', async () => {
              await logout(); onUser(null);
            })}>{busy === 'out' ? 'Signing out…' : 'Sign out on this device'}</button>
          </div>
          {!confirmErase ? (
            <p><button type="button" className="link-btn danger" disabled={busy !== null} onClick={() => setConfirmErase(true)}>Delete my account and everything in it</button></p>
          ) : (
            <div className={`notice warn ${a.erase}`} data-testid="erase-confirm">
              <p className={a.eraseHead}><span className={a.eraseIcon} aria-hidden="true"><Icon.Info /></span><strong>This cannot be undone, and there is nothing to recover it with.</strong></p>
              <div className="step-actions">
                <button type="button" className={`btn small ${a.dangerFill}`} disabled={busy !== null} onClick={() => act('erase', async () => {
                  const removed = await eraseAccount(); onUser(null, erasedSentence(user, removed));
                })}>{busy === 'erase' ? 'Erasing…' : 'Yes, erase it'}</button>
                <button type="button" className="btn ghost small" disabled={busy !== null} onClick={() => setConfirmErase(false)}>Keep it</button>
              </div>
            </div>
          )}
        </div>
        </div>
        </div>

        <p className="micro">What this site keeps, in full: <Link href="/privacy">Privacy</Link>.</p>
      </div>
    </section>
  );
}
