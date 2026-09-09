// D1 access + encryption at rest for the private fields. One definition.
import { id, now } from './_http.js';

export const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
export const one = async (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
export const run = async (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();

/** Insert a row from an object; keys are column names. Returns the id. */
export async function insert(env, table, row) {
  const r = { id: row.id || id(), ...row };
  if (!r.received_at && !r.created_at && table !== 'events') r.received_at = now();
  const cols = Object.keys(r); const q = cols.map((_, i) => `?${i + 1}`).join(',');
  await env.DB.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${q})`).bind(...cols.map((c) => r[c] ?? null)).run();
  return r.id;
}

/* ---- AES-GCM at rest. INTERVIEW_KEY is a base64 32-byte secret (wrangler pages secret put). ---- */
async function key(env) {
  if (!env.INTERVIEW_KEY) throw new Error('INTERVIEW_KEY is not set');
  const raw = Uint8Array.from(atob(env.INTERVIEW_KEY), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function encrypt(env, text) {
  if (text === undefined || text === null || text === '') return null;
  const k = await key(env); const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(String(text))));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function decrypt(env, blob) {
  if (!blob) return null;
  const [iv, ct] = blob.split('.'); const k = await key(env);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, k, unb64(ct)));
}

/* ---- sessions ---- */
export function cookieOf(request, name) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)); return m ? decodeURIComponent(m[1]) : null;
}
export async function userOf(env, request) {
  const sid = cookieOf(request, 'wl_session'); if (!sid) return null;
  const s = await one(env, 'SELECT s.user_id, s.expires_at, u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?1', sid);
  if (!s || s.expires_at < now()) return null;
  return { id: s.user_id, displayName: s.display_name };
}
export const SESSION_DAYS = 30;
export function sessionCookie(sid, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `wl_session=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}
export const clearCookie = () => 'wl_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
export function isAdmin(env, request) {
  const a = request.headers.get('authorization') || '';
  return Boolean(env.ADMIN_TOKEN) && a === `Bearer ${env.ADMIN_TOKEN}`;
}
