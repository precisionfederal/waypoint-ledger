/* ==========================================================================
   THE FOUR THINGS THAT HAVE TO WORK ON A BAD DAY.

   Backups, an alarm, a rollback and a runbook are the parts of a production
   system that are never exercised until the one morning they are the only thing
   between the site and a lost register. Everything here is a property that was
   true when it was written and that a later edit could quietly take away:

   · the backup lands OUTSIDE the repo (the dump carries every encrypted
     interview blob, and this repo is exported publicly by
     scripts/export-public-repo.sh)
   · no ops script can publish, and the restore has no --remote at all
   · the alarm writes the file every session on this machine reads at startup
   · the rollback exits non-zero instead of claiming a rollback wrangler cannot
     do (checked 2026-09-09: `wrangler pages deployment` has list, create and
     tail, and Cloudflare's own docs call rollback a dashboard action)
   · the two launchd jobs keep the only shape a PF job may have — Homebrew
     python3, then pf-launch.py, then the wrapper — because every other identity
     is denied ~/Documents by TCC

   The three execution cases at the bottom run the scripts for real. They need
   no network and no Cloudflare account.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* fileURLToPath, never .pathname: this repository's path has spaces in it and a
   URL pathname percent-encodes them, so every existsSync and every spawn cwd
   built that way points at a directory that does not exist. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
/* The commands only. Every one of these files explains itself at the top, and a
   check that could not tell a comment from a command would pass on prose. */
const commands = (p: string) => read(p).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync('bash', args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120_000 });

const BACKUP = 'scripts/backup-d1.sh';
const RESTORE = 'scripts/restore-d1.sh';
const UPTIME = 'scripts/uptime-check.sh';
const ROLLBACK = 'scripts/rollback.sh';

describe('npm knows about all four', () => {
  const pkg = JSON.parse(read('package.json'));
  it('exposes them under the names the runbook uses', () => {
    expect(pkg.scripts.backup).toBe('bash scripts/backup-d1.sh');
    expect(pkg.scripts['restore:local']).toBe('bash scripts/restore-d1.sh');
    expect(pkg.scripts.uptime).toBe('bash scripts/uptime-check.sh');
    expect(pkg.scripts.rollback).toBe('bash scripts/rollback.sh');
  });
});

