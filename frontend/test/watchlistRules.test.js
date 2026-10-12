import { describe, expect, it } from 'vitest';
import { applyChange } from '../src/lib/watchlistRules.js';

const NOW = '2026-10-12T10:00:00.000Z';
const base = { status: 'planned', my_rating: null, rated_at: null, watched_at: null };

describe('applyChange (mirror of the database trigger)', () => {
  it('rating a planned title marks it as watched', () => {
    expect(applyChange(base, { my_rating: 8 }, NOW)).toMatchObject({ my_rating: 8, rated_at: NOW, status: 'completed', watched_at: NOW });
  });
  it('rating a series you are watching keeps it open', () => {
    expect(applyChange({ ...base, status: 'watching' }, { my_rating: 7 }, NOW)).toMatchObject({ status: 'watching', watched_at: null });
  });
  it('clearing the rating clears rated_at', () => {
    expect(applyChange({ ...base, status: 'completed', my_rating: 8, rated_at: NOW, watched_at: NOW }, { my_rating: null }, NOW)).toMatchObject({
      my_rating: null,
      rated_at: null,
      status: 'completed',
    });
  });
  it('completed sets watched_at once; back to planned clears it', () => {
    const done = applyChange(base, { status: 'completed' }, NOW);
    expect(done.watched_at).toBe(NOW);
    expect(applyChange(done, { status: 'completed' }, '2027-01-01T00:00:00Z').watched_at).toBe(NOW);
    expect(applyChange(done, { status: 'planned' }, NOW).watched_at).toBeNull();
    expect(applyChange(done, { status: 'paused' }, NOW).watched_at).toBe(NOW);
  });
});
