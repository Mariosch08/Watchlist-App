import { describe, expect, it } from 'vitest';
import { groupPick, nightIcs, nightSummary, rankItems, swipeQueue } from '../src/lib/lists.js';

const item = (tmdb_id, added_at = `2026-10-0${tmdb_id}`) => ({ media_type: 'movie', tmdb_id, title: `Film ${tmdb_id}`, added_at });
const vote = (tmdb_id, user_id, v) => ({ media_type: 'movie', tmdb_id, user_id, vote: v });

describe('rankItems', () => {
  it('counts votes, finds matches and sorts best first', () => {
    const ranked = rankItems(
      [item(1), item(2), item(3)],
      [vote(2, 'me', 1), vote(2, 'ben', 1), vote(3, 'me', 1), vote(3, 'ben', -1), vote(1, 'ben', 1)],
      2,
      'me',
    );
    expect(ranked.map((t) => [t.tmdb_id, t.score, t.myVote, t.match])).toEqual([
      [2, 2, 1, true],
      [1, 1, 0, false],
      [3, 0, 1, false],
    ]);
    expect(swipeQueue(ranked).map((t) => t.tmdb_id)).toEqual([1]);
  });
});

describe('groupPick', () => {
  it('prefers titles without a veto and picks randomly among equals', () => {
    const ranked = rankItems([item(1), item(2), item(3)], [vote(1, 'a', 1), vote(1, 'b', 1), vote(1, 'c', -1), vote(2, 'a', 1), vote(3, 'a', 1)], 3, 'a');
    expect(groupPick(ranked, () => 0).tmdb_id).toBe(2);
    expect(groupPick(ranked, () => 0.99).tmdb_id).toBe(3);
    expect(groupPick(rankItems([item(1)], [vote(1, 'a', -1)], 2, 'a'))).toBeNull();
    expect(groupPick([])).toBeNull();
  });
});

describe('movie nights', () => {
  const night = {
    id: 'n1',
    title: 'Halloween',
    options: ['2026-10-30T18:00:00Z', '2026-10-31T18:00:00Z'],
    chosen_option: 1,
    movie_night_votes: [
      { user_id: 'me', option_index: 0, available: false },
      { user_id: 'me', option_index: 1, available: true },
      { user_id: 'ben', option_index: 1, available: true },
    ],
  };

  it('summarizes availability per option', () => {
    const s = nightSummary(night, 'me');
    expect(s.options.map((o) => [o.yes, o.no, o.mine])).toEqual([
      [0, 1, false],
      [2, 0, true],
    ]);
    expect(s.best.index).toBe(1);
    expect(s.voters).toBe(2);
  });

  it('exports the fixed date as a timed calendar event', () => {
    const ics = nightIcs(night, { listName: 'Gruselabend', item: { title: 'Scream' }, now: new Date('2026-10-12T00:00:00Z') });
    expect(ics).toContain('DTSTART:20261031T180000Z');
    expect(ics).toContain('SUMMARY:Filmabend: Halloween');
    expect(ics).toContain('Wir schauen: Scream');
  });
});
