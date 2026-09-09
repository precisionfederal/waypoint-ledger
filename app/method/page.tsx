/* ==========================================================================
   HOW THIS NUMBER IS MADE — METHOD.md and GAPS.md rendered verbatim at build
   time. The text is the same file the data carries; nothing is paraphrased.
   ========================================================================== */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';

export const dynamic = 'force-static';

export const metadata = {
  title: 'How every figure is made — Waypoint Ledger',
  description:
    'The formula behind each class of figure, the row-by-row audit against the federal source files '
    + 'with their SHA256 hashes, how a locality price is computed, and the price table as open data.',
};

/* ------------------------------------------------------------------ types */
interface AuditRow {
  id: string; status: string; value_usd: number | null; agency?: string | null;
  confidence?: string | null; check?: string | null; evidence?: string | null;
  source_url?: string | null;
}
interface AuditFile {
  generated: string; table_version: string; rows: number; pass: number; fail: number;
  unverified: number; conversion_factor: number;
  version?: string; version_line?: string;
  alternates?: number; alternates_pass?: number; alternates_fail?: number;
  alternates_unverified?: number;
  localities?: { rows: number; figures: number; pass: number; fail: number; status: string;
                 evidence?: string; formula?: string };
  sources: Record<string, { url?: string; title?: string; sha256?: string; bytes?: number;
                            retrieved?: string; error?: string }>;
  results: AuditRow[];
}
interface ConditionsAudit {
  generated: string; conditions_version: string; conditions: number; coded: number;
  priced: number; checks: number; pass: number; fail: number; unverified: number;
  icd10cm_years_checked: number[];
  sources: Record<string, { url?: string; sha256?: string; bytes?: number; error?: string }>;
}
interface ConditionsFile {
  _version: string;
  _icd10cm_source?: { browser_url?: string; field_read?: string; why_two_years?: string;
                      checked_against?: { fiscal_year: number; in_effect: string; url: string }[] };
  _no_code_is_not_an_oversight?: string;
  _when_there_is_no_figure?: string;
  conditions: { id: string; label: string; icd10cm: string | null; icd10cm_title: string | null;
                icd10cm_billable: boolean | null; icd10cm_blank_reason?: string | null;
                price_row_id: string | null; figure_kind: string | null }[];
}
interface StatePrices {
  _formula: string; _conversion_factor: number; _source_files: string[];
  localities: { state: string; locality: string; name: string; pw: number; pe: number; mp: number }[];
  items: Record<string, Record<string, number>>;
}

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/🔴|⚠️/g, '');
}
/** A small, strict Markdown subset: headings, paragraphs, lists, quotes, rules, tables. */
function md(src: string): { html: string; toc: { id: string; text: string }[] } {
  const toc: { id: string; text: string }[] = [];
  const out: string[] = [];
  const lines = src.split('\n');
  let para: string[] = [];
  let list: string[] = []; let listTag = '';
  let table: string[] = [];
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
    if (list.length) { out.push(`<${listTag}>${list.join('')}</${listTag}>`); list = []; listTag = ''; }
    if (table.length) {
      const rows = table.filter((r) => !/^\|\s*-/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const [h, ...b] = rows;
      out.push(`<div class="table-scroll"><table class="ledger-table"><thead><tr>${h.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${b.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      table = [];
    }
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^#{1,3}\s/.test(line)) {
      flush();
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s*/, '').replace(/🔴|⚠️/g, '').trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (level <= 2) toc.push({ id, text });
      out.push(`<h${level + 1} id="${id}">${inline(text)}</h${level + 1}>`);
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (para.length || (list.length && listTag !== 'ul')) flush();
      listTag = 'ul'; list.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
    } else if (/^\s*\d+\.\s+/.test(line)) {
      if (para.length || (list.length && listTag !== 'ol')) flush();
      listTag = 'ol'; list.push(`<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
    } else if (/^\|/.test(line)) {
      if (para.length || list.length) flush();
      table.push(line);
    } else if (/^>\s?/.test(line)) {
      flush(); out.push(`<blockquote><p>${inline(line.replace(/^>\s?/, ''))}</p></blockquote>`);
    } else if (/^---+$/.test(line)) {
      flush(); out.push('<hr />');
    } else if (!line.trim()) {
      flush();
    } else {
      if (list.length || table.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return { html: out.join('\n'), toc };
}

export default async function MethodPage() {
  const dir = path.join(process.cwd(), 'data');
  const [method, gaps, auditRaw, statesRaw, condAuditRaw, condRaw] = await Promise.all([
    fs.readFile(path.join(dir, 'METHOD.md'), 'utf8'),
    fs.readFile(path.join(dir, 'GAPS.md'), 'utf8'),
    fs.readFile(path.join(dir, 'AUDIT.json'), 'utf8').catch(() => ''),
    fs.readFile(path.join(dir, 'state-prices.json'), 'utf8').catch(() => ''),
    fs.readFile(path.join(dir, 'CONDITIONS-AUDIT.json'), 'utf8').catch(() => ''),
    fs.readFile(path.join(dir, 'conditions.json'), 'utf8').catch(() => ''),
  ]);
  const m = md(method.replace(/^#\s.*\n/, ''));
  const g = md(gaps.replace(/^#\s.*\n/, ''));
  const audit: AuditFile | null = auditRaw ? JSON.parse(auditRaw) : null;
  const states: StatePrices | null = statesRaw ? JSON.parse(statesRaw) : null;
  const hasIntegrityPage = existsSync(path.join(process.cwd(), 'app', 'integrity', 'page.tsx'));
  const condAudit: ConditionsAudit | null = condAuditRaw ? JSON.parse(condAuditRaw) : null;
  const conds: ConditionsFile | null = condRaw ? JSON.parse(condRaw) : null;
  const condRows = conds?.conditions ?? [];
  const condPriced = condRows.filter((c) => c.price_row_id);
  const condUnpriced = condRows.filter((c) => !c.price_row_id);
  const icdYears = conds?._icd10cm_source?.checked_against ?? [];

  /* How each class of figure is made — counted from the audit, not asserted. */
  const byCheck = new Map<string, { n: number; pass: number; agencies: Set<string> }>();
  for (const r of audit?.results ?? []) {
    const k = r.check ?? 'no rule';
    const e = byCheck.get(k) ?? { n: 0, pass: 0, agencies: new Set<string>() };
    e.n += 1;
    if (r.status === 'PASS') e.pass += 1;
    if (r.agency) e.agencies.add(r.agency);
    byCheck.set(k, e);
  }
  const classes = [...byCheck.entries()].sort((a, b) => b[1].n - a[1].n);

  /* How many rows lean on each source file. */
  const rowsPerSource = new Map<string, number>();
  for (const r of audit?.results ?? []) {
    const u = r.source_url ?? '';
    rowsPerSource.set(u, (rowsPerSource.get(u) ?? 0) + 1);
  }
  const sourceRows = Object.entries(audit?.sources ?? {}).map(([key, s]) => ({
    key, ...s, rows: rowsPerSource.get(s.url ?? '') ?? 0,
  }));

  /* One worked locality, computed here from the published GPCIs so the page
     shows the arithmetic rather than describing it. */
  const iowa = states?.localities.find((l) => l.state === 'IA');
  const iowaKey = iowa ? `${iowa.state}-${iowa.locality}` : '';
  const iowa99213 = states?.items['cms-99213']?.[iowaKey];
  const localityCount = states?.localities.length ?? 0;
  const localityRows = states ? Object.keys(states.items).length : 0;

  return (
    <section className="step">
      <div className="wrap method-page">
        <p className="eyebrow">How this number is made</p>
        <h2>Every figure in the ledger, and every one we would not print</h2>
        <p className="sub">
          Nothing here is modelled, averaged or estimated. Each figure was read out of a published
          federal file, or is the product of figures on that file with the formula printed. This page
          shows the formulas, the audit that re-derives every figure from scratch, and the files
          themselves.
        </p>
        {audit?.version_line && (
          <p className="sub" style={{ fontFamily: 'var(--font-m)', fontSize: '.9375rem' }}>
            {audit.version_line}
          </p>
        )}

        {audit && (
          <>
            <h3 id="audit">The audit</h3>
            <div className="card">
              <p>
                <strong>
                  {audit.pass} of {audit.rows} rows reproduce from their source file
                </strong>{' '}
                — {audit.fail} disagree, {audit.unverified} could not be checked in that run. Table
                Table version <code>{audit.version ?? audit.table_version}</code>, generated by this
                audit and printed under every total in the ledger, on the appointment sheet, in the
                API and on every CSV — one string, not four.
              </p>
              <p>
                It is one command, and it does not trust this repository: it downloads each cited file
                from its published URL, hashes it, and recomputes every figure.
              </p>
              <p><code>python3 data/verify_price_table.py</code></p>
              <p>
                A row passes only when the number AND the sentence that names it are found in the
                source. UNVERIFIED means the source could not be fetched or parsed in that run — it is
                never a quiet pass. The script exits non-zero on a single disagreement, and it has been
                proven to: planting eight wrong values produced eight failures.
              </p>
              {typeof audit.alternates === 'number' && audit.alternates > 0 && (
                <p>
                  <strong>
                    {audit.alternates_pass} of {audit.alternates} CY2024 companion figures reproduce
                  </strong>{' '}
                  — the average submitted charge and the average allowed amount that ride beside a
                  fee-schedule figure. Each is read out of one named row of{' '}
                  <code>MUP_PHY_R26_P05_V10_D24_Geo.csv</code> — geography level, HCPCS code and place
                  of service — and the audit fails the row if the file it cites hashes to anything but
                  the file that was read. A figure on the screen is audited whether or not it is the
                  figure the row is named for.
                </p>
              )}
              {audit.localities && audit.localities.figures > 0 && (
                <p>
                  <strong>
                    {audit.localities.pass.toLocaleString('en-US')} of{' '}
                    {audit.localities.figures.toLocaleString('en-US')} locality figures reproduce
                  </strong>{' '}
                  — every code priced for every Medicare locality, re-derived here from{' '}
                  <code>PPRRVU2026_Jul_nonQPP.csv</code> and <code>GPCI2026.csv</code>, both hashed
                  below. The published table used to carry a verdict its own generator had written
                  about its own output; this is a second run, from the files.
                </p>
              )}
            </div>

            <h3 id="classes">How each class of figure is made</h3>
            <div className="table-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>How the figure is produced</th>
                    <th className="r">Rows</th>
                    <th className="r">Reproduce</th>
                    <th>Agency</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(([k, v]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="r">{v.n}</td>
                      <td className="r">{v.pass}</td>
                      <td>{[...v.agencies].join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sub" style={{ marginTop: '.75rem' }}>
              The physician fee schedule publishes no dollar column. It publishes Relative Value Units
              and one conversion factor — ${audit.conversion_factor.toFixed(4)} for CY2026 — and defines
              the payment as their product. That multiplication is ours, which is why those rows are
              marked DERIVED rather than VERIFIED, and why the RVUs are quoted inside the row so you can
              redo it. The laboratory rows need no arithmetic at all: the rate is a column on the file.
            </p>

            <h3 id="sources">The files, and what they hash to</h3>
            <div className="table-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Published file</th>
                    <th className="r">Rows</th>
                    <th>SHA256</th>
                    <th className="r">Retrieved</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map((s) => (
                    <tr key={s.key}>
                      <td>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                        ) : s.title}
                      </td>
                      <td className="r">{s.rows || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-m)', fontSize: '.8125rem', wordBreak: 'break-all' }}>
                        {s.sha256 ?? <em>{s.error}</em>}
                      </td>
                      <td className="r">{s.retrieved?.startsWith('local') ? 'local copy' : s.retrieved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {states && iowa && iowa99213 && (
          <>
            <h3 id="locality">Where you live</h3>
            <div className="card">
              <p>
                Medicare does not pay one national price. It multiplies each half of the payment by a
                geographic practice cost index published for that locality, so the same code is a
                different allowed amount in {localityCount} Medicare localities. {localityRows} of our
                rows carry a locality figure.
              </p>
              <p><code>{states._formula}</code></p>
              <p>
                Worked, for {iowa.name.toLowerCase()} and CPT 99213: work 1.30 × {iowa.pw} + practice
                expense 1.46 × {iowa.pe} + malpractice 0.09 × {iowa.mp}, all times $
                {states._conversion_factor.toFixed(4)} = <strong>{money(iowa99213)}</strong>. The national
                figure, with every index set to 1.000, is $95.19.
              </p>
              <p>
                Inputs: {states._source_files.join(' · ')}. Rebuild with{' '}
                <code>python3 data/build_state_prices.py</code>. Every one of these figures is
                re-derived from the two CMS files by <code>python3 data/verify_price_table.py</code>
                {audit?.localities
                  ? ` — ${audit.localities.pass.toLocaleString('en-US')} of `
                    + `${audit.localities.figures.toLocaleString('en-US')} at the cent, ${audit.localities.fail} off`
                  : ''}
                ; the per-row build log is <code>data/STATE-PRICES-AUDIT.txt</code>.
              </p>
            </div>
          </>
        )}

        {conds && (
          <>
            <h3 id="conditions">Which condition, and its code</h3>
            <div className="card">
              <p>
                The year-ahead figure is not one number written into the page. You choose the
                condition; the panel renders whatever the row for that condition says, with its
                year, its population and the kind of figure it is. Adding a tenth condition is one
                object in <code>data/conditions.json</code> &mdash; and it may only be added once
                its figure exists as an audited row in the price table.
              </p>
              <p>
                <strong>{condPriced.length} of the {condRows.length} conditions have a published
                annual figure. {condUnpriced.length} do not</strong>, and for those the panel says so
                and offers to count the absence, because a missing federal figure is a finding about
                the data, not a blank to fill with the nearest number to hand.
              </p>
              <div className="table-scroll">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th scope="col">Condition</th>
                      <th scope="col">ICD-10-CM</th>
                      <th scope="col">Year-ahead figure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {condRows.map((c) => (
                      <tr key={c.id}>
                        <th scope="row">{c.label}</th>
                        <td>
                          {c.icd10cm
                            ? <><code>{c.icd10cm}</code> {c.icd10cm_title}
                                {c.icd10cm_billable === false && <> (category heading)</>}</>
                            : <span className="blank">none, on purpose</span>}
                        </td>
                        <td>
                          {c.price_row_id
                            ? <>published &mdash; {c.figure_kind === 'excess' ? 'excess' : 'condition-attributed'}</>
                            : <span className="blank">none published</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                <strong>{condRows.filter((c) => !c.icd10cm).length} of the {condRows.length} rows
                carry no ICD-10-CM code.</strong> {conds._no_code_is_not_an_oversight}
              </p>
              {icdYears.length > 0 && (
                <p>
                  Every code was re-read in the code-description file CDC/NCHS publishes for{' '}
                  {icdYears.map((y) => `FY${y.fiscal_year}`).join(' and ')} &mdash; the long
                  description, character for character, and the flag that says whether the code may
                  go on a claim. {conds._icd10cm_source?.why_two_years}
                </p>
              )}
              {condAudit && (
                <p>
                  <strong>{condAudit.checks} checks: {condAudit.pass} pass, {condAudit.fail} fail,{' '}
                  {condAudit.unverified} unverified</strong>, run {condAudit.generated.slice(0, 10)}.
                  It re-reads every code in the CDC files and every priced figure in the paper or
                  brief the row cites, and it fails if a condition with no figure has a dollar
                  amount anywhere in its record. Run it:{' '}
                  <code>python3 data/verify_conditions.py</code>; the result is{' '}
                  <code>data/CONDITIONS-AUDIT.json</code>.
                </p>
              )}
              <p className="step-actions">
                <a className="btn ghost" href={conds._icd10cm_source?.browser_url ?? 'https://icd10cmtool.cdc.gov/'}
                   target="_blank" rel="noopener noreferrer">CDC ICD-10-CM browser</a>
              </p>
            </div>
          </>
        )}

        <h3 id="take-the-data">Take the data</h3>
        <div className="card">
          <p>
            The whole table is published as open data, versioned, with every field described and the
            audit verdict carried on each row. The federal figures are U.S. Government works in the
            public domain; our labels, synonyms, coverage statements and combination rules are
            dedicated to the public domain under CC0 1.0. No attribution required.
          </p>
          <p className="step-actions">
            <a className="btn ghost" href="/data/price-table.csv" download>Price table (CSV)</a>{' '}
            <a className="btn ghost" href="/data/price-table.json" download>Price table (JSON)</a>{' '}
            <a className="btn ghost" href="/data/price-dictionary.csv" download>Data dictionary</a>
          </p>
          <p>
            The combination rules travel with it: <code>summable</code>,{' '}
            <code>mutually_exclusive_with</code> and <code>bundles_ancillaries</code> say which figures
            may be added to which. A rule written only in prose is a wish; these are fields.
          </p>
          {hasIntegrityPage && (
            <p>
              What the public sends back — corrections, gaps, rankings — is published too, and every row is
              hash-chained. <Link href="/integrity">How that chain works, and what it does not prove</Link>.
            </p>
          )}
        </div>

        <nav className="toc" aria-label="Contents">
          <p className="toc-h">Method</p>
          <ul>{m.toc.map((t) => <li key={t.id}><a href={`#m-${t.id}`}>{t.text}</a></li>)}</ul>
          <p className="toc-h">What we could not price</p>
          <ul>{g.toc.map((t) => <li key={t.id}><a href={`#g-${t.id}`}>{t.text}</a></li>)}</ul>
        </nav>
        <article className="prose" dangerouslySetInnerHTML={{ __html: m.html.replace(/id="/g, 'id="m-') }} />
        <h2 className="prose-h2">What we could not price, and why</h2>
        <article className="prose" dangerouslySetInnerHTML={{ __html: g.html.replace(/id="/g, 'id="g-') }} />
        <div className="step-actions"><Link className="btn ghost" href="/">Back to the ledger</Link></div>
      </div>
    </section>
  );
}
