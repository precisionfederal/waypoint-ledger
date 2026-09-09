/* ==========================================================================
   THE GATE AN OUTSIDER RUNS HAS TO BE ABLE TO COME BACK GREEN — AND RED.

   Round 4's finding was not that a check was missing. It was that the only
   check proving an INSERT reaches D1 asked for ADMIN_TOKEN, and /adopt invites
   an agency to run that script. They can never hold our secret, so every run
   anyone outside this laptop could make ended `28 ok, 1 failed`, structurally,
   on the page that asks them to trust us. Round 3's rule stands — a skip must
   never print `ok` — so the answer could not be to soften the skip. The answer
   is a different proof: production stamps KV every time the write canary
   succeeds, GET /api/health publishes that stamp beside the build it belongs
   to, and a stranger checks production's own record instead of asking us.

   A proof nobody can fail is not a proof, so half of this file is about the
   red cases. `writeProof` is exercised directly, and then the REAL block from
   cf/verify-write.sh is sourced against four fixture origins with `curl`
   shadowed by a shell function — the production script is not modified, not
   copied and not given a test-only hook, because a gate that can be told what
   to think is not a gate.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeProof, BUILD } from '../cf/functions/api/health.js';

const BUILT = '2026-09-09T19:33:38.738Z';
const built = Date.parse(BUILT);
const at = (secondsAfterBuild: number) => new Date(built + secondsAfterBuild * 1000).toISOString();

describe('writeProof — what a stranger may conclude from the canary stamp', () => {
  it('says nothing at all when no write has ever succeeded', () => {
    const p = writeProof(null, BUILT, built + 60_000);
    expect(p.lastWriteOkAt).toBeNull();
    expect(p.ageSeconds).toBeNull();
    expect(p.secondsAfterBuild).toBeNull();
    expect(p.provenForThisBuild).toBe(false);
  });

  it('proves THIS build when the write landed after it — the 94 s a deploy takes', () => {
    const p = writeProof(at(94), BUILT, built + 300_000);
    expect(p.secondsAfterBuild).toBe(94);
    expect(p.ageSeconds).toBe(206);
    expect(p.provenForThisBuild).toBe(true);
  });

  /* The stamp does not decay. Once the write path was exercised 94 s after this
     artifact was published, that stays true however long the artifact has been
     up — `secondsAfterBuild` is a gap between two fixed moments, not an age. A
     check that went red on a healthy site left alone over a weekend would be
     the same false red Round 3 spent a light on. */
  it('stays proven as the build ages, because the gap does not move', () => {
    expect(writeProof(at(94), BUILT, built + 30 * 86_400_000).provenForThisBuild).toBe(true);
  });

  it('refuses a stamp that predates the build: it belongs to an earlier artifact', () => {
    const p = writeProof(at(-5), BUILT, built + 60_000);
    expect(p.secondsAfterBuild).toBe(-5);
    expect(p.provenForThisBuild).toBe(false);
  });

  it('refuses a stamp more than 24 h from the build — that is a different deployment', () => {
    expect(writeProof(at(86_401), BUILT, built + 90_000_000).provenForThisBuild).toBe(false);
    expect(writeProof(at(86_400), BUILT, built + 90_000_000).provenForThisBuild).toBe(true);
  });

  it('refuses to guess when either timestamp is unreadable', () => {
    expect(writeProof('not a date', BUILT).provenForThisBuild).toBe(false);
    expect(writeProof(at(94), 'not a date').secondsAfterBuild).toBeNull();
    expect(writeProof(at(94), null).provenForThisBuild).toBe(false);
  });

  it('never reports a negative age when a clock is ahead of ours', () => {
    expect(writeProof(at(94), BUILT, built).ageSeconds).toBe(0);
  });

  it('is wired to the build stamp the site already publishes', () => {
    /* One stamp, never a second copy: the same BUILD object the gate joins to
       git history is the one the proof is measured against. */
    expect(BUILD).toHaveProperty('builtAt');
    expect(BUILD).toHaveProperty('commit');
  });
});

/* ---------------------------------------------------------------------------
   The block itself, sourced and run. `curl` is a shell function here, so no
   network is touched and the four answers are exactly the four an origin can
   give. Everything else in cf/verify-write.sh runs unchanged.
   --------------------------------------------------------------------------- */
const HARNESS = `set -uo pipefail
ORIGIN="https://waypoint-ledger.pages.dev"
PASS=0; FAIL=0
say()  { printf '%s\\n' "$*"; }
ok()   { PASS=$((PASS+1)); printf '  ok    %s\\n' "$*"; }
fail() { FAIL=$((FAIL+1)); printf '  FAIL  %s\\n' "$*"; }

# The only binary this block talks to. Test-only, and it lives here rather than
# in the script so the script keeps no door a test could open.
curl() {
  local url="" wfmt="" out="" prev="" a
  for a in "$@"; do
    case "$a" in http*) url="$a" ;; esac
    case "$prev" in -w) wfmt="$a" ;; -o) out="$a" ;; esac
    prev="$a"
  done
  local body='{}' code='200'
  case "$url" in
    */api/health*) body="$HEALTH_FIXTURE" ;;
    */api/table*) body='{"id":"cms-99213"}' ;;
    */api/corrections\\?dry=1*) body='{"ok":true,"dryRun":true,"storage":{"ok":true}}' ;;
    */api/corrections*) body='{"flaggedWrong":0}' ;;
  esac
  case "$*" in *not-a-published-figure*) code='400'; body='{"error":"no such figure"}' ;; esac
  if [ -n "$out" ]; then printf '%s' "$body" > "$out"; else printf '%s' "$body"; fi
  if [ -n "$wfmt" ]; then wfmt="\${wfmt//'%{http_code}'/$code}"; printf '%s' "$wfmt"; fi
}

. "$SCRIPT"
printf '%s ok, %s failed\\n' "$PASS" "$FAIL"
`;

