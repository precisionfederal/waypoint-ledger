/* ==========================================================================
   auth-client — the browser half of signing in.

   The whole account is optional. A ledger works with no account at all; this
   exists only so the same ledger can be opened on another device.

   Two doors, and the person picks:
   - a passkey, which needs no email and no password at all; or
   - an email address and a password, because a passkey is not offered by every
     browser a person is handed at a library, a clinic or a shared laptop, and
     "your browser cannot do this" is not an answer to give someone who has just
     spent an hour building a ledger of their own care.

   There is no password-reset email, because there is no mail from this site:
   a ten-word recovery code is issued once instead, and only its hash is kept.

   Every call here is a plain fetch against /api/auth/* or /api/me. The only
   thing kept in this browser is a one-bit hint ("this device has signed in"),
   so an anonymous visitor never triggers a request to /api/me at all.
   ========================================================================== */
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

export interface MeUser {
  id: string;
  email: string | null;
  displayName: string | null;
  hasPasskey: boolean;
  hasPassword: boolean;
  createdAt: string;
}
export interface MyCorrection {
  id: string;
  priceId: string;
  verdict: 'right' | 'wrong';
  believedUsd: number | null;
  note: string | null;
  tableVersion: string | null;
  receivedAt: string;
}
/** What comes back once, and never again, when an account gains a password. */
export interface WithRecovery { user: MeUser; recoveryCode: string }
export interface SavedJourney {
  id: string;
  slug: string | null;
  title: string | null;
  entryCount: number;
  tableVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

const HINT = 'wl_signed_in';

/** Has this browser ever completed a passkey sign-in? Cheap, local, no request. */
export function signedInHint(): boolean {
  try { return localStorage.getItem(HINT) === '1'; } catch { return false; }
}
function setHint(on: boolean): void {
  try { if (on) localStorage.setItem(HINT, '1'); else localStorage.removeItem(HINT); } catch { /* private mode */ }
}

/** Does this browser do passkeys at all? Safe to call only in the browser. */
export function passkeysSupported(): boolean {
  try { return browserSupportsWebAuthn(); } catch { return false; }
}

async function api<T extends object>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init });
  let parsed: unknown;
  try { parsed = await res.json(); } catch { throw new Error('The server did not answer.'); }
  const body = (parsed ?? {}) as Record<string, unknown>;
  if (body.ok !== true) throw new Error(typeof body.error === 'string' ? body.error : 'That did not work.');
  return body as T;
}
const postJson = <T extends object>(path: string, payload?: unknown) =>
  api<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload ?? {}) });

/** Turn a WebAuthn failure into a sentence a person can act on. */
function passkeyError(e: unknown): Error {
  const err = e as { name?: string; code?: string; message?: string; cause?: { name?: string } };
  const name = err?.cause?.name || err?.name || '';
  if (name === 'NotAllowedError' || name === 'AbortError') return new Error('The passkey prompt was closed. Nothing was saved.');
  if (name === 'InvalidStateError') return new Error('This device already has a passkey for Waypoint Ledger. Choose “Use my passkey” instead.');
  if (name === 'SecurityError') return new Error('Passkeys need a secure connection (https) on this address.');
  return new Error(typeof err?.message === 'string' && err.message ? err.message : 'The passkey could not be used on this device.');
}

/** Create a passkey on this device and sign in with it. */
export async function register(displayName?: string): Promise<MeUser> {
  const start = await postJson<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>(
    '/api/auth/register/options', displayName ? { displayName } : {});
  let response;
  try { response = await startRegistration({ optionsJSON: start.options }); }
  catch (e) { throw passkeyError(e); }
  await postJson<{ user: { id: string } }>('/api/auth/register/verify', { challengeId: start.challengeId, response });
  setHint(true);
  return whoAmI();
}

/** Sign in with whatever passkey this device already holds for the site. */
export async function login(): Promise<MeUser> {
  const start = await postJson<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }>('/api/auth/login/options');
  let response;
  try { response = await startAuthentication({ optionsJSON: start.options }); }
  catch (e) { throw passkeyError(e); }
  await postJson<{ user: { id: string } }>('/api/auth/login/verify', { challengeId: start.challengeId, response });
  setHint(true);
  return whoAmI();
}

