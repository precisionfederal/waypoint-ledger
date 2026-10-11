import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHUNK_MATCHER_SRC, CHUNK_RELOAD_KEY, chunkRecoveryScript } from '../lib/chunk-recovery';

/* The matcher is built from the same source string the inline script carries. */
// eslint-disable-next-line no-new-func
const isChunkLoadError = new Function(`return ${CHUNK_MATCHER_SRC}`)() as (e: unknown) => boolean;

describe('chunk-load matcher', () => {
  it('matches what webpack throws', () => {
    const e = Object.assign(new Error('Loading chunk 5005 failed.\n(error: https://waypointledger.org/_next/static/chunks/5005-15375d55f7bc6905.js)'), { name: 'ChunkLoadError' });
    expect(isChunkLoadError(e)).toBe(true);
    expect(isChunkLoadError({ name: 'ChunkLoadError', message: '' })).toBe(true);
  });
  it('matches the messages alone, JS and CSS', () => {
    expect(isChunkLoadError(new Error('Loading chunk 8974 failed.'))).toBe(true);
    expect(isChunkLoadError({ message: 'Uncaught ChunkLoadError: Loading chunk 12 failed.' })).toBe(true);
    expect(isChunkLoadError(new Error('Loading CSS chunk 431 failed.\n(/_next/static/css/a.css)'))).toBe(true);
  });
  it('ignores everything else', () => {
    for (const e of [null, undefined, '', 'Loading chunk 5 failed', 42, {}, new TypeError('x is undefined'),
      new Error('Loading chunk failed'), new Error('Loading chunk abc failed'), { name: 'Error', message: 'Failed to fetch' },
      { message: 42 }]) {
      expect(isChunkLoadError(e), String(e)).toBe(false);
    }
  });
});

/* The whole script, run against a fake window: one reload per build, then the line. */
type Handler = (e: unknown) => void;
function run(stamp: string, store: Map<string, string> | 'throws', online = true) {
  const handlers: Record<string, Handler> = {};
  let reloads = 0;
  const appended: { text: string }[] = [];
  const mkEl = () => {
    const el = { kids: [] as unknown[], style: {}, attrs: {} as Record<string, string>, textContent: '', type: '', onclick: null as null | (() => void),
      setAttribute(k: string, v: string) { el.attrs[k] = v; }, appendChild(c: unknown) { el.kids.push(c); return c; } };
    return el;
  };
  const document = {
    body: { appendChild(d: ReturnType<typeof mkEl>) {
      const text = d.kids.map((k) => (typeof k === 'string' ? k : (k as { textContent: string }).textContent)).join('');
      appended.push({ text });
    } },
    createElement: () => mkEl(),
    createTextNode: (t: string) => t,
    addEventListener() {},
    sheets: [] as { sheet: { cssRules: unknown[] } | null }[],
    querySelectorAll(sel: string) { return sel.includes('/_next/static/') ? document.sheets : []; },
  };
  const sessionStorage = store === 'throws'
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
    : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  const location = { reload() { reloads += 1; } };
  const navigator = { onLine: online };
  const addEventListener = (type: string, fn: Handler) => { handlers[type] = fn; };
  // eslint-disable-next-line no-new-func
  new Function('addEventListener', 'document', 'sessionStorage', 'location', 'navigator', chunkRecoveryScript(stamp))(
    addEventListener, document, sessionStorage, location, navigator);
  return { handlers, appended, document, reloads: () => reloads };
}
const chunkErr = { error: Object.assign(new Error('Loading chunk 5005 failed.'), { name: 'ChunkLoadError' }), target: {} };
const deadScript = { target: { tagName: 'SCRIPT', src: 'https://waypointledger.org/_next/static/chunks/5005-15375d55f7bc6905.js' } };

describe('chunk recovery script', () => {
  it('reloads once for a ChunkLoadError, a rejection, or a dead chunk tag', () => {
    for (const fire of [
      (h: Record<string, Handler>) => h.error(chunkErr),
      (h: Record<string, Handler>) => h.unhandledrejection({ reason: chunkErr.error }),
      (h: Record<string, Handler>) => h.error(deadScript),
      (h: Record<string, Handler>) => h.error({ target: { tagName: 'LINK', rel: 'stylesheet', href: '/_next/static/css/a11a27b118e4a501.css' } }),
    ]) {
      const store = new Map<string, string>();
      const w = run('e8f2d3a6f-mg7abc', store);
      fire(w.handlers);
      fire(w.handlers);
      expect(w.reloads()).toBe(1);
      expect(store.get(CHUNK_RELOAD_KEY)).toBe('e8f2d3a6f-mg7abc');
      expect(w.appended).toHaveLength(0);
    }
  });
  it('the same build failing after its reload shows the line and never reloads again', () => {
    const store = new Map([[CHUNK_RELOAD_KEY, 'e8f2d3a6f-mg7abc']]);
    const w = run('e8f2d3a6f-mg7abc', store);
    w.handlers.error(deadScript);
    w.handlers.unhandledrejection({ reason: chunkErr.error });
    expect(w.reloads()).toBe(0);
    expect(w.appended.map((a) => a.text)).toEqual(['This page was updated. Reload to continue.']);
  });
  it('at load, a page stylesheet that never arrived counts; loaded ones do not', () => {
    const w = run('b', new Map());
    w.document.sheets.push({ sheet: { cssRules: [1, 2] } }, { sheet: { cssRules: [1] } });
    w.handlers.load({});
    expect(w.reloads()).toBe(0);
    w.document.sheets.push({ sheet: { cssRules: [] } });
    w.handlers.load({});
    expect(w.reloads()).toBe(1);
    const v = run('b', new Map());
    v.document.sheets.push({ sheet: null });
    v.handlers.load({});
    expect(v.reloads()).toBe(1);
  });
  it('a new build gets its own one reload', () => {
    const store = new Map([[CHUNK_RELOAD_KEY, 'old-build']]);
    const w = run('new-build', store);
    w.handlers.error(chunkErr);
    expect(w.reloads()).toBe(1);
  });
  it('blocked storage shows the line instead of risking a loop', () => {
    const w = run('b', 'throws');
    w.handlers.error(chunkErr);
    expect(w.reloads()).toBe(0);
    expect(w.appended).toHaveLength(1);
  });
  it('ignores other errors, other resources, and offline', () => {
    const w = run('b', new Map());
    w.handlers.error({ error: new TypeError('x is undefined'), message: 'x is undefined', target: {} });
    w.handlers.unhandledrejection({ reason: new Error('Failed to fetch') });
    w.handlers.error({ target: { tagName: 'IMG', src: '/_next/static/media/a.png' } });
    w.handlers.error({ target: { tagName: 'SCRIPT', src: 'https://example.org/x.js' } });
    w.handlers.error({ target: { tagName: 'LINK', rel: 'preload', href: '/_next/static/chunks/1.js' } });
    expect(w.reloads()).toBe(0);
    const off = run('b', new Map(), false);
    off.handlers.error(chunkErr);
    expect(off.reloads()).toBe(0);
    expect(off.appended).toHaveLength(0);
  });
  it('runs first in the root layout', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'layout.tsx'), 'utf8');
    const head = src.slice(src.indexOf('<head>'), src.indexOf('</head>'));
    expect(head).toContain('chunkRecoveryScript(SW_VERSION)');
    expect(head.indexOf('chunkRecoveryScript')).toBeLessThan(head.indexOf('<link'));
  });
});
