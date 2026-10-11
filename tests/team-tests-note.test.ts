/* FIX-annotations: the register's one line about our own test rows. */
import { describe, expect, it } from 'vitest';
import { teamTestsSentence } from '../components/TeamTestsNote';

describe('teamTestsSentence', () => {
  it('says nothing when nothing is marked', () => {
    expect(teamTestsSentence({})).toBeNull();
    expect(teamTestsSentence({ survey: 0, corrections: null })).toBeNull();
  });
  it('names each kind in answers and thumbs, never people', () => {
    expect(teamTestsSentence({ survey: 5 })).toBe('5 survey answers from the team testing the form are not counted here. They stay in the open data, marked team_test.');
    expect(teamTestsSentence({ corrections: 1 })).toBe('1 thumb on a federal figure from the team testing the form is not counted here. It stays in the open data, marked team_test.');
    const two = teamTestsSentence({ survey: 5, corrections: 4 })!;
    expect(two).toBe('5 survey answers and 4 thumbs on federal figures from the team testing the form are not counted here. They stay in the open data, marked team_test.');
    expect(two).not.toMatch(/people|—/);
  });
});