/** The profile after a sign-in, from the one endpoint that knows all of it. */
async function whoAmI(): Promise<MeUser> {
  const user = await me();
  if (!user) throw new Error('The sign-in did not stick on this browser. Check that cookies are allowed for this site.');
  return user;
}

/* ---------------- email and password ---------------- */

/** Create an account. The recovery code comes back once and is never sent again. */
export async function signUpWithPassword(email: string, password: string, displayName?: string): Promise<WithRecovery> {
  const r = await postJson<WithRecovery>('/api/auth/password/signup',
    { email, password, ...(displayName ? { displayName } : {}) });
  setHint(true);
  return { user: r.user, recoveryCode: r.recoveryCode };
}

export async function signInWithPassword(email: string, password: string): Promise<MeUser> {
  const r = await postJson<{ user: MeUser }>('/api/auth/password/login', { email, password });
  setHint(true);
  return r.user;
}

/** The way back in: the ten-word code sets a new password and issues a new code. */
export async function recoverWithCode(email: string, code: string, newPassword: string): Promise<WithRecovery> {
  const r = await postJson<WithRecovery>('/api/auth/password/recover', { email, code, newPassword });
  setHint(true);
  return { user: r.user, recoveryCode: r.recoveryCode };
}

/** Change a password, or give a passkey-only account an email and a password. */
export async function changePassword(input: { currentPassword?: string; newPassword: string; email?: string }): Promise<WithRecovery> {
  const r = await postJson<WithRecovery>('/api/auth/password/change', input);
  return { user: r.user, recoveryCode: r.recoveryCode };
}

/** Put a second passkey on the device you are signed in on right now.
 *  Same endpoint: with a session, the new credential joins the account. */
export const addPasskey = (): Promise<MeUser> => register();

export async function logout(): Promise<void> {
  try { await postJson('/api/auth/logout'); } finally { setHint(false); }
}

/** Who this browser is, or null. */
export async function me(): Promise<MeUser | null> {
  const r = await api<{ user: MeUser | null }>('/api/me');
  setHint(Boolean(r.user));
  return r.user;
}

export async function setName(displayName: string | null): Promise<MeUser> {
  const r = await api<{ user: MeUser }>('/api/me', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName }),
  });
  return r.user;
}

/** Erase the account, its passkeys, its sessions and its saved ledgers. */
export async function eraseAccount(): Promise<void> {
  try { await api('/api/me', { method: 'DELETE' }); } finally { setHint(false); }
}

export async function myJourneys(): Promise<SavedJourney[]> {
  const r = await api<{ journeys: SavedJourney[] }>('/api/me/journeys');
  return r.journeys;
}

/** The corrections this person sent to the public register while signed in. */
export async function myCorrections(): Promise<MyCorrection[]> {
  const r = await api<{ corrections: MyCorrection[] }>('/api/me/corrections');
  return r.corrections;
}

/** Rename a saved ledger. The lines are read back and written unchanged: the
 *  endpoint that renames is the same one that saves, so it wants the whole
 *  ledger, and inventing an empty one here would quietly delete a person's work. */
export async function renameJourney(idOrSlug: string, title: string): Promise<void> {
  const current = await api<{ entries: unknown[]; title: string | null; id: string }>(`/api/journeys/${encodeURIComponent(idOrSlug)}`);
  await api(`/api/journeys/${encodeURIComponent(current.id)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entries: current.entries, title }),
  });
}

export async function deleteJourney(id: string): Promise<void> {
  await api(`/api/journeys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ---------------- a save made without an account ----------------
   Most people here never sign in, and until now a ledger they saved could not
   be taken back by anybody: DELETE wanted a session they did not have. The save
   hands back a 16-character code once; this is the door it opens. It needs no
   account, no cookie and no email, and it works from any device. */
export async function forgetSavedJourney(slugOrId: string, deleteToken: string): Promise<void> {
  const code = deleteToken.trim();
  if (!code) throw new Error('Paste the delete code you were shown when you saved the ledger.');
  await api(`/api/journeys/${encodeURIComponent(slugOrId.trim())}`, {
    method: 'DELETE', headers: { 'content-type': 'application/json', 'x-delete-token': code },
  });
}
