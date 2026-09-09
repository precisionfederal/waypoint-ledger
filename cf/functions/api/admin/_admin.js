/* The one admin guard. Bearer ADMIN_TOKEN, never cached, never CORS.
   Every admin endpoint calls this first and returns its Response if it is not null. */
import { bad } from '../_http.js';
import { isAdmin } from '../_db.js';

export function requireAdmin(env, request) {
  return isAdmin(env, request) ? null : bad('Not authorised.', 401);
}
