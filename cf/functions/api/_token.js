/* ==========================================================================
   A one-off secret handed to a person once and never stored in readable form.

   Used for the delete code on an anonymously saved ledger. Only the SHA-256 of
   the code is kept, so a copy of this database does not let anybody delete
   other people's saves — and nobody here, including us, can read a code back to
   the person who lost it. The screen that shows it says exactly that.

   The alphabet drops i, l, o, 0 and 1, because this is a string people copy off
   a screen by hand.
   ========================================================================== */
import { timingSafeEqual } from './auth/password/_kdf.js';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const DELETE_TOKEN_LENGTH = 16;

/** A fresh code. 16 characters from an alphabet of 31 is about 79 bits. */
export function makeToken(n = DELETE_TOKEN_LENGTH) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Lower-cased, with spaces and hyphens forgiven: people retype these. */
export function normaliseToken(v) {
  if (typeof v !== 'string') return undefined;
  const t = v.toLowerCase().replace(/[^a-z0-9]/g, '');
  return t.length >= 8 && t.length <= 64 ? t : undefined;
}

export async function hashToken(token) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`journey-delete:${token}`));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time, so a wrong code cannot be walked one character at a time. */
export async function tokenMatches(token, storedHash) {
  const t = normaliseToken(token);
  if (!t || typeof storedHash !== 'string' || storedHash.length !== 64) return false;
  return timingSafeEqual(await hashToken(t), storedHash);
}
