/* ==========================================================================
   Password and recovery-code plumbing. Not a route (leading _).

   A passkey is still the door we recommend, and the passkey routes are
   untouched. This exists because a passkey is not offered by every browser a
   person is handed at a library, a clinic or a shared family laptop, and a
   person who cannot make one was being told, in effect, that the ledger they
   built cannot follow them. Email and password is the door everyone already
   knows.

   Hashing lives in _kdf.js, because the Workers runtime refuses PBKDF2 above
   100,000 iterations and the first version of this file asked for 600,000 — so
   every sign-in threw at the edge while every test passed in Node. What is used
   now is five sequential 100,000-iteration passes, each feeding the next, and
   every stored hash carries the parameters it was made with.

   Everything here is pure except the two KV helpers at the bottom, so the rules
   can be tested directly (tests/password.test.ts).
   ========================================================================== */
import { COMMON_PASSWORDS } from './_common.js';
import { WORDS } from './_words.js';
import {
  hashPassword as kdfHashPassword, verifyPassword as kdfVerifyPassword,
  hashWithSalt, verifyWithSalt, needsRehash as kdfNeedsRehash,
  timingSafeEqual as kdfTimingSafeEqual,
  PBKDF2_ITERATIONS as KDF_ITERATIONS, PBKDF2_PASSES as KDF_PASSES,
  PBKDF2_HASH as KDF_HASH, RUNTIME_MAX_ITERATIONS as KDF_RUNTIME_MAX,
  SALT_BYTES as KDF_SALT_BYTES, KEY_BITS as KDF_KEY_BITS,
  DECOY_HASH as KDF_DECOY_HASH, DECOY_SALT as KDF_DECOY_SALT,
  parseHash, paramString,
} from './_kdf.js';

/* The derivation parameters are one definition, in _kdf.js, and are re-exported
   here so the routes and the tests keep one import. */
export const PBKDF2_ITERATIONS = KDF_ITERATIONS;
export const PBKDF2_PASSES = KDF_PASSES;
export const PBKDF2_HASH = KDF_HASH;
export const RUNTIME_MAX_ITERATIONS = KDF_RUNTIME_MAX;
export const SALT_BYTES = KDF_SALT_BYTES;
export const KEY_BITS = KDF_KEY_BITS;
export const DECOY_HASH = KDF_DECOY_HASH;
export const DECOY_SALT = KDF_DECOY_SALT;
export const KDF_PARAMS = paramString();

export const EMAIL_MAX = 120;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;   // bcrypt-style truncation traps do not apply to PBKDF2, but a body cap should exist
export const RECOVERY_WORDS = 10;  // 10 words from 2,048 = 110 bits
export const MAX_FAILURES_PER_HOUR = 10;

const COMMON = new Set(COMMON_PASSWORDS);

export const timingSafeEqual = kdfTimingSafeEqual;
export { parseHash };

/* ---- email ---- */
/** Lower-case, trimmed, length-capped. Returns undefined if it is not an address. */
export function normaliseEmail(v) {
  if (typeof v !== 'string') return undefined;
  const e = v.trim().toLowerCase();
  if (!e || e.length > EMAIL_MAX) return undefined;
  // Deliberately permissive: one @, something either side, a dot in the domain,
  // no spaces. Anything stricter refuses addresses that really exist.
  if (!/^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(e)) return undefined;
  return e;
}

/* ---- password rules ---- */
const LEET = { '@': 'a', '4': 'a', '8': 'b', '(': 'c', '3': 'e', '6': 'g', '1': 'i', '!': 'i', '|': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't', '2': 'z' };
const deleet = (s) => s.replace(/[@48(361!|0$57+2]/g, (c) => LEET[c] ?? c);
const stripTail = (s) => s.replace(/[^a-z]+$/, '');
const stripHead = (s) => s.replace(/^[^a-z]+/, '');
const lettersOnly = (s) => s.replace(/[^a-z]/g, '');

/** The rows people walk along when they are asked for ten characters. */
const RUNS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'abcdefghijklmnopqrstuvwxyz', '!@#$%^&*()'];
const reverse = (s) => [...s].reverse().join('');
const isRun = (s) => s.length >= 4 && RUNS.some((r) => r.includes(s) || reverse(r).includes(s));

/** Every form of a password we compare against the refusal list. Padding first,
 *  then the leet substitutions, because people do both: "P@ssword1!" is the
 *  entry "password" wearing a costume. */
export function passwordForms(pw) {
  const lower = String(pw).toLowerCase();
  const forms = new Set();
  for (const base of [lower, stripTail(lower), stripHead(lower), stripHead(stripTail(lower)), lettersOnly(lower)]) {
    for (const f of [base, deleet(base)]) {
      forms.add(f);
      forms.add(stripTail(f));
      forms.add(stripHead(f));
      forms.add(lettersOnly(f));
    }
  }
  forms.delete('');
  return [...forms];
}

