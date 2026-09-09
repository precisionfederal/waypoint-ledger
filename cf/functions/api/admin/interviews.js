/* GET /api/admin/interviews — the written interviews, decrypted, newest first.
   Optional ?since=<ISO date>. This is the ONLY endpoint that can read an
   interview, and it is the reason the answers are encrypted at rest. */
import { json, bad, str } from '../_http.js';
import { all, decrypt } from '../_db.js';
import { requireAdmin } from './_admin.js';

export async function onRequestGet({ request, env }) {
  const stop = requireAdmin(env, request); if (stop) return stop;
  const since = str(new URL(request.url).searchParams.get('since'), 40);
  try {
    const rows = since
      ? await all(env, 'SELECT * FROM interviews WHERE received_at >= ?1 ORDER BY received_at DESC', since)
      : await all(env, 'SELECT * FROM interviews ORDER BY received_at DESC');
    const interviews = [];
    for (const r of rows) {
      let answers = {};
      try { answers = JSON.parse((await decrypt(env, r.answers_enc)) || '{}'); } catch { answers = {}; }
      interviews.push({
        id: r.id,
        consent: r.consent,
        name: r.consent === 'quote-by-name' ? await decrypt(env, r.name_enc) : null,
        answers,
        followUp: r.follow_up === 1,
        email: r.follow_up === 1 ? await decrypt(env, r.email_enc) : null,
        channel: r.channel || 'direct',
        receivedAt: r.received_at,
        reviewedAt: r.reviewed_at ?? null,
      });
    }
    return json({ ok: true, n: interviews.length, interviews });
  } catch { return bad('The interviews could not be read. Check that INTERVIEW_KEY is the key they were written with.', 500); }
}