describe('the backup', () => {
  const sh = commands(BACKUP);

  it('lands outside the repo, in Application Support', () => {
    expect(sh).toContain('Library/Application Support/precision-federal/waypoint-backups');
    /* Not cwd, not the repo, not anything a public export would sweep up. */
    expect(sh).not.toMatch(/DIR="\$ROOT/);
  });

  it('reads the live counts before AND after the export, and compares each table', () => {
    const before = sh.indexOf('BEFORE="$(curl');
    const exportLine = sh.indexOf('d1 export');
    const after = sh.indexOf('AFTER="$(curl');
    expect(before).toBeGreaterThan(-1);
    expect(before).toBeLessThan(exportLine);
    expect(after).toBeGreaterThan(exportLine);
    /* the sandwich: the dump has to sit between the two readings */
    expect(sh).toContain('-ge "$lo"');
    expect(sh).toContain('-le "$hi"');
  });

  it('requires every register table to be in the dump', () => {
    for (const t of ['corrections', 'gap_reports', 'survey_responses', 'interviews', 'changes', 'journeys']) {
      expect(read(BACKUP)).toContain(t);
    }
    expect(sh).toContain('CREATE TABLE');
  });

  it('keeps 30 days and never walks anything but the backup folder', () => {
    expect(sh).toContain('RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"');
    expect(sh).toMatch(/find "\$DIR" -maxdepth 1/);
  });

  it('fails loudly instead of reporting a backup it could not verify', () => {
    expect(sh).toMatch(/\[ "\$FAIL" -eq 0 \] \|\| exit 1/);
  });

  it('is read-only against production: an export and nothing else', () => {
    expect(sh).not.toContain('pages deploy');
    expect(sh).not.toContain('d1 execute');
    expect(sh.match(/--remote/g) || []).toHaveLength(1);
  });
});

describe('the restore', () => {
  const sh = commands(RESTORE);

  it('has no --remote, and says so when asked for one', () => {
    expect(sh).toContain('--remote) printf');
    const res = run([RESTORE, '--remote']);
    expect(res.status).toBe(2);
    expect(res.stderr + res.stdout).toContain('there is no --remote');
  });

  it('proves the restore by the numbers the dump was taken with, not by exit codes', () => {
    expect(sh).toContain('rowCounts');
    expect(sh).toContain('sha256');
    expect(sh).toContain('integrity?verify=1');
    expect(sh).toContain('verify-live.sh');
  });

  it('refuses to start on a port something else is holding', () => {
    expect(sh).toContain('lsof -ti "tcp:$PORT"');
  });

  it('asks for a file and stops when there is not one', () => {
    const res = run([RESTORE]);
    expect(res.status).toBe(2);
    expect(res.stdout + res.stderr).toContain('usage:');
  });
});

describe('the alarm', () => {
  const sh = commands(UPTIME);

  it('asks all three questions: the page, the database, the chains', () => {
    expect(sh).toContain('"$ORIGIN/"');
    expect(sh).toContain('.ok == true and .db == "ok"');
    expect(sh).toContain('integrity?verify=1');
  });

  it('retries before it cries wolf', () => {
    expect(sh).toContain('ATTEMPTS="${UPTIME_ATTEMPTS:-3}"');
    expect(sh).toMatch(/for i in \$\(seq 1 "\$ATTEMPTS"\)/);
  });

  it('writes the file every session on this machine reads at startup', () => {
    expect(sh).toContain('$HOME/.claude/pf-state');
    expect(sh).toContain('WAYPOINT-DOWN.md');
    expect(sh).toContain('UPTIME.log');
  });

  it('never leaves a DOWN file behind after the site comes back', () => {
    expect(sh).toContain('WAYPOINT-DOWN-resolved-');
  });

  /* The real thing: a dead origin, a throwaway state directory, no network
     needed — 127.0.0.1:1 refuses at once. */
  it('writes a usable alarm when the origin does not answer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-uptime-'));
    const res = run([UPTIME, 'http://127.0.0.1:1'], {
      PF_STATE_DIR: dir, UPTIME_LOG: join(dir, 'UPTIME.log'), UPTIME_ATTEMPTS: '1', UPTIME_GAP: '1',
    });
    expect(res.status).toBe(1);
    const alarm = readFileSync(join(dir, 'WAYPOINT-DOWN.md'), 'utf8');
    expect(alarm).toContain('WAYPOINT LEDGER IS DOWN');
    expect(alarm).toContain('uptime-check.sh');
    expect(alarm).toContain('rollback.sh');
    expect(alarm).toContain('restore-d1.sh');
    expect(readFileSync(join(dir, 'UPTIME.log'), 'utf8')).toContain('DOWN');
  });
});