/** A sentence a person can act on, or null when the password is allowed. */
export function passwordProblem(pw, email) {
  if (typeof pw !== 'string') return 'Choose a password.';
  if (pw.length < PASSWORD_MIN) return `A password needs at least ${PASSWORD_MIN} characters. Longer is better than complicated: three words you will remember beat one word with symbols in it.`;
  if (pw.length > PASSWORD_MAX) return `A password can be up to ${PASSWORD_MAX} characters.`;
  if (pw.trim() !== pw) return 'A password cannot start or end with a space.';
  if (/^(.)\1+$/.test(pw)) return 'That is one character repeated. Choose something else.';
  if (new Set(pw.toLowerCase()).size < 4) return 'That is the same few characters over and over. Choose something else.';
  if (isRun(pw.toLowerCase())) return 'That is a straight run along the keyboard — “1234567890” and “qwertyuiop” are guessed before anything else. Choose another.';
  const forms = passwordForms(pw);
  if (forms.some((f) => COMMON.has(f))) return 'That is one of the most common passwords on the internet, so it is one of the first ones guessed. Choose another.';
  if (email && forms.includes(String(email).split('@')[0].toLowerCase())) return 'That is your email address. Choose something else.';
  if (/^waypoint/i.test(pw)) return 'A password that starts with the name of the site is the first thing tried. Choose another.';
  return null;
}

/* ---- derivation (the rules live in _kdf.js) ---- */

/** { hash, salt } for the users row. hash carries its own parameters, so the
 *  work can be raised later without orphaning a single existing row. */
export const hashPassword = (password, env) => kdfHashPassword(password, env);

/** Never throws: a row this runtime cannot compute is a failed sign-in. */
export const verifyPassword = (password, storedHash, storedSalt) => kdfVerifyPassword(password, storedHash, storedSalt);

/** True when a row was written with parameters other than today's, so a
 *  successful sign-in can rewrite it. */
export const needsRehash = (storedHash, env) => kdfNeedsRehash(storedHash, env);

/* ---- recovery code ---- */
/** Ten words from 2,048. 2,048 divides 65,536 exactly, so a 16-bit draw taken
 *  modulo 2,048 is uniform — no rejection sampling and no bias. 110 bits. */
export function makeRecoveryCode() {
  const draws = crypto.getRandomValues(new Uint16Array(RECOVERY_WORDS));
  return Array.from(draws, (n) => WORDS[n % WORDS.length]).join(' ');
}

/** People retype these from paper: any run of spaces, hyphens, commas or new
 *  lines separates words, and case never matters. */
export function normaliseRecovery(code) {
  if (typeof code !== 'string') return undefined;
  const words = code.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.length === RECOVERY_WORDS ? words.join(' ') : undefined;
}

/** Self-contained: algorithm, parameters, salt and digest in one column. */
export async function hashRecovery(code, env) {
  const normal = normaliseRecovery(code);
  if (!normal) throw new Error('A recovery code is ten words.');
  return hashWithSalt(normal, env);
}

export async function verifyRecovery(code, stored) {
  const normal = normaliseRecovery(code);
  if (!normal) return false;
  return verifyWithSalt(normal, stored);
}

/* ---- throttling, per email address, in KV ----
   Ten wrong attempts on one address in one hour and that address stops
   answering for the rest of the hour. Keyed by a hash of the address so KV
   holds no email; the counter expires on its own. */
async function failKey(email) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pwfail:${email}`));
  const hex = Array.from(new Uint8Array(h)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pwfail:${new Date().toISOString().slice(0, 13)}:${hex}`;
}

export async function tooManyFailures(env, email) {
  try { return Number((await env.LEDGER.get(await failKey(email))) || 0) >= MAX_FAILURES_PER_HOUR; }
  catch { return false; }   // the throttle never becomes the reason a sign-in fails
}

export async function noteFailure(env, email) {
  try {
    const k = await failKey(email);
    const n = Number((await env.LEDGER.get(k)) || 0) + 1;
    await env.LEDGER.put(k, String(n), { expirationTtl: 3700 });
  } catch { /* best effort */ }
}

export async function clearFailures(env, email) {
  try { await env.LEDGER.delete(await failKey(email)); } catch { /* best effort */ }
}

/** The one sentence every failed sign-in gets, whatever actually went wrong:
 *  a wrong password and an address that was never registered read the same, so
 *  this endpoint cannot be used to find out who has an account here. */
export const SIGN_IN_FAILED = 'That email address and password do not match an account here.';
