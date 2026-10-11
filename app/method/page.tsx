/* ==========================================================================
   HOW THIS NUMBER IS MADE. METHOD.md and GAPS.md rendered verbatim at build
   time. The text is the same file the data carries; nothing is paraphrased.

   VISUAL-4b (2026-09-30 night): a hero band, the one rule as its own card,
   the price path drawn as a diagram that follows one real phrase (read by the
   rules reader at build time), every published file as a card, the counts as
   dots and bars, and a contents rail (pills on phones). Every sentence the
   page carried before is still here; long ones sit behind a one-line fold,
   which MethodMotion opens for a link or a hash inside it.
   Styles: ./method.css, every rule scoped under .mx. Pieces: components/method/.
   ========================================================================== */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Link from '@/components/IntentLink';
import type { ReactNode } from 'react';
import type { TocItem } from '@/components/LongSection';
import { mapUtterance } from '@/lib/mapper';
import { TABLE } from '@/lib/table';
import MethodMotion from '@/components/method/MethodMotion';
import PricePath, { type PathExample } from '@/components/method/PricePath';
import SourceCards, { type SourceCard } from '@/components/method/SourceCards';
import { G, Glyph } from '@/components/method/glyphs';
import { PageHero } from '@/components/trust/PageHero';
import { CONTEXT, SMALL_CELL_MIN, SEX_POLICY, SEX_POLICY_URL, SEX_ASK_ORIGIN } from '@/lib/survey';
import './method.css';
import { shareCard } from '@/lib/og';

export const dynamic = 'force-static';

export const metadata = {
  title: 'How every figure is made',
  description:
    'The formula behind each class of figure, the row-by-row audit against the federal source files '
    + 'with their SHA256 hashes, how a locality price is computed, and the price table as open data.',
  ...shareCard('Every figure, and the file it was read from', 'Every priced line comes from a published federal file: a row read out of it, or the product of its figures with the formula printed.', '/method'),
};