describe('the rollback', () => {
  const sh = commands(ROLLBACK);

  it('names the dashboard, the account and the exact menu item', () => {
    expect(sh).toContain('dash.cloudflare.com');
    expect(sh).toContain('Rollback to this deployment');
  });

  it('exits 2 rather than claiming a rollback wrangler cannot do', () => {
    /* wrangler pages deployment has list, create and tail. Nothing else. */
    expect(sh).not.toMatch(/deployment\s+rollback/);
    expect(sh.trimEnd().endsWith('exit 2')).toBe(true);
  });

  it('only ever lists; it never publishes', () => {
    expect(sh).toContain('pages deployment list');
    expect(sh).not.toMatch(/^\s*[^#]*npx .*pages deploy /m);
  });

  it('refuses an id that is not one of this project\'s deployments', () => {
    expect(sh).toContain('is not one of this project');
  });
});

describe('the two scheduled jobs', () => {
  const machine = '../../../../scripts/machine/';  // tests/ -> waypoint-app -> TOPX-HHS-PHASE2 -> runs -> repo root
  const plist = (n: string) => readFileSync(new URL(machine + n, import.meta.url), 'utf8');

  for (const [file, label, wrapper] of [
    ['com.precisionfederal.waypoint-backup.plist', 'com.precisionfederal.waypoint-backup', 'pf-waypoint-backup.sh'],
    ['com.precisionfederal.waypoint-uptime.plist', 'com.precisionfederal.waypoint-uptime', 'pf-waypoint-uptime.sh'],
  ] as const) {
    it(`${label} keeps the only shape a PF job may have`, () => {
      const p = plist(file);
      expect(p).toContain(`<string>${label}</string>`);
      /* Homebrew python3 holds the TCC grant on ~/Documents and its children
         inherit it. /bin/zsh, /bin/bash and Apple's python3 are all denied. */
      const order = ['/opt/homebrew/bin/python3', 'pf-launch.py', wrapper].map((s) => p.indexOf(s));
      expect(order.every((i) => i > -1)).toBe(true);
      expect(order[0]).toBeLessThan(order[1]);
      expect(order[1]).toBeLessThan(order[2]);
      expect(p).not.toContain('/bin/zsh</string>');
    });
  }

  it('the backup runs daily and the uptime check every fifteen minutes', () => {
    expect(plist('com.precisionfederal.waypoint-backup.plist')).toContain('StartCalendarInterval');
    expect(plist('com.precisionfederal.waypoint-uptime.plist')).toMatch(/StartInterval<\/key>\s*<integer>900<\/integer>/);
  });

  it('both wrappers exist in the repo mirror and call the app scripts', () => {
    const b = readFileSync(new URL(machine + 'pf-waypoint-backup.sh', import.meta.url), 'utf8');
    const u = readFileSync(new URL(machine + 'pf-waypoint-uptime.sh', import.meta.url), 'utf8');
    expect(b).toContain('scripts/backup-d1.sh');
    expect(u).toContain('scripts/uptime-check.sh');
    /* wrangler is node, and launchd's PATH has neither node nor Homebrew. */
    for (const w of [b, u]) expect(w).toContain('.nvm/versions/node');
  });
});

describe('the runbook answers the four questions someone asks at 3 a.m.', () => {
  const rb = read('docs/RUNBOOK.md');
  it('covers down, bad deploy, data, and a leaked secret', () => {
    expect(rb).toContain('## The site is down');
    expect(rb).toContain('## A bad deploy is live');
    expect(rb).toContain('## A data question');
    expect(rb).toContain('## A secret leaked');
  });
  it('gives the wrangler command for rotating a secret, and never a value', () => {
    expect(rb).toContain('wrangler pages secret put ADMIN_TOKEN --project-name waypoint-ledger');
    expect(rb).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
  });
  it('warns that INTERVIEW_KEY is the one key the interviews are encrypted with', () => {
    expect(rb).toContain('INTERVIEW_KEY');
    expect(rb).toMatch(/unreadable/);
  });
  it('says plainly that nothing in it deploys or writes to the register', () => {
    expect(rb).toContain('Nothing here deploys');
    expect(rb).toContain('Nothing here writes to the live register');
  });
});

describe('nothing in this lane can reach the live register', () => {
  it('no ops script writes to production D1 or publishes', () => {
    for (const f of [BACKUP, RESTORE, UPTIME, ROLLBACK]) {
      const sh = commands(f);
      expect(sh, f).not.toMatch(/d1 execute[^\n]*--remote/);
      expect(sh, f).not.toMatch(/npx[^\n]*pages deploy /);
    }
  });
  it('the scripts are all present and carry the execute bit', () => {
    for (const f of [BACKUP, RESTORE, UPTIME, ROLLBACK]) {
      expect(existsSync(join(ROOT, f)), f).toBe(true);
      /* launchd runs them through `bash <file>`, but a person types the path. */
      expect(statSync(join(ROOT, f)).mode & 0o111, f).toBeGreaterThan(0);
    }
    expect(readdirSync(join(ROOT, 'scripts'))).toEqual(expect.arrayContaining(
      ['backup-d1.sh', 'restore-d1.sh', 'uptime-check.sh', 'rollback.sh'],
    ));
  });
});
