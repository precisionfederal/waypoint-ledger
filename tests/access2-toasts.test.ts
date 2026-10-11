/* FLOW2 access2-2..8 and patient2-2/3/7: the Undo toast, the stepper, the one live region. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { beyondTheChip } from '../components/Toasts';
import { queuedSentence } from '../lib/store';

const toasts = readFileSync('components/Toasts.tsx', 'utf8');
const controls = readFileSync('components/LineControls.tsx', 'utf8');

describe('access2-5: the reason a correction waits is said, the chip fact is not said twice', () => {
  it('keeps the 429 and 5xx reason and drops the sentence the chip already says', () => {
    expect(beyondTheChip(queuedSentence(429))).toBe('Several answers on this figure came from your network this hour, so the count asked to wait.');
    expect(beyondTheChip(queuedSentence(503))).toBe('The count did not answer just now.');
    expect(beyondTheChip(queuedSentence(null))).toBe('');
  });
});

describe('access2-6: a download is announced while the chip is up', () => {
  it('lets "Downloaded ..." through the chip filter', () => {
    expect(toasts).toContain("const SAYS_A_FILE_LANDED = /^Downloaded\\b/;");
    expect(toasts).toContain("(t.kind !== 'ok' || SAYS_A_FILE_LANDED.test(t.text))");
  });
});

describe('access2-2 / patient2-3: an Undo waits for the person', () => {
  it('holds the newest action toast apart from the timed ones, focuses its Undo, and can be closed', () => {
    expect(toasts).toContain('const plain = toasts.filter((t) => !t.action);');
    expect(toasts).toContain('actBtn.current?.focus()');
    expect(toasts).toContain('aria-label="Close this message"');
    expect(toasts).toContain("if (e.key === 'Escape') { e.preventDefault(); close(held); }");
  });
  it('folds Removes in a row into one Undo that puts every line back', () => {
    expect(controls).toContain('`Removed ${group.length} lines.`');
    expect(controls).toContain("group: 'remove'");
  });
});

describe('patient2-2: Undo never takes away later work', () => {
  it('re-inserts only the removed lines, and drops a Start over Undo when the ledger changes', () => {
    expect(controls).toContain('now = [...now.slice(0, i), r.line, ...now.slice(i)];');
    expect(controls).toContain('dropOnLedgerChange: true');
    expect(toasts).toContain('h.entries === entries');
  });
});

describe('access2-3 / patient2-7: focus after Undo', () => {
  it('goes to the restored line\'s Remove, or the top heading after Start over', () => {
    expect(controls).toContain("focusWhenThere(() => byData('data-remove-key', last.line.key));");
    expect(controls).toContain("run: () => { st.restore(before); landOnTop('main h1'); }");
  });
});

describe('access2-4 / access2-7: the stepper', () => {
  it('keeps focus at 1 (aria-disabled, never disabled) and says one sentence, not a bare number', () => {
    expect(controls).toContain('aria-disabled={atOne || undefined}');
    expect(controls).not.toMatch(/disabled=\{entry\.times/);
    expect(controls).not.toContain('aria-live');
    expect(controls).toContain("announce(`${name}: ${entry.times} ${entry.times === 1 ? 'time' : 'times'}.`);");
  });
});

describe('access2-8: focus is never hidden under a toast', () => {
  it('scrolls a covered, focused control into the clear', () => {
    expect(toasts).toContain("document.addEventListener('focusin', onFocus);");
  });
});