const dir = mkdtempSync(join(tmpdir(), 'wl-gate-'));
const harnessPath = join(dir, 'harness.sh');
writeFileSync(harnessPath, HARNESS);
/* decodeURIComponent, not `.pathname`: this repo lives under a directory with
   spaces in its name and an encoded %20 hands bash a path that does not exist —
   the harness then sourced nothing and printed a cheerful `0 ok, 0 failed`. */
const scriptPath = decodeURIComponent(new URL('../cf/verify-write.sh', import.meta.url).pathname);

function runGate(health: object | string): string {
  return execFileSync('bash', [harnessPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SCRIPT: scriptPath,
      HEALTH_FIXTURE: typeof health === 'string' ? health : JSON.stringify(health),
      ADMIN_TOKEN: '',
      VERIFY_NO_WRITE: '0',
    },
  });
}

const healthy = (canary: object) => ({
  ok: true,
  db: 'ok',
  build: { commit: '3cf9f9328', builtAt: BUILT },
  ...canary,
});

describe('cf/verify-write.sh — the write proof, with no token in the shell', () => {
  it('goes GREEN on a production stamp that belongs to the build now answering', () => {
    const out = runGate(healthy({
      lastWriteOkAt: at(94),
      canary: { lastWriteOkAt: at(94), ageSeconds: 206, secondsAfterBuild: 94, provenForThisBuild: true },
    }));
    expect(out).toMatch(/ok {4}the write path was exercised on this origin 94s after the build now answering was published/);
    expect(out).toContain('read from /api/health with no token');
    expect(out).not.toMatch(/^ {2}FAIL/m);
    expect(out.trim().endsWith('0 failed')).toBe(true);
  });

  it('goes RED when nothing has ever been written — the Round 3 state, still caught', () => {
    const out = runGate(healthy({
      lastWriteOkAt: null,
      canary: { lastWriteOkAt: null, ageSeconds: null, secondsAfterBuild: null, provenForThisBuild: false },
    }));
    expect(out).toMatch(/FAIL {2}the write path is not proven/);
    expect(out).toContain('no successful write has ever been stamped');
  });

  it('goes RED when the stamp belongs to a different artifact than the one answering', () => {
    const out = runGate(healthy({
      lastWriteOkAt: at(-90_000),
      canary: { lastWriteOkAt: at(-90_000), ageSeconds: 90_500, secondsAfterBuild: -90_000, provenForThisBuild: false },
    }));
    expect(out).toMatch(/FAIL {2}the write path is not proven/);
    expect(out).toContain('belongs to a different artifact');
  });

  it('goes RED, not quietly green, against an origin that publishes no proof at all', () => {
    const out = runGate({ ok: true, db: 'ok', build: { commit: '3cf9f9328', builtAt: BUILT }, lastWriteOkAt: null });
    expect(out).toMatch(/FAIL {2}\/api\/health carries no write proof/);
  });

  /* A SKIP MUST NEVER PRINT ok (Round 3). The new check replaced the outsider's
     hard failure; it did not replace the rule that produced it. */
  it('never prints ok for the canary it did not run', () => {
    const out = runGate(healthy({
      lastWriteOkAt: at(94),
      canary: { lastWriteOkAt: at(94), ageSeconds: 206, secondsAfterBuild: 94, provenForThisBuild: true },
    }));
    const canaryLines = out.split('\n').filter((l) => /write canary/.test(l));
    expect(canaryLines.length).toBeGreaterThan(0);
    expect(canaryLines.some((l) => /^ {2}ok/.test(l))).toBe(false);
  });
});

describe('the script keeps the promises the rest of the gate depends on', () => {
  const write = readFileSync(new URL('../cf/verify-write.sh', import.meta.url), 'utf8');
  const live = readFileSync(new URL('../cf/verify-live.sh', import.meta.url), 'utf8');

  it('still runs the real canary when the deploying shell has the token', () => {
    expect(write).toContain('if [ -n "${ADMIN_TOKEN:-}" ]; then');
    expect(write).toContain('the D1 write canary round-tripped');
    expect(write).toContain('rowsLeftBehind":0');
  });

  it('reads the corrections export by its HEADER row, not by line 1', () => {
    /* The data lane put a provenance preamble above the header; `head -n1`
       then read a comment and called a healthy export broken. */
    expect(live).toContain('CSV_HEADER=');
    expect(live).toMatch(/grep -v '\^\[\[:space:\]\]\*#'/);
  });
});
