/* ==========================================================================
   The key-derivation function, on its own, because the platform has an opinion
   about it. Not a route (leading _).

   The Workers runtime refuses PBKDF2 above 100,000 iterations: WebCrypto throws
   NotSupportedError ("Pbkdf2 failed: iteration counts above 100000 are not
   supported"), the request dies, and the edge answers 1101. Node has no such
   ceiling, and neither does `wrangler dev --local`, so a test suite and a local
   server will both tell you 600,000 iterations are fine while the deployed site
   answers HTTP 500 to every sign-in. That is exactly what happened here: the
   password door was written, tested green 21 times, deployed, and was dead on
   the public origin from the first day.

   So the work is stacked instead of stretched. One pass is 100,000 iterations —
   the platform maximum. The output of each pass becomes the salt of the next,
   five times, and the five are sequential, so an attacker cannot skip any of
   them: 500,000 iterations of work inside a ceiling of 100,000 per call.

   Every hash string carries its own parameters — `pbkdf2-sha256$100000x5$…` —
   so verification reads what the row was made with instead of assuming today's
   constants. A row written before this file existed reads as `$600000$` with no
   pass count, still parses, and is treated as one pass; `needsRehash()` marks it
   so a successful sign-in quietly rewrites it with the current parameters. No
   row is ever orphaned by a change here.

   Nothing in this file throws. A row whose parameters this runtime cannot
   compute is a failed sign-in, never a 500.
   ========================================================================== */

export const KDF_ALG = 'pbkdf2-sha256';
export const PBKDF2_HASH = 'SHA-256';

/** The ceiling workerd enforces. Above this, crypto.subtle throws. */
export const RUNTIME_MAX_ITERATIONS = 100000;

/** What new rows are written with. Five sequential passes = 500,000 iterations
 *  of work. Measured in workerd at roughly 7 ms a pass, so ~37 ms of CPU per
 *  sign-in — inside the Workers Paid ceiling of 30 s, over the Free plan's
 *  10 ms. If this project is ever on Free, PBKDF2_PASSES drops to 1 and the
 *  hash string records that, so existing rows keep verifying either way. */
export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_PASSES = 5;

/** The one lever for the one thing measurement cannot settle from here.

    Five passes cost about 40 ms of CPU, measured through `wrangler pages dev`
    on this machine: a login answered in 46 ms end to end and an empty-password
    refusal, which does no derivation at all, in 3 ms. That fits the Workers
    PAID ceiling of 30 s with room to spare and does NOT fit the FREE plan's
    10 ms per request — and no PBKDF2 setting worth having does, so on Free the
    honest configuration is passkeys only.

    KDF_PASSES as a Pages environment variable moves this without a code change,
    clamped to 1..5 so a typo can only ever ask for work we already trust. Every
    hash records the number it was made with, so rows written at either setting
    keep verifying after a change. */
export function passesFor(env) {
  const raw = Number(env && env.KDF_PASSES);
  if (!Number.isInteger(raw) || raw < 1) return PBKDF2_PASSES;
  return Math.min(raw, PBKDF2_PASSES);
}

export const SALT_BYTES = 16;
export const KEY_BITS = 256;
const MIN_ITERATIONS = 1000;
const MAX_PASSES = 50;

/* ---- base64 (Workers has no Buffer) ---- */
export const b64 = (u8) => btoa(String.fromCharCode(...u8));
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* The window a secret of unknown length is compared over. Wider than any token
   this site issues, so the loop count never depends on what was sent. */
const COMPARE_WINDOW = 512;

/** Same string, no early exit, and no early exit on LENGTH either.

    timingSafeEqual below is for two base64 digests, which are the same length
    by construction, so returning false on a length mismatch costs nothing
    there. A bearer token is different: the attacker chooses the length, and a
    compare that returns immediately when it is wrong hands back "how long is
    the real one" for free. This one always runs COMPARE_WINDOW iterations and
    folds the length difference into the same accumulator, so neither the length
    nor the position of the first wrong character can be read off the clock.

    charCodeAt past the end is NaN, and NaN | 0 is 0, so both strings read as
    zero beyond their end and the length XOR is what separates "equal" from
    "equal prefix, different length". */
export function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < COMPARE_WINDOW; i += 1) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

/** Same string, no early exit. Both sides are base64 of a fixed-length digest. */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** "100000x5" -> { iterations, passes }. "600000" -> one pass. Null if it is
 *  not a parameter string we are willing to run. */
