/* ==========================================================================
   A tiny highlighter for the code on the technical pages (VISUAL tech,
   2026-09-30 night). It runs where the page is rendered, never in the
   browser, so colour costs no JavaScript. It only labels characters; it never
   changes one, so the text a person sees and copies is the text that ran.

   Three grammars, chosen per block:
     shell  curl lines, # comments, flags, $VARIABLES, quoted strings
     json   keys, strings, numbers, true/false/null, punctuation
     text   "Label:   value" reports, URLs and dollar amounts
   A block that mixes a curl call and its JSON answer is tokenized line by
   line: a line that starts with {, [, " or } reads as JSON.
   ========================================================================== */

export type Tok = { t: string; k?: 'key' | 'str' | 'num' | 'lit' | 'com' | 'pun' | 'cmd' | 'flag' | 'var' | 'muted' };
export type Lang = 'shell' | 'json' | 'text' | 'python' | 'auto';

const JSON_RE = /("(?:\\.|[^"\\\n])*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|\b(true|false|null)\b|([{}[\],:])/g;

function json(line: string, out: Tok[]) {
  let i = 0;
  for (const m of line.matchAll(JSON_RE)) {
    const at = m.index ?? 0;
    if (at > i) out.push({ t: line.slice(i, at) });
    if (m[1]) {
      const muted = m[1] === '"…"' || m[1].startsWith('"…');
      if (m[2]) { out.push({ t: m[1], k: muted ? 'muted' : 'key' }); out.push({ t: m[2], k: 'pun' }); }
      else out.push({ t: m[1], k: muted ? 'muted' : 'str' });
    } else if (m[3]) out.push({ t: m[3], k: 'num' });
    else if (m[4]) out.push({ t: m[4], k: 'lit' });
    else if (m[5]) out.push({ t: m[5], k: 'pun' });
    i = at + m[0].length;
  }
  if (i < line.length) out.push({ t: line.slice(i) });
}

/* A shell line. Single-quoted bodies (the -d '{…}' JSON) are tokenized as JSON
   inside their quotes, so the body a developer edits reads like JSON. A quote
   left open at the end of a line stays open on the next (multi-line -d). */
function shell(line: string, out: Tok[], st: { inQ: boolean }) {
  let i = 0;
  const flush = (to: number) => {
    if (to <= i) return;
    const seg = line.slice(i, to);
    let j = 0;
    for (const m of seg.matchAll(/(\$[A-Za-z_]\w*)|(^|\s)(curl|grep|head|cut|tar|cd|npm|java|python3?)(?=\s|$)|(\s-{1,2}[A-Za-z][\w-]*)|(&&|\||\\$)/g)) {
      const at = m.index ?? 0;
      if (at > j) out.push({ t: seg.slice(j, at) });
      if (m[1]) out.push({ t: m[1], k: 'var' });
      else if (m[3]) { if (m[2]) out.push({ t: m[2] }); out.push({ t: m[3], k: 'cmd' }); }
      else if (m[4]) out.push({ t: m[4], k: 'flag' });
      else if (m[5]) out.push({ t: m[5], k: 'pun' });
      j = at + m[0].length;
    }
    if (j < seg.length) out.push({ t: seg.slice(j) });
    i = to;
  };
  if (st.inQ) {
    const end = line.indexOf("'");
    const body = end < 0 ? line : line.slice(0, end);
    json(body, out);
    if (end < 0) return;
    out.push({ t: "'", k: 'str' });
    st.inQ = false;
    i = end + 1;
  }
  if (!st.inQ && /^\s*#/.test(line.slice(i))) { out.push({ t: line.slice(i), k: 'com' }); return; }
  while (i < line.length) {
    const rest = line.slice(i);
    const q = rest.search(/['"]|\s#/);
    if (q < 0) { flush(line.length); break; }
    const at = i + q;
    flush(at);
    const ch = line[at];
    if (ch === "'") {
      const end = line.indexOf("'", at + 1);
      out.push({ t: "'", k: 'str' });
      if (end < 0) { json(line.slice(at + 1), out); st.inQ = true; return; }
      json(line.slice(at + 1, end), out);
      out.push({ t: "'", k: 'str' });
      i = end + 1;
    } else if (ch === '"') {
      const m = /^"(?:\\.|[^"\\])*"/.exec(line.slice(at));
      const s = m ? m[0] : line.slice(at);
      /* a "…" string with $BASE inside keeps the variable visible */
      const v = s.split(/(\$[A-Za-z_]\w*)/);
      for (const part of v) if (part) out.push({ t: part, k: part.startsWith('$') ? 'var' : 'str' });
      i = at + s.length;
    } else {
      /* " #" starts a comment */
      out.push({ t: line.slice(at), k: 'com' });
      return;
    }
  }
}

function text(line: string, out: Tok[]) {
  const m = /^([A-Z][A-Za-z' ]{1,30}:)(\s+)(.*)$/.exec(line);
  let rest = line;
  if (m && !/^https?:/.test(line)) { out.push({ t: m[1], k: 'key' }); out.push({ t: m[2] }); rest = m[3]; }
  let i = 0;
  for (const x of rest.matchAll(/(https?:\/\/\S+)|(\$\d[\d,]*(?:\.\d+)?)|(\b\d{4}-\d{2}-\d{2}\b)/g)) {
    const at = x.index ?? 0;
    if (at > i) out.push({ t: rest.slice(i, at) });
    out.push({ t: x[0], k: x[1] ? 'str' : 'num' });
    i = at + x[0].length;
  }
  if (i < rest.length) out.push({ t: rest.slice(i) });
}

function python(line: string, out: Tok[]) {
  const hash = line.search(/#(?=(?:[^"']|"[^"]*"|'[^']*')*$)/);
  const code = hash < 0 ? line : line.slice(0, hash);
  let i = 0;
  for (const m of code.matchAll(/(f?"(?:\\.|[^"\\])*"|f?'(?:\\.|[^'\\])*')|\b(import|for|in|def|return|if|not|and|or|else|assert|print|None|True|False)\b|(\b\d+\b)/g)) {
    const at = m.index ?? 0;
    if (at > i) out.push({ t: code.slice(i, at) });
    if (m[1]) out.push({ t: m[1], k: 'str' });
    else if (m[2]) out.push({ t: m[2], k: /^(None|True|False)$/.test(m[2]) ? 'lit' : 'cmd' });
    else if (m[3]) out.push({ t: m[3], k: 'num' });
    i = at + m[0].length;
  }
  if (i < code.length) out.push({ t: code.slice(i) });
  if (hash >= 0) out.push({ t: line.slice(hash), k: 'com' });
}

/** Tokens per line. Joining every token's text, line by line, gives back the input exactly. */
export function highlight(code: string, lang: Lang = 'auto'): Tok[][] {
  const st = { inQ: false };
  let inJson = false;
  return code.split('\n').map((line) => {
    const out: Tok[] = [];
    if (lang === 'json') json(line, out);
    else if (lang === 'text') text(line, out);
    else if (lang === 'python') python(line, out);
    else {
      const trimmed = line.trimStart();
      if (!st.inQ && (/^[{[]/.test(trimmed) || (inJson && trimmed !== '' && !/^(#|curl|BASE=)/.test(trimmed)))) {
        json(line, out);
        inJson = true;
      } else {
        if (trimmed === '' || /^(#|curl|BASE=)/.test(trimmed)) inJson = false;
        shell(line, out, st);
      }
    }
    return out;
  });
}
