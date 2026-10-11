/* The change log holds drafts as well as published rows (published = 0 is
   never served by GET /api/changes). A draft is published, or taken back,
   with one PATCH from the admin console. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateChange } from '../cf/functions/api/admin/changes.js';
import { validatePublishedPatch } from '../cf/functions/api/admin/changes/[id].js';

describe('change-log drafts', () => {
  it('a POST may ask for a draft, and the default stays published', () => {
    const base = { date: '2026-10-01', said: 's', changed: 'c', who: 'w' };
    expect((validateChange({ ...base, published: false }) as { record: { published: number } }).record.published).toBe(0);
    expect((validateChange(base) as { record: { published: number } }).record.published).toBe(1);
  });
  it('a PATCH takes a boolean and nothing else', () => {
    expect(validatePublishedPatch({ published: true })).toEqual({ published: 1 });
    expect(validatePublishedPatch({ published: false })).toEqual({ published: 0 });
    expect((validatePublishedPatch({ published: 'yes' }) as { error?: string }).error).toMatch(/true or false/);
    expect((validatePublishedPatch(null) as { error?: string }).error).toBeTruthy();
  });
  it('the public endpoint serves published rows only', () => {
    expect(readFileSync('cf/functions/api/changes.js', 'utf8')).toContain('WHERE published = 1');
  });
  it('the console marks a draft and can publish it', () => {
    const admin = readFileSync('components/Admin.tsx', 'utf8');
    expect(admin).toContain('DRAFT · not public');
    expect(admin).toContain("method: 'PATCH'");
  });
});
