import { describe, expect, it } from 'vitest';
import { describeEntry, diaryStats, groupByMonth } from '../src/lib/diary.js';

const e = (watched_on, extra = {}) => ({ id: watched_on, watched_on, title: 'X', ...extra });

describe('diary helpers', () => {
  it('groups by month in order', () => {
    const groups = groupByMonth([e('2026-10-05'), e('2026-10-01'), e('2026-09-30')]);
    expect(groups.map((g) => [g.key, g.entries.length])).toEqual([
      ['2026-10', 2],
      ['2026-09', 1],
    ]);
    expect(groups[0].label).toMatch(/Oktober 2026/);
  });

  it('counts the year and finds the most frequent company', () => {
    const stats = diaryStats(
      [
        e('2026-10-05', { place: 'cinema', with_whom: 'Anna und Ben' }),
        e('2026-09-01', { place: 'home', with_whom: 'anna', rewatch: true }),
        e('2025-12-31', { place: 'cinema', with_whom: 'Ben' }),
      ],
      2026,
    );
    expect(stats).toEqual({ total: 2, cinema: 1, rewatches: 1, company: { name: 'Anna', count: 2 } });
    expect(describeEntry({ place: 'cinema', with_whom: 'Anna', rewatch: true })).toBe('im Kino · mit Anna · nochmal');
  });
});