/* ------------------------------------------------------------------ types */
interface AuditRow {
  id: string; status: string; value_usd: number | null; agency?: string | null;
  confidence?: string | null; check?: string | null; evidence?: string | null;
  source_url?: string | null; source_key?: string | null; code?: string | null;
}
interface AuditFile {
  generated: string; table_version: string; rows: number; pass: number; fail: number;
  unverified: number; conversion_factor: number;
  version?: string; version_line?: string;
  alternates?: number; alternates_pass?: number; alternates_fail?: number;
  alternates_unverified?: number;
  localities?: { rows: number; figures: number; pass: number; fail: number; status: string;
                 evidence?: string; formula?: string };
  sources: Record<string, { url?: string; title?: string; file?: string; sha256?: string; bytes?: number;
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
  _sex_note_rule?: string;
  conditions: { id: string; label: string; icd10cm: string | null; icd10cm_title: string | null;
                icd10cm_billable: boolean | null; icd10cm_blank_reason?: string | null;
                price_row_id: string | null; figure_kind: string | null; figure_is_government_publication?: boolean | null;
                sex_note?: string | null; sex_note_source?: string | null;
                sex_note_source_url?: string | null; sex_note_blank_reason?: string | null }[];
}
/** The fields of a public/data/price-table.json row this page reads. */
interface TableRow {
  id: string; label: string; plain_language_synonyms?: string[]; value_usd: number | null;
  basis: string; year: string; population: string; coverage_statement: string;
  source_title?: string; source_url?: string;
}
interface StatePrices {
  _formula: string; _conversion_factor: number; _source_files: string[];
  localities: { state: string; locality: string; name: string; pw: number; pe: number; mp: number }[];
  items: Record<string, Record<string, number>>;
}

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? 'none'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/* critic-13 (copy rule: no em-dashes). METHOD.md, GAPS.md and conditions.json stay
   byte-identical; their em-dashes are punctuated here, at display time only. A pair
   "A — B — C" reads as commas; a single dash reads as a comma before a joining word
   (and, or, but, not, because, which, including, about) and as a colon otherwise.
   Heading ids are still made from the raw text, so every old #link still lands. */
function undash(s: string): string {
  return s
    .replace(/\s*\u2014\s*((?:(?!\.\s)[^\u2014]){1,90}?)\s*\u2014\s*/g, ', $1, ')
    .replace(/\s*\u2014\s*(?=(?:and|or|but|not|because|which|including|about)\b)/g, ', ')
    .replace(/\s*\u2014\s*/g, ': ');
}
function inline(s: string): string {
  return esc(undash(s))
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
      /* Each cell carries its column name, so a phone can stack the row as a card. */
      out.push(`<div class="mx-doc-table"><table><thead><tr>${h.map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${b.map((r) => `<tr>${r.map((c, i) => `<td data-label="${esc(undash(h[i] ?? '')).replace(/"/g, '&quot;')}">${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
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
      if (level <= 2) toc.push({ id, text: undash(text) });
      /* The document under this page has an <h1> now, so its own "##" sections are
         h2 and "###" is h3. Math.max keeps a stray "#" from minting a second h1. */
      const tag = Math.max(2, level);
      out.push(`<h${tag} id="${id}">${inline(text)}</h${tag}>`);
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

/* ----------------------------------------------------------------- pieces */
/** One line of summary, the detail folded under it. MethodMotion opens it for a hash inside.
    With `heading`, the summary is a real h3 plus a one-line hint, so the outline keeps it. */
function Fold({ summary, heading, hint, children }:
  { summary?: ReactNode; heading?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <details className="mx-fold">
      <summary>
        {heading
          ? <span className="mx-fold-t"><h3 className="mx-fold-h">{heading}</h3>{hint && <span className="mx-fold-hint">{hint}</span>}</span>
          : <span className="mx-fold-t">{summary}</span>}
        <span className="mx-chev" aria-hidden="true" />
      </summary>
      <div className="mx-fold-body">{children}</div>
    </details>
  );
}

/** A section: an icon, the h2 that the contents rail and every old link point at, one lead line. */
function Sec({ id, icon, title, lead, children }:
  { id: string; icon: ReactNode; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-sec" data-spy="" aria-labelledby={id}>
      <div className="mx-sec-head">
        <span className="mx-sec-ic"><Glyph g={icon} size={20} /></span>
        <h2 id={id}>{title}</h2>
      </div>
      {lead && <p className="mx-lead">{lead}</p>}
      {children}
    </section>
  );
}

/** One short labelled line in place of a paragraph. */
const Cav = ({ label, children }: { label: string; children: ReactNode }) => (
  <p className="mx-cav"><span className="mx-cav-l">{label}</span> <span>{children}</span></p>
);

/** n of total, drawn as dots: one dot per condition, filled where the data has the thing. */
function Dots({ on, total, label, onKey, offKey }: { on: number; total: number; label: string; onKey: string; offKey: string }) {
  return (
    <figure className="mx-dots" data-motion="">
      <div className="mx-dots-grid" role="img" aria-label={label}>
        {Array.from({ length: total }, (_, i) => <i key={i} className={i < on ? 'is-on' : undefined} style={{ ['--k' as string]: i }} />)}
      </div>
      <figcaption className="mx-dots-key">
        <span><i className="is-on" aria-hidden="true" />{onKey}: <b>{on}</b></span>
        <span><i aria-hidden="true" />{offKey}: <b>{total - on}</b></span>
      </figcaption>
    </figure>
  );
}

const BASIS: Record<string, string> = {
  allowed_amount: 'allowed amount', out_of_pocket: 'out-of-pocket', facility_cost: 'facility cost',
  total_expenditure: 'total expenditure',
};
const basisName = (b: string) => BASIS[b] ?? b.replace(/_/g, ' ');
/* The coverage statements are shown verbatim on every line; on a card the
   one em-dash some carry reads as a comma (copy rule: no em-dashes). */
const plain = (s: string) => s.replace(/\s*\u2014\s*/g, ', ');
const DOES_NOT = /(?:Who it does NOT describe:|What it does NOT cover:|It does not describe)\s*(.+?\.)(?=\s|$)/;
const mostCommon = (xs: (string | null | undefined)[]) => {
  const c = new Map<string, number>();
  for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
/* The two apostrophes the coverage statements use are one sentence. */
const sameQuote = (s: string | null) => s && s.replace(/’/g, "'");

export default async function MethodPage() {
  const dir = path.join(process.cwd(), 'data');
  const [method, gaps, auditRaw, statesRaw, condAuditRaw, condRaw, tableRaw] = await Promise.all([
    fs.readFile(path.join(dir, 'METHOD.md'), 'utf8'),
    fs.readFile(path.join(dir, 'GAPS.md'), 'utf8'),
    fs.readFile(path.join(dir, 'AUDIT.json'), 'utf8').catch(() => ''),
    fs.readFile(path.join(dir, 'state-prices.json'), 'utf8').catch(() => ''),
    fs.readFile(path.join(dir, 'CONDITIONS-AUDIT.json'), 'utf8').catch(() => ''),
    fs.readFile(path.join(dir, 'conditions.json'), 'utf8').catch(() => ''),
    fs.readFile(path.join(process.cwd(), 'public', 'data', 'price-table.json'), 'utf8').catch(() => ''),
  ]);
  const m = md(method.replace(/^#\s.*\n/, ''));
  const g = md(gaps.replace(/^#\s.*\n/, ''));
  /* GAPS.md numbers its gaps as "### 1. The work you missed"; the cards link to them. */
  const gapList = [...gaps.matchAll(/^###\s+(\d+)\.\s+(.+)$/gm)].map((x) => {
    const text = `${x[1]}. ${x[2].trim()}`;
    return { n: x[1], title: x[2].trim(), id: text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') };
  });
  const audit: AuditFile | null = auditRaw ? JSON.parse(auditRaw) : null;
  const states: StatePrices | null = statesRaw ? JSON.parse(statesRaw) : null;
  const hasIntegrityPage = existsSync(path.join(process.cwd(), 'app', 'integrity', 'page.tsx'));
  const condAudit: ConditionsAudit | null = condAuditRaw ? JSON.parse(condAuditRaw) : null;
  const conds: ConditionsFile | null = condRaw ? JSON.parse(condRaw) : null;
  const table: { items: TableRow[] } | null = tableRaw ? JSON.parse(tableRaw) : null;
  const rowById = new Map((table?.items ?? []).map((r) => [r.id, r]));
  const condRows = conds?.conditions ?? [];
  const condPriced = condRows.filter((c) => c.price_row_id);
  /* the conditions whose year-ahead figure a federal agency published, by name, for the "Not built yet" line */
  const condGovNames = condPriced.filter((c) => c.figure_is_government_publication).map((c) => c.label.toLowerCase());
  const andList = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
  const condUnpriced = condRows.filter((c) => !c.price_row_id);
  const icdYears = conds?._icd10cm_source?.checked_against ?? [];
  const condSexed = condRows.filter((c) => c.sex_note);
  const condSexBlank = condRows.filter((c) => !c.sex_note);
  /* Order the dots the way the counts read: the ones with the thing first. */
  const condNoCode = condRows.filter((c) => !c.icd10cm).length;

  /* How each class of figure is made: counted from the audit, not asserted. */
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
  const classMax = classes.length ? classes[0][1].n : 1;

  /* The files, one card each. A row that cites two files ("oppsb+rvu") counts for both. */
  const idsBySource = new Map<string, string[]>();
  const agencyBySource = new Map<string, string[]>();
  for (const r of audit?.results ?? []) {
    for (const k of (r.source_key ?? '').split('+').filter(Boolean)) {
      idsBySource.set(k, [...(idsBySource.get(k) ?? []), r.id]);
      agencyBySource.set(k, [...(agencyBySource.get(k) ?? []), r.agency === 'Centers for Medicare & Medicaid Services' ? 'CMS' : (r.agency ?? '')]);
    }
  }
  const sourceCards: SourceCard[] = Object.entries(audit?.sources ?? {}).map(([key, s]) => {
    const rows = (idsBySource.get(key) ?? []).map((id) => rowById.get(id)).filter((r): r is TableRow => !!r);
    const isPaper = (s.url ?? '').includes('pmc.ncbi.nlm.nih.gov');
    const agency = mostCommon(agencyBySource.get(key) ?? []) ?? (/^CMS\b/.test(s.title ?? '') ? 'CMS' : undefined);
    const yearFromTitle = (s.title ?? '').match(/\b(?:CY ?)?(20\d\d)\b/)?.[1];
    const isGpci = s.file === 'GPCI2026.csv';
    const isGeo = (s.file ?? '').startsWith('MUP_PHY');
    return {
      key, title: s.title ?? key, url: s.url, file: s.file, sha256: s.sha256, error: s.error, retrieved: s.retrieved,
      agency: isPaper && agency ? `Peer-reviewed, ${agency} data` : agency,
      years: rows.length ? [...new Set(rows.map((r) => r.year))] : yearFromTitle ? [yearFromTitle] : [],
      bases: [...new Set(rows.map((r) => basisName(r.basis)))],
      rows: rows.length,
      feeds: isGpci && audit?.localities ? `${audit.localities.figures.toLocaleString('en-US')} locality figures, with the relative value file`
        : isGeo && audit?.alternates ? `${audit.alternates} CY2024 companion figures: the average submitted charge and the average allowed amount`
        : null,
      population: rows.length ? plain(mostCommon(rows.map((r) => r.population)) ?? '') || null : null,
      doesNotDescribe: (() => {
        const t = mostCommon(rows.map((r) => sameQuote(r.coverage_statement.match(DOES_NOT)?.[1] ?? null)));
        return t ? plain(t) : null;
      })(),
    };
  });
  const maxSourceRows = Math.max(1, ...sourceCards.map((c) => c.rows));
  const hashed = sourceCards.filter((s) => s.sha256).length;

  /* The worked example on the price path: a synonym from the table, read by the
     rules reader itself when this page is built. */
  const egRow = rowById.get('cms-99213');
  const egPhrase = egRow?.plain_language_synonyms?.[0];
  const egMapped = egPhrase ? mapUtterance(egPhrase, TABLE) : null;
  const egHit = egMapped?.item ? rowById.get(egMapped.item.id) : undefined;
  const egAudit = egHit ? audit?.results.find((r) => r.id === egHit.id) : undefined;
  const egSource = egAudit?.source_key ? audit?.sources[egAudit.source_key.split('+')[0]] : undefined;
  const example: PathExample | null = egPhrase && egHit && egHit.value_usd !== null ? {
    phrase: egPhrase,
    unitId: egHit.id,
    unitLabel: egHit.label,
    code: egAudit?.code ?? undefined,
    evidence: egAudit?.evidence,
    value: money(egHit.value_usd),
    year: egHit.year,
    basis: basisName(egHit.basis),
    population: egHit.population,
    doesNotDescribe: (() => { const t = egHit.coverage_statement.match(DOES_NOT)?.[1]; return t ? plain(t) : null; })(),
    sourceTitle: egHit.source_title ?? egSource?.title ?? '',
    sourceUrl: egHit.source_url ?? egSource?.url ?? '',
    sha: egSource?.sha256,
  } : null;

  /* One worked locality, computed here from the published GPCIs so the page
     shows the arithmetic rather than describing it. */
  const iowa = states?.localities.find((l) => l.state === 'IA');
  const iowaKey = iowa ? `${iowa.state}-${iowa.locality}` : '';
  const iowa99213 = states?.items['cms-99213']?.[iowaKey];
  const localityCount = states?.localities.length ?? 0;
  const localityRows = states ? Object.keys(states.items).length : 0;

  const TOC: TocItem[] = [
    ...(audit ? [{ id: 'audit', text: 'The audit' },
                 { id: 'classes', text: 'How each class of figure is made' },
                 { id: 'sources', text: 'The files, and what they hash to' }] : []),
    ...(states && iowa && iowa99213 ? [{ id: 'locality', text: 'Where you live' }] : []),
    ...(conds ? [{ id: 'conditions', text: 'Which condition, and its code' },
                 { id: 'ai', text: 'How the AI reads a story' },
                 { id: 'sex', text: 'Sex differences' }] : []),
    { id: 'hhs-research', text: "Built on HHS's own research" },
    { id: 'take-the-data', text: 'Take the data' },
    { id: 'method-doc', text: 'The method, written out in full' },
    { id: 'could-not-price', text: 'What we could not price, and why' },
    { id: 'not-built', text: 'Not built yet' },
  ];

  const meters = audit ? [
    { icon: G.check, on: audit.pass, of: audit.rows, text: 'rows reproduce from their source file' },
    ...(audit.localities && audit.localities.figures > 0
      ? [{ icon: G.map, on: audit.localities.pass, of: audit.localities.figures, text: 'locality figures reproduce at the cent' }] : []),
    { icon: G.file, on: hashed, of: sourceCards.length, text: 'published files, each downloaded and hashed' },
    ...(condAudit ? [{ icon: G.shield, on: condAudit.pass, of: condAudit.checks, text: 'condition checks pass' }] : []),
  ] : [];

  return (
    <section className="step mx">
      <MethodMotion />
      {/* ---------- hero: the site's one inner-page hero (Kit PageHero) ---------- */}
      <div className="wrap mx-top">
        {/* The h1 was once an h2, which left /method with no h1: the one page that explains
            every number had no top-level heading for a screen reader to land on. */}
        <PageHero
          eyebrow="How this number is made"
          title="Every figure, and the file it was read from"
          lead={<>Every priced line comes from a published federal file: a row read out of it, or the product of its
            figures with the formula printed. We model nothing.</>}
          art={{ light: '/img/v2/4b-method-hero.webp', dark: '/img/v2/4b-method-hero-dark.webp', width: 1800, height: 720, position: '45% 50%' }}
        >
          <Cav label="Shown apart">
            The two long COVID year-ahead rows (total and out of pocket) come from elsewhere: a peer-reviewed
            analysis of a federal survey, labelled as that and never added to a total.
          </Cav>
        </PageHero>
        {/* ---------- contents, straight under the hero below 1024 px (JUDGE-2 fix 9): the
            same list as the rail; the rail beside the sections takes over from 1024 px.
            Both carry .mx-rail, so MethodMotion marks the section being read in either. ---------- */}
        <nav className="mx-rail mx-rail-top" aria-label="On this page">
          {/* the count says the row runs on past the screen's edge */}
          <p className="mx-rail-h">On this page: {TOC.length} sections</p>
          <ul>{TOC.map((t) => <li key={t.id}><a href={`#${t.id}`}>{t.text}</a></li>)}</ul>
        </nav>
        {/* ---------- the audit at a glance: four counts, each drawn as a full bar ---------- */}
        {meters.length > 0 && (
          <ul className="mx-glance" aria-label="The audit at a glance" data-motion="">
            {meters.map((x, i) => (
              <li key={i} style={{ ['--i' as string]: i }}>
                <span className="mx-glance-ic"><Glyph g={x.icon} size={20} /></span>
                <b>{x.on === x.of ? x.on.toLocaleString('en-US') : `${x.on.toLocaleString('en-US')} of ${x.of.toLocaleString('en-US')}`}
                  {x.on === x.of && <span className="mx-of"> of {x.of.toLocaleString('en-US')}</span>}</b>
                <span className="mx-glance-t">{x.text}</span>
                <span className="mx-meter" aria-hidden="true"><i style={{ width: `${Math.round((x.on / Math.max(1, x.of)) * 100)}%` }} /></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="wrap method-page">
        {/* ---------- the one rule ---------- */}
        <aside className="mx-rule" aria-labelledby="the-one-rule">
          <div className="mx-rule-main">
            <p className="mx-rule-k"><Glyph g={G.ban} size={20} /> The one rule</p>
            <h2 id="the-one-rule" className="mx-rule-h">No model, average, heuristic or interpolation produces a dollar figure.</h2>
            <p className="mx-rule-p">
              If a unit of care is not in the table, the line comes back <strong>unpriced</strong> and is shown to you as
              unpriced, by name. <a href="#m-the-one-rule">The rule in full</a>
            </p>
          </div>
          <ul className="mx-rule-list">
            <li><Glyph g={G.spark} size={20} /><span>The AI reader names a unit of care, or nothing. <strong>Never a price.</strong></span></li>
            <li><Glyph g={G.rules} size={20} /><span>Care that was never received, and any span of time, are decided by the rules and never sent to the model.</span></li>
            <li><Glyph g={G.clock} size={20} /><span>No figure is adjusted for inflation. Where a figure is stale, its year is printed on its face.</span></li>
          </ul>
        </aside>

        {/* ---------- how a line gets its price, drawn ---------- */}
        <section className="mx-flow" aria-labelledby="how-it-prices">
          <div className="mx-flow-head">
            <h2 id="how-it-prices" className="mx-flow-h">How a line gets its price</h2>
            {example && <p className="mx-flow-sub">One phrase from the price table, followed through. The rules reader reads it when this page is built.</p>}
          </div>
          <PricePath rows={audit?.rows ?? null} ex={example} />
          <p className="mx-flow-note">
            Care that was never received, and any span of time, are decided by the rules and never sent to the
            model. <a href="#ai">How the AI reads a story</a>
          </p>
        </section>

        <div className="mx-body">
        <nav className="mx-rail mx-rail-side" aria-label="On this page">
          <p className="mx-rail-h">On this page</p>
          <ul>{TOC.map((t) => <li key={t.id}><a href={`#${t.id}`}>{t.text}</a></li>)}</ul>
        </nav>
        <div className="mx-main">
        {audit && (
          <>
            <Sec id="audit" icon={G.check} title="The audit"
              lead={<>A priced figure is either a row of a federal file or the product of figures in federal files, with the
                formula printed. Below: the formulas, the audit that re-derives every figure from scratch, and the files
                themselves.</>}>
            {audit.version_line && (
              <p className="mx-chips" aria-label="Audit summary">
                {audit.version_line.split(' · ').map((c) => <span key={c}>{c}</span>)}
              </p>
            )}
            <div className="mx-grid2">
              <div className="mx-card mx-card-big">
                <p className="mx-big"><strong>{audit.pass} of {audit.rows} rows reproduce from their source file</strong></p>
                <p className="mx-small">{audit.fail} disagree, {audit.unverified} could not be checked in that run.</p>
                <Cav label="Table version">
                  <code>{audit.version ?? audit.table_version}</code>, generated by this audit and printed under every
                  total in the ledger, on the appointment sheet, in the API and on every CSV: one string, not four.
                </Cav>
              </div>
              <div className="mx-card">
                <p className="mx-card-h"><Glyph g={G.code} size={20} /> One command</p>
                <p className="mx-small">
                  It is one command, and it does not trust this repository: it downloads each cited file
                  from its published URL, hashes it, and recomputes every figure.
                </p>
                <pre className="mx-cmd"><code>python3 data/verify_price_table.py</code></pre>
              </div>
            </div>
            <Fold summary="What counts as a pass, and how we know a failure would show">
              <p>
                A row passes only when the number AND the sentence that names it are found in the
                source. UNVERIFIED means the source could not be fetched or parsed in that run. It is
                never a quiet pass. The script exits non-zero on a single disagreement, and it has been
                proven to: planting eight wrong values produced eight failures.
              </p>
            </Fold>
            {typeof audit.alternates === 'number' && audit.alternates > 0 && (
              <Fold summary={<><strong>{audit.alternates_pass} of {audit.alternates} CY2024 companion figures reproduce</strong></>}>
                <p>
                  These are the average submitted charge and the average allowed amount that ride beside a
                  fee-schedule figure. Each is read out of one named row of{' '}
                  <code>MUP_PHY_R26_P05_V10_D24_Geo.csv</code> (geography level, HCPCS code and place
                  of service), and the audit fails the row if the file it cites hashes to anything but
                  the file that was read. A figure on the screen is audited whether or not it is the
                  figure the row is named for.
                </p>
              </Fold>
            )}
            {audit.localities && audit.localities.figures > 0 && (
              <Fold summary={<><strong>{audit.localities.pass.toLocaleString('en-US')} of{' '}
                {audit.localities.figures.toLocaleString('en-US')} locality figures reproduce</strong></>}>
                <p>
                  Every code priced for every Medicare locality, re-derived here from{' '}
                  <code>PPRRVU2026_Jul_nonQPP.csv</code> and <code>GPCI2026.csv</code>, both hashed
                  below. The published table used to carry a verdict its own generator had written
                  about its own output; this is a second run, from the files.
                </p>
              </Fold>
            )}
            </Sec>

            <Sec id="classes" icon={G.table} title="How each class of figure is made"
              lead="Every class of figure in the table, how many rows it covers and how many reproduce, counted from the audit.">
            <div className="mx-tablecard" data-motion="">
              <table className="mx-table">
                <thead>
                  <tr>
                    <th scope="col">How the figure is produced</th>
                    <th scope="col" className="r">Rows</th>
                    <th scope="col" className="r">Reproduce</th>
                    <th scope="col">Agency</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(([k, v], i) => (
                    <tr key={k}>
                      <td className="mx-td-name">{k}</td>
                      <td className="r" data-label="Rows">
                        <span className="mx-bar" aria-hidden="true"><i style={{ width: `${Math.max(3, Math.round((v.n / classMax) * 100))}%`, ['--k' as string]: i }} /></span>
                        {v.n}
                      </td>
                      <td className="r" data-label="Reproduce">{v.pass}</td>
                      <td data-label="Agency">{[...v.agencies].join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mx-formula">
              <p className="mx-card-h">The physician fee schedule publishes no dollar column</p>
              <p className="mx-eq" aria-label={`Relative Value Units times the conversion factor, $${audit.conversion_factor.toFixed(4)} for CY2026, equals the payment`}>
                <span className="mx-eq-t"><b>Relative Value Units</b><small>read in the CMS file</small></span>
                <span className="mx-eq-op" aria-hidden="true">&times;</span>
                <span className="mx-eq-t"><b>${audit.conversion_factor.toFixed(4)}</b><small>conversion factor, CY2026</small></span>
                <span className="mx-eq-op" aria-hidden="true">=</span>
                <span className="mx-eq-t is-out"><b>the payment</b><small>as CMS defines it</small></span>
              </p>
              <Cav label="DERIVED, not VERIFIED">
                That multiplication is ours, which is why those rows are marked DERIVED rather than VERIFIED, and why
                the RVUs are quoted inside the row so you can redo it.
              </Cav>
              <Cav label="Laboratory rows">The laboratory rows need no arithmetic at all: the rate is a column on the file.</Cav>
            </div>
            </Sec>

            <Sec id="sources" icon={G.file} title="The files, and what they hash to"
              lead="Each card is one published file: who published it, what it prices here, who it describes and who it does not.">
              <SourceCards cards={sourceCards} maxRows={maxSourceRows} />
            </Sec>
          </>
        )}

        {states && iowa && iowa99213 && (
          <Sec id="locality" icon={G.map} title="Where you live"
            lead={<>Medicare does not pay one national price. It multiplies each half of the payment by a
              geographic practice cost index published for that locality, so the same code is a
              different allowed amount in {localityCount} Medicare localities. {localityRows} of our
              rows carry a locality figure.</>}>
            <div className="mx-grid2">
              <div className="mx-card mx-calc" aria-label={`Worked example for ${iowa.name}, CPT 99213`}>
                <p className="mx-card-h">Worked, for {iowa.name} and CPT 99213</p>
                <ol className="mx-calc-rows">
                  <li><span>work</span><span>1.30 × {iowa.pw}</span></li>
                  <li><span>+ practice expense</span><span>1.46 × {iowa.pe}</span></li>
                  <li><span>+ malpractice</span><span>0.09 × {iowa.mp}</span></li>
                  <li><span>all times</span><span>${states._conversion_factor.toFixed(4)}</span></li>
                </ol>
                <p className="mx-calc-total"><span>=</span> <strong>{money(iowa99213)}</strong></p>
                <p className="mx-small">The national figure, with every index set to 1.000, is $95.19.</p>
              </div>
              <div className="mx-card">
                <p className="mx-card-h">The formula</p>
                <pre className="mx-cmd"><code>{states._formula}</code></pre>
                <p className="mx-small">
                  Inputs: {states._source_files.join(' · ')}. Rebuild with{' '}
                  <code>python3 data/build_state_prices.py</code>.
                </p>
              </div>
            </div>
            <Cav label="Checked">
              Every one of these figures is
              re-derived from the two CMS files by <code>python3 data/verify_price_table.py</code>
              {audit?.localities
                ? `: ${audit.localities.pass.toLocaleString('en-US')} of `
                  + `${audit.localities.figures.toLocaleString('en-US')} at the cent, ${audit.localities.fail} off`
                : ''}
              ; the per-row build log is <code>data/STATE-PRICES-AUDIT.txt</code>.
            </Cav>
          </Sec>
        )}

        {conds && (
          <>
            <Sec id="conditions" icon={G.book} title="Which condition, and its code">
            <div className="mx-callout is-key">
              <p data-testid="priced-by-care">
                <strong>Every line is priced by the care itself, never by a diagnosis code.</strong> The
                same visits and tests cost the same on this ledger whether the chart said POTS, ME/CFS or
                nothing at all. The condition you choose changes only the year-ahead figure, which is shown apart and never added to the total.
              </p>
            </div>
            <div className="mx-split">
              <p className="mx-p">
                <strong>{condPriced.length} of the {condRows.length} conditions have a published
                annual figure. {condUnpriced.length} do not</strong>, and for those the panel says so
                and offers to count the absence, because a missing federal figure is a finding about
                the data, not a blank to fill with the nearest number to hand.
              </p>
              <Dots on={condPriced.length} total={condRows.length}
                label={`${condPriced.length} of ${condRows.length} conditions have a published annual figure`}
                onKey="Published figure" offKey="None published" />
            </div>
            <Cav label="How it renders">
              The year-ahead figure is not one number written into the page. You choose the
              condition; the panel renders whatever the row for that condition says, with its
              year, its population and the kind of figure it is.
            </Cav>
            <Cav label="Adding one">
              Adding a condition is one object in <code>data/conditions.json</code>, and it may only be added once
              its figure exists as an audited row in the price table.
            </Cav>
            <Cav label="Every condition">
              Each figure it carries with its sources, and how to add one: <Link href="/conditions">every condition and its figures</Link>.
            </Cav>
            <Fold summary={<><strong>All {condRows.length} conditions</strong>, each with its ICD-10-CM code and whether a year-ahead figure is published</>}>
              <ul className="mx-conds" aria-label="The conditions, their codes and their year-ahead figures">
                {condRows.map((c) => (
                  <li key={c.id} className="mx-cond">
                    <p className="mx-cond-name">{c.label}</p>
                    <p className="mx-cond-code">
                      {c.icd10cm
                        ? <><span className="sr-only">ICD-10-CM </span><code>{c.icd10cm}</code> {c.icd10cm_title}
                            {c.icd10cm_billable === false && <> (category heading)</>}</>
                        : <span className="blank">No ICD-10-CM code, on purpose</span>}
                    </p>
                    <p className={`mx-pill ${c.price_row_id ? 'is-on' : 'is-off'}`}>
                      <span className="sr-only">Year-ahead figure: </span>
                      {c.price_row_id
                        ? <>Published, {c.figure_kind === 'excess' ? 'excess' : 'condition-attributed'}</>
                        : <>None published</>}
                    </p>
                  </li>
                ))}
              </ul>
            </Fold>
            <Fold summary={<><strong>{condNoCode} of the {condRows.length} rows
              carry no ICD-10-CM code.</strong> Why</>}>
              <p>{conds._no_code_is_not_an_oversight}</p>
            </Fold>
            {icdYears.length > 0 && (
              <Fold summary={`Every code re-read in the CDC/NCHS files for ${icdYears.map((y) => `FY${y.fiscal_year}`).join(' and ')}`}>
                <p>
                  Every code was re-read in the code-description file CDC/NCHS publishes for{' '}
                  {icdYears.map((y) => `FY${y.fiscal_year}`).join(' and ')}: the long
                  description, character for character, and the flag that says whether the code may
                  go on a claim. {conds._icd10cm_source?.why_two_years}
                </p>
              </Fold>
            )}
            {condAudit && (
              <Fold summary={<><strong>{condAudit.checks} checks: {condAudit.pass} pass, {condAudit.fail} fail,{' '}
                {condAudit.unverified} unverified</strong>, run {condAudit.generated.slice(0, 10)}</>}>
                <p>
                  It re-reads every code in the CDC files and every priced figure in the paper or
                  brief the row cites, and it fails if a condition with no figure has a dollar
                  amount anywhere in its record. Run it:{' '}
                  <code>python3 data/verify_conditions.py</code>; the result is{' '}
                  <code>data/CONDITIONS-AUDIT.json</code>.
                </p>
              </Fold>
            )}
            <p className="step-actions">
              <a className="btn ghost" href={conds._icd10cm_source?.browser_url ?? 'https://icd10cmtool.cdc.gov/'}
                 target="_blank" rel="noopener noreferrer">CDC ICD-10-CM browser</a>
            </p>
            </Sec>

            <Sec id="ai" icon={G.spark} title="How the AI reads a story"
              lead="The rules read first. A language model sees only the phrases they leave blank, and may answer with a unit of care or with nothing.">
            <div className="mx-grid2">
              <div className="mx-card">
                <p className="mx-card-h"><Glyph g={G.rules} size={20} /> The rules go first</p>
                <p className="mx-small">
                  A person types what happened in her own words. The deterministic rules in this codebase read the story first and map
                  every phrase they recognise to a unit of care.
                </p>
                <p className="mx-small">
                  A second visit to the same specialist is priced as a return visit (9921N), not a second new-patient visit (9920N).
                </p>
              </div>
              <div className="mx-card">
                <p className="mx-card-h"><Glyph g={G.eye} size={20} /> What the model is shown</p>
                <p className="mx-window" aria-hidden="true">
                  <span className="is-off">the rest of the story</span>
                  <span className="is-ctx">up to 4 words</span>
                  <span className="is-ph">the phrase</span>
                  <span className="is-ctx">up to 4 words</span>
                  <span className="is-off">the rest of the story</span>
                </p>
                <p className="mx-small">
                  Each phrase the rules leave blank is then shown to a language model,
                  with at most four words on either side of it and never the rest of the story, together with the catalog of units as
                  ids and labels. The model may answer with one of those ids, or with nothing.
                </p>
              </div>
              <div className="mx-card">
                <p className="mx-card-h"><Glyph g={G.ban} size={20} /> What it never does</p>
                <p className="mx-small">
                  The model never sees a price and never returns one. The published federal table prices the unit it named, exactly as
                  it prices a unit the rules matched. Care that was never received and any span of time are decided by the rules and are
                  never sent to the model, so nothing that did not happen can be priced by a guess.
                </p>
              </div>
              <div className="mx-card">
                <p className="mx-card-h"><Glyph g={G.check} size={20} /> How you can tell</p>
                <p className="mx-small">
                  A chip the model named carries the
                  mark <span className="lp-chip mx-ai-chip"><span className="lp-ai">AI read</span></span> and the person can change it like any other line.
                </p>
              </div>
            </div>
            <Fold summary="Which model reads it, and running without one">
              <p>
                The reader is <a href="/api/map">POST /api/map</a>. It uses one provider, chosen by which key the site holds:
                OpenAI on this site (gpt-5.6-luna, with gpt-5.5 and then gpt-5.4-mini behind it), or Anthropic, or Cloudflare Workers AI when neither
                key is set. The reply names the model that read the phrases, or reports the rules alone when it was not reachable,
                so the tool never waits on it. Run without it by
                deleting the key: the product is the same, minus the filled blanks.
              </p>
            </Fold>
            </Sec>

            <Sec id="sex" icon={G.people} title="Sex differences"
              lead={<>{SEX_ASK_ORIGIN} This is the answer, and it is held to the same standard as every
                dollar on this site: a named federal file, the URL the row itself publishes, re-read
                by a script anyone can run, or the row says plainly that the file is silent.</>}>
            <Fold heading="What we ask" hint="One optional question, asked as sex, not gender. Nothing is pre-selected.">
              <p>
                One optional question on the burden survey: <strong>{CONTEXT.sex.label}</strong>,
                with {CONTEXT.sex.options.map((o: string, i: number) => (
                  <span key={o}>{i > 0 ? ', ' : ''}<em>{o}</em></span>
                ))}. It is asked as sex, not gender, because sex is the variable the federal
                prevalence files below are published by. The framing is NIH&rsquo;s own:{' '}
                <a href={SEX_POLICY_URL} target="_blank" rel="noopener noreferrer">{SEX_POLICY}</a>{' '}
                states the expectation that researchers &ldquo;account for the possible role of sex
                as a biological variable&rdquo;, in data collection, analysis and reporting alike.
              </p>
              <p>
                Nothing is pre-selected, nothing is filled in for you, and &ldquo;Prefer not to
                say&rdquo; is recorded as the stated answer it is, distinct from leaving the
                question alone, which is published as &ldquo;not stated&rdquo;.
              </p>
            </Fold>

            <Fold heading="What we publish" hint={`Who answered, and how each sex ranked the five burdens. Any answer under ${SMALL_CELL_MIN} responses is withheld.`}>
              <p>
                Two things, and they are not the same thing. <strong>Who answered</strong>, on{' '}
                <Link href="/register">the register</Link>, under the same rule as the state: any
                answer holding fewer than {SMALL_CELL_MIN} responses is withheld, and the number of
                withheld cells and the responses they hold are published, so the table still adds
                up.
              </p>
              <p>
                And <strong>how each sex ranked the five burdens</strong>, the reason the
                question exists, since a ranking that cannot be read by sex cannot answer the ask.
                That one is a cross-tabulation, so it is suppressed on the server before it is
                served rather than hidden in the page: narrowing a group twice makes a small cell
                small twice. Each group is the same count of the same answers as the total above
                it, computed by the same function. No weighting, no imputation, no extrapolation.
              </p>
              <p>
                The survey holds no name, no account and no identifier, so a sex answer joins to
                nothing. It is a column in an anonymous count, and that is the whole of it.
              </p>
            </Fold>

            <Fold heading="What the federal files do and do not split by sex" hint="None of the price rows. Where sex appears, it is prevalence, never cost.">
              <p>
                <strong>None of the price rows.</strong> The CMS physician fee schedule, the
                clinical laboratory fee schedule and the hospital outpatient file price a{' '}
                <em>code</em>, not a person: they carry no sex field, so no figure on this site is
                adjusted by sex and none of them can be read by it.
              </p>
              <p>
                Where sex appears in the
                federal record for these conditions, it appears in <em>prevalence</em> (how
                many people have the thing), and never in what a year of it costs.
              </p>
            </Fold>

            <div className="mx-split mx-sex-lead">
              <p className="mx-p">
                <strong>{condSexed.length} of the {condRows.length} conditions carry a federal
                sentence about sex. {condSexBlank.length} do not</strong>, and each of those says
                which page was read and where it stops, because a silence in the federal data is a
                finding about the data.
              </p>
              <Dots on={condSexed.length} total={condRows.length}
                label={`${condSexed.length} of ${condRows.length} conditions carry a federal sentence about sex`}
                onKey="A federal sentence about sex" offKey="The file is silent" />
            </div>
            <Fold summary={<><strong>What a federal file says by sex</strong>, for each of the {condRows.length} conditions, with the page read</>}>
              <ul className="mx-sexnotes" aria-label="What a federal file says by sex, for each condition">
                {[...condSexed, ...condSexBlank].map((c) => (
                  <li key={c.id} className={`mx-sexnote${c.sex_note ? '' : ' is-blank'}`}>
                    <p className="mx-cond-name">{c.label}</p>
                    <p className="mx-small">{c.sex_note ? undash(c.sex_note) : <span className="blank">{c.sex_note_blank_reason && undash(c.sex_note_blank_reason)}</span>}</p>
                    <p className="mx-sexnote-src">
                      {c.sex_note_source_url
                        ? <a className="mx-rowlink" href={c.sex_note_source_url} target="_blank" rel="noopener noreferrer">{c.sex_note_source}</a>
                        : <span className="blank">File: none found</span>}
                    </p>
                  </li>
                ))}
              </ul>
            </Fold>
            <Fold summary={<><strong>The rule every sex note is held to</strong>, and what it means for the price rows</>}>
              <p>{undash(conds._sex_note_rule ?? '')}</p>
            </Fold>
            {condAudit && (
              <Cav label="Re-read">
                Every sentence in that table is re-read in its own source by{' '}
                <code>python3 data/verify_conditions.py</code>, which fails if the file no longer
                says it, if a note carries a dollar amount, or if any priced row grows a field
                naming sex. Last run {condAudit.generated.slice(0, 10)}:{' '}
                <strong>{condAudit.pass} pass, {condAudit.fail} fail, {condAudit.unverified}{' '}
                unverified</strong> across the whole condition file.
              </Cav>
            )}
            </Sec>
          </>
        )}

        {/* ASKS row 4 (Office Hours 1, 20 Aug 2026): the federal lead asked this team to read
            the diagnosis-journey reports HHS sponsored under Health+. The quote below is the Lyme
            report's recommendation 03 for archetype four, word for word (intel/coforma-hhs-reports/
            lyme-hcd-report-FULLTEXT.txt lines 1642-1645). No change on the change log is credited
            to these reports, so none is claimed here. URLs: OFFICE-HOURS-NOTES-2026-08-20.md 88-92,
            each returned 200 on 30 Sep 2026. */}
        <Sec id="hhs-research" icon={G.quote} title="Built on HHS's own research"
          lead={<>HHS has already asked people what a long search for a diagnosis is like. Through its Health+
            program, the design firm Coforma followed people with Lyme disease, long COVID and sickle cell
            disease and wrote up what they told them. The federal lead for this challenge asked us to start
            from those reports, and we read them.</>}>
          <ul className="mx-reports">
            <li className="mx-card">
              <a className="mx-rowlink" href="https://coforma.io/perspectives/health-lyme-disease-human-centered-design-report-highlights-patient-journeys"
                 target="_blank" rel="noopener noreferrer">Lyme Disease Human-Centered Design Report</a>
              <p className="mx-small">April 2021. Written for LymeX, a partnership between HHS and the Steven &amp; Alexandra Cohen Foundation.</p>
            </li>
            <li className="mx-card">
              <a className="mx-rowlink" href="https://coforma.io/case-studies/health-plus-long-covid" target="_blank" rel="noopener noreferrer">Long
              COVID Human-Centered Design Report</a>
              <p className="mx-small">2022. Sponsored by HHS, Office of the Assistant Secretary for Health.</p>
            </li>
            <li className="mx-card">
              <a className="mx-rowlink" href="https://coforma.io/reports" target="_blank" rel="noopener noreferrer">Sickle Cell Disease
              Human-Centered Design Report</a>
              <p className="mx-small">June 2020, with the other two on Coforma&rsquo;s reports page.</p>
            </li>
          </ul>
          <figure className="mx-quote">
            <figcaption className="mx-small">
              The Lyme report sorts patients into four archetypes and makes recommendations for each. For the fourth,
              &ldquo;Life with Lyme&rdquo;, the third recommendation reads:
            </figcaption>
            <blockquote className="hhs-quote">
              &ldquo;Develop and maintain a cost-of-care resource that estimates the total cost of types of Lyme
              care, to be used in informed discussions on the viability of a treatment option on a
              patient-by-patient situational basis.&rdquo;
            </blockquote>
          </figure>
          <Cav label="One difference we hold to">
            That is the need this ledger works on: it lists published federal
            figures line by line and never estimates one. Lyme disease is listed with its ICD-10-CM code on
            the <Link className="mx-rowlink" href="/conditions">conditions page</Link>. A Lyme search is read
            the same way as any other, one visit and one test at a time.
          </Cav>
          <p className="mx-links">
            More: <a className="mx-rowlink" href="https://coforma.io/health-plus" target="_blank" rel="noopener noreferrer">the Health+
            program</a> <a className="mx-rowlink" href="https://healthplusprogram.io/" target="_blank" rel="noopener noreferrer">its own site</a>
          </p>
        </Sec>

        <Sec id="take-the-data" icon={G.download} title="Take the data"
          lead="The whole table is published as open data, versioned, with every field described and the audit verdict carried on each row.">
          <ul className="mx-downloads">
            <li><a className="mx-dl" href="/data/price-table.csv" download><Glyph g={G.download} /><span><b>Price table</b><small>CSV</small></span></a></li>
            <li><a className="mx-dl" href="/data/price-table.json" download><Glyph g={G.download} /><span><b>Price table</b><small>JSON</small></span></a></li>
            <li><a className="mx-dl" href="/data/price-dictionary.csv" download><Glyph g={G.download} /><span><b>Data dictionary</b><small>CSV</small></span></a></li>
          </ul>
          <Cav label="Federal figures">U.S. Government works in the public domain.</Cav>
          <Cav label="Ours">
            Our labels, synonyms, coverage statements and combination rules are dedicated to the public domain under
            CC0 1.0. No attribution required.
          </Cav>
          <div className="mx-rules-card">
            <p className="mx-card-h">The combination rules travel with it</p>
            <p className="mx-chips mx-chips-code">
              <code>summable</code><code>mutually_exclusive_with</code><code>bundles_ancillaries</code>
            </p>
            <p className="mx-small">
              These say which figures may be added to which. A rule written only in prose is a wish; these are fields.
            </p>
          </div>
          {hasIntegrityPage && (
            <p className="mx-p">
              What the public sends back (corrections, gaps, rankings) is published too, and every row is
              hash-chained. <Link href="/integrity">How that chain works, and what it does not prove</Link>.
            </p>
          )}
        </Sec>

        <Sec id="method-doc" icon={G.book} title="The method, written out in full"
          lead="METHOD.md, displayed verbatim: the same file the data carries, nothing paraphrased.">
          <nav className="mx-doc-toc" aria-label="Contents of the method document">
            <ul>{m.toc.map((t) => <li key={t.id}><a href={`#m-${t.id}`}>{t.text}</a></li>)}</ul>
          </nav>
          <Fold summary={<><strong>Read the method document</strong>, {m.toc.length} sections</>}>
            <article className="prose mx-doc" dangerouslySetInnerHTML={{ __html: m.html.replace(/id="/g, 'id="m-') }} />
          </Fold>
        </Sec>

        <Sec id="could-not-price" icon={G.blank} title="What we could not price, and why"
          lead="GAPS.md, displayed verbatim. Each gap names what is missing, why, and what would fix it.">
          {gapList.length > 0 && (
            <ol className="mx-gaps" aria-label="The numbered gaps">
              {gapList.map((x) => (
                <li key={x.id}><a href={`#g-${x.id}`}><span className="mx-gap-n" aria-hidden="true">{x.n}</span><span>{x.title}</span></a></li>
              ))}
            </ol>
          )}
          <nav className="mx-doc-toc" aria-label="Contents of what we could not price">
            <ul>{g.toc.map((t) => <li key={t.id}><a href={`#g-${t.id}`}>{t.text}</a></li>)}</ul>
          </nav>
          <Fold summary={<><strong>Read what we could not price</strong>, in full</>}>
            <article className="prose mx-doc" dangerouslySetInnerHTML={{ __html: g.html.replace(/id="/g, 'id="g-') }} />
          </Fold>
        </Sec>

        {/* ASKS rank 8, second half: the kickoff deck asked teams to show their remaining gaps.
            Every item was checked against the code on 30 Sep 2026 (see R2-content.md). When one
            ships, it comes off this list in the same commit. */}
        <Sec id="not-built" icon={G.plus} title="Not built yet" lead="What people have asked for that this tool does not do today:">
          <ul className="mx-notbuilt">
            <li><Glyph g={G.clock} /><p><strong>Time.</strong> A line has no date, and there is no view of your ledgers across months.</p></li>
            <li><Glyph g={G.plus} /><p><strong>A second invisible illness with a year-ahead figure.</strong> {condPriced.length} of the {condRows.length} conditions here carry a published year-ahead figure.{condGovNames.length > 0 && <> The figures for {andList(condGovNames)} are federal publications;</>} long COVID&rsquo;s is a peer-reviewed analysis of a federal survey, not a federal file. Lyme disease is listed with its ICD-10-CM code.</p></li>
            <li><Glyph g={G.lock} /><p><strong>Your Medicare claims, brought in.</strong> The Blue Button 2.0 import is written against the CMS sandbox and stays off until CMS issues us credentials.</p></li>
            <li><Glyph g={G.send} /><p><strong>Corrections sent to the agency.</strong> Every &ldquo;Wrong&rdquo; is grouped by the agency that published the figure, ready to send. None has been sent yet.</p></li>
            <li><Glyph g={G.paper} /><p><strong>Disability paperwork as a burden.</strong> Applications and appeals are not yet counted on their own.</p></li>
          </ul>
        </Sec>
        <div className="step-actions"><Link className="btn ghost" href="/">Back to the ledger</Link></div>
        </div>
        </div>
      </div>
    </section>
  );
}
