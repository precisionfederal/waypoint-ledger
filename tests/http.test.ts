/* The shared request helpers every function uses. One definition, so a validator
   cannot be looser on one endpoint than on another. */
import { describe, it, expect } from 'vitest';
import { json, bad, readJson, str, oneOf, int, num, channelOf, slug, id, now, MAX_BODY } from '../cf/functions/api/_http.js';

const req = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://example.test/api/x', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });

describe('responses', () => {
  it('never caches an API response', async () => {
    const r = json({ ok: true });
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(await r.json()).toEqual({ ok: true });
  });
  it('shapes every error the same way', async () => {
    const r = bad('Rank all five burdens, heaviest first.', 400);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, error: 'Rank all five burdens, heaviest first.' });
    expect(bad('nope', 404).status).toBe(404);
  });
});

describe('readJson', () => {
  it('parses an object', async () => {
    expect(await readJson(req('{"a":1}'))).toEqual({ body: { a: 1 } });
  });
  it('refuses a scalar body, malformed JSON and an oversized body', async () => {
    expect((await readJson(req('"a string"'))).error).toMatch(/JSON object/);
    expect((await readJson(req('7'))).error).toMatch(/JSON object/);
    expect((await readJson(req('null'))).error).toMatch(/JSON object/);
    expect((await readJson(req('not json'))).error).toMatch(/must be JSON/);
    expect((await readJson(req(JSON.stringify({ a: 'x'.repeat(MAX_BODY) })))).error).toMatch(/too large/i);
    expect((await readJson(req('{}', { 'content-length': String(MAX_BODY + 1) }))).error).toMatch(/too large/i);
  });
  it('lets a JSON array through, so every endpoint validator must check the shape itself', () => {
    // Documented, not endorsed: `typeof [] === 'object'`. Each endpoint's validator
    // rejects an array on its own required fields; priceRequest() rejects it by name.
    return readJson(req('[1,2]')).then((r) => expect(r.body).toEqual([1, 2]));
  });
});

describe('validators', () => {
  it('str trims, caps and rejects blank', () => {
    expect(str('  hello  ')).toBe('hello');
    expect(str('x'.repeat(500), 400)).toHaveLength(400);
    expect(str('   ')).toBeUndefined();
    expect(str(42)).toBeUndefined();
  });
  it('oneOf admits only the published options', () => {
    expect(oneOf('right', ['right', 'wrong'])).toBe('right');
    expect(oneOf('maybe', ['right', 'wrong'])).toBeUndefined();
  });
  it('int and num hold their ranges', () => {
    expect(int(7, 0, 99)).toBe(7);
    expect(int('7', 0, 99)).toBe(7);          // a form field arrives as a string
    expect(int('seven', 0, 99)).toBeUndefined();
    expect(int(7.5, 0, 99)).toBeUndefined();
    expect(int(100, 0, 99)).toBeUndefined();
    expect(num(240.5, 0, 10_000_000)).toBe(240.5);
    expect(num(-1, 0, 10)).toBeUndefined();
    expect(num(NaN, 0, 10)).toBeUndefined();
  });
  it('channelOf never stores an arbitrary string', () => {
    expect(channelOf('long-covid-forum')).toBe('long-covid-forum');
    expect(channelOf('Drop Table')).toBe('direct');
    expect(channelOf(undefined)).toBe('direct');
    expect(channelOf('x'.repeat(40))).toBe('direct');
  });
  it('slug is unguessable, url-safe and the length asked for', () => {
    const a = slug(10); const b = slug(10);
    expect(a).toMatch(/^[a-z2-9]{10}$/);
    expect(a).not.toBe(b);
    expect(slug(6)).toHaveLength(6);
  });
  it('id and now are a uuid and an ISO timestamp', () => {
    expect(id()).toMatch(/^[0-9a-f-]{36}$/);
    expect(now()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