export function parseParams(spec) {
  if (typeof spec !== 'string') return null;
  const m = /^(\d{1,9})(?:x(\d{1,3}))?$/.exec(spec);
  if (!m) return null;
  const iterations = Number(m[1]);
  const passes = m[2] === undefined ? 1 : Number(m[2]);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) return null;
  if (!Number.isInteger(passes) || passes < 1 || passes > MAX_PASSES) return null;
  return { iterations, passes };
}

/** The parameter string a row is written with today. */
export const paramString = (iterations = PBKDF2_ITERATIONS, passes = PBKDF2_PASSES) =>
  (passes === 1 ? String(iterations) : `${iterations}x${passes}`);

/** True when this runtime will refuse to compute these parameters at all. */
export const beyondRuntime = (p) => !p || p.iterations > RUNTIME_MAX_ITERATIONS;

/** Stacked PBKDF2. Pass one uses the stored salt; each later pass uses the
 *  previous 256-bit output as its salt, so the passes cannot be parallelised.
 *  The imported key is reused, which is the cheap half of the operation. */
export async function deriveBits(password, salt, iterations, passes) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  let current = salt instanceof Uint8Array ? salt : new Uint8Array(salt);
  let out = null;
  for (let i = 0; i < passes; i += 1) {
    out = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: PBKDF2_HASH, salt: current, iterations }, key, KEY_BITS));
    current = out;
  }
  return out;
}

/** Base64 of the stacked digest, or null when this runtime cannot compute it. */
export async function derive(password, salt, iterations, passes) {
  try { return b64(await deriveBits(password, salt, iterations, passes)); }
  catch { return null; }   // a ceiling, a bad salt, anything: never a thrown 500
}

/* ---- password rows: hash in one column, salt in another ---- */

/** { hash, salt } for a users row, written with today's parameters. */
export async function hashPassword(password, env) {
  const passes = passesFor(env);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const digest = await derive(password, salt, PBKDF2_ITERATIONS, passes);
  if (digest === null) throw new Error('This server cannot compute a password hash right now.');
  return { hash: `${KDF_ALG}$${paramString(PBKDF2_ITERATIONS, passes)}$${digest}`, salt: b64(salt) };
}

/** { alg, iterations, passes, digest } or null. */
export function parseHash(storedHash) {
  if (typeof storedHash !== 'string') return null;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== KDF_ALG) return null;
  const p = parseParams(parts[1]);
  if (!p) return null;
  return { alg: parts[0], iterations: p.iterations, passes: p.passes, digest: parts[2] };
}

export async function verifyPassword(password, storedHash, storedSalt) {
  const p = parseHash(storedHash);
  if (!p || typeof storedSalt !== 'string') return false;
  let salt;
  try { salt = unb64(storedSalt); } catch { return false; }
  const digest = await derive(password, salt, p.iterations, p.passes);
  if (digest === null) return false;
  return timingSafeEqual(digest, p.digest);
}

/** True when the row was written with parameters other than today's — including
 *  a row this runtime cannot compute at all. A sign-in that succeeds on an old
 *  row rewrites it; a row that cannot be computed never succeeds, and its owner
 *  is told to use the recovery code. */
export function needsRehash(storedHash, env) {
  const p = parseHash(storedHash);
  if (!p) return true;
  return p.iterations !== PBKDF2_ITERATIONS || p.passes !== passesFor(env);
}

/* ---- recovery rows: everything in one column ---- */

export async function hashWithSalt(secret, env) {
  const passes = passesFor(env);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const digest = await derive(secret, salt, PBKDF2_ITERATIONS, passes);
  if (digest === null) throw new Error('This server cannot compute a hash right now.');
  return `${KDF_ALG}$${paramString(PBKDF2_ITERATIONS, passes)}$${b64(salt)}$${digest}`;
}

export async function verifyWithSalt(secret, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== KDF_ALG) return false;
  const p = parseParams(parts[1]);
  if (!p) return false;
  let salt;
  try { salt = unb64(parts[2]); } catch { return false; }
  const digest = await derive(secret, salt, p.iterations, p.passes);
  if (digest === null) return false;
  return timingSafeEqual(digest, parts[3]);
}

/* ---- the decoy ----
   An address with no account is checked against this row, so a sign-in that
   fails because nobody has that address costs the same work as one that fails
   on a wrong password. It carries today's parameters for exactly that reason:
   a decoy cheaper than a real row is a timing oracle for "does this address
   exist here". */
export const DECOY_SALT = `${'A'.repeat(22)}==`;                       // 16 zero bytes
export const DECOY_HASH = `${KDF_ALG}$${paramString()}$${'A'.repeat(43)}=`;  // 32 zero bytes
