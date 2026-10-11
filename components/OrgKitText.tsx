/* ==========================================================================
   The words and links the organization kit (/adopt/kit) hands out. Pure, so
   the page, the tests and the channel view all read the same sentences.

   Nothing here is sent anywhere: the organization's name stays in the browser
   that typed it. Only the slug it becomes ever reaches our server, and only
   when someone answers through the link.
   ========================================================================== */
import { normalizeChannel } from '@/lib/survey-def';
import { WAYPOINT_BASE } from '@/lib/fhir';

/* Labels the site already uses for its own links, or that an answer with no
   link is counted under. An organization given one of these would have its
   answers mixed with ours, so the kit says so and asks for another. */
export const RESERVED_SLUGS = ['direct', 'register', 'advocate', 'demo', 'bench', 'ames', 'test'];

/** The organization's name as typed -> the slug the survey will count answers under, or null. */
export function slugFor(name: string): string | null {
  const full = normalizeChannel(name);
  if (!full) return null;
  /* A long name is cut at 24 characters. Cut at the last whole word inside
     that, when one leaves a label worth reading ("riverside-long-covid", not
     "riverside-long-covid-gro"). The survey reads the result unchanged. */
  const raw = String(name).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  if (raw.length <= 24) return full;
  const cut = raw.slice(0, 25).lastIndexOf('-');
  return cut >= 8 ? normalizeChannel(raw.slice(0, cut)) : full;
}

/** The address a link should carry. Production and its pages.dev twin print
 *  the canonical domain; a local or preview copy prints its own address, so a
 *  link made while testing never points real people at the wrong database. */
export function baseFor(origin: string | undefined | null): string {
  if (!origin) return WAYPOINT_BASE;
  try {
    const h = new URL(origin).hostname;
    if (h === 'waypointledger.org' || h === 'www.waypointledger.org' || h === 'waypoint-ledger.pages.dev') return WAYPOINT_BASE;
    return new URL(origin).origin;
  } catch { return WAYPOINT_BASE; }
}

export const surveyLink = (base: string, slug: string) => `${base}/survey?c=${slug}`;
export const countLink = (base: string, slug: string) => `${base}/register/channel?c=${slug}`;

/** The paste-ready paragraph, about sixty words, for a newsletter, a group post or a waiting-room screen. */
export function blurbFor(org: string, link: string): string {
  const who = org.trim() || 'We';
  const verb = org.trim() ? 'is sharing' : 'are sharing';
  return `${who} ${verb} a free survey about what the search for a diagnosis cost. `
    + 'It asks which of five costs weighed most: money out of pocket, time, paid work missed, '
    + 'unpaid care from family, and care you went without. No account and no name. '
    + 'What you say about yourself is published only as counts, and small groups are never shown. '
    + link;
}

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** The three sentences on the printed flyer. */
export function flyerSentences(org: string): [string, string, string] {
  const who = org.trim() || 'this group';
  return [
    'Tell us which costs of your search for a diagnosis weighed most: money, time, paid work, unpaid care from family, or care you went without.',
    'There is no account and no name, and every question about yourself is optional.',
    `Answers through this code are counted together, so ${who} can see what its community said once 11 or more have answered.`,
  ];
}

/* The privacy promise, quoted word for word from /privacy ("What the burden
   survey sends"). tests/org-kit.test.ts reads app/privacy/page.tsx and fails if
   this sentence is no longer on that page, so the flyer can never quote a
   promise the site has stopped making. */
export const PRIVACY_QUOTE = 'What you said about yourself is published only as counts, at /api/survey and on the register, and any answer fewer than 11 people gave is not shown there: it is counted in one line, “fewer than 11, not shown”, and never named.';

/** The one-line, no-script button for a clinic or agency site. Plain HTML: it
 *  runs no code on the host page and passes any content security policy. */
export function embedAnchor(base: string): string {
  return `<a href="${base}/" target="_blank" rel="noopener" style="display:inline-block;min-height:44px;box-sizing:border-box;padding:12px 20px;border-radius:999px;background:#0e2a3a;color:#fff;font:600 16px/1.2 system-ui,sans-serif;text-decoration:none">Price your diagnostic journey</a>`;
}

/** The script version: the same button, drawn by /embed.js in its own shadow root. */
export function embedScript(base: string): string {
  return `<script src="${base}/embed.js" async></script>`;
}
