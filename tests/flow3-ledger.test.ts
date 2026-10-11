/* FLOW3 on the ledger: who the page speaks to, by stratum. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHILD_BASIS_LEAD, CHILD_BASIS_MORE, CHILD_BASIS_NOTE, PEDIATRIC_ONSET_NOTE, basisNoteFor } from '../lib/patient';

describe('flow3-18: the note under the total speaks to the person reading it', () => {
  it('a parent answering for a child gets the child note', () => {
    expect(basisNoteFor({ stratum: 'caregiver-child', from: 'words' })).toBe(CHILD_BASIS_NOTE);
  });
  it('someone who fell ill as a child gets one line addressed to her, never "the child"', () => {
    const n = basisNoteFor({ stratum: 'pediatric-onset', from: 'words' });
    expect(n).toBe('Began in childhood: if Medicaid or CHIP covered you then, choose it under Change.');
    expect(n).toBe(PEDIATRIC_ONSET_NOTE);
    expect(n).not.toMatch(/the child/);
  });
  it('an adult-onset ledger and an unknown one show no note', () => {
    expect(basisNoteFor({ stratum: 'adult-onset', from: 'chosen' })).toBeNull();
    expect(basisNoteFor(null)).toBeNull();
  });
  it('the ledger renders the stratum note, not the child note for every childhood illness', () => {
    const src = readFileSync(new URL('../components/Ledger.tsx', import.meta.url), 'utf8');
    expect(src).toContain('basisNoteFor(st.patient)');
    expect(src).not.toMatch(/childIllness\(st\.patient\) && !suppressed && <p className="micro core-child-basis">/);
  });
});

describe('patient2-9: the parent note folds to one line without losing a word', () => {
  it('the lead and the More text say the whole note', () => {
    expect(CHILD_BASIS_LEAD).toBe('For a child these are reference prices.');
    expect(CHILD_BASIS_MORE.startsWith('Medicare is not a child’s insurer')).toBe(true);
    expect(`${CHILD_BASIS_LEAD.slice(0, -1)}: ${CHILD_BASIS_MORE}`).toBe(CHILD_BASIS_NOTE);
  });
  it('the ledger folds it behind More for a parent', () => {
    const src = readFileSync(new URL('../components/Ledger.tsx', import.meta.url), 'utf8');
    expect(src).toContain('<summary>{CHILD_BASIS_LEAD} <span className="core-more">More</span></summary><p>{CHILD_BASIS_MORE}</p>');
  });
});

describe('flow3-19: Change puts focus inside the panel it opens', () => {
  it('the panel heading is a focus target and is focused when the panel opens', () => {
    const src = readFileSync(new URL('../components/ContextBar.tsx', import.meta.url), 'utf8');
    expect(src).toContain('<p className="eyebrow" id="ctx-h" ref={panelHead} tabIndex={-1}>');
    expect(src).toContain('const id = requestAnimationFrame(() => panelHead.current?.focus());');
  });
  it('Done, Skip and Esc close through one path that hands focus back to Change', () => {
    const src = readFileSync(new URL('../components/ContextBar.tsx', import.meta.url), 'utf8');
    expect(src).toContain('const close = () => { backToChange.current = true; setOpen(false); };');
    expect(src).toContain('onClick={close}>Done</button>');
    expect(src).toContain('onClick={close}>Skip this</button>');
    expect(src).toMatch(/e\.key === 'Escape'[^\n]*close\(\)/);
    expect(src).toContain('requestAnimationFrame(() => changeBtn.current?.focus())');
    expect(src.match(/setOpen\(false\)/g)).toHaveLength(1);
  });
});
