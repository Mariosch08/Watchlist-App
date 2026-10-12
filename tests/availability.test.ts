import { describe, expect, it } from 'vitest';
import { advice, alertMatches, bestCombination, summarize } from '../supabase/functions/_shared/availability.ts';

const NF = { id: 8, name: 'Netflix', logo_path: null };
const DP = { id: 337, name: 'Disney Plus', logo_path: null };
const AP = { id: 350, name: 'Apple TV+', logo_path: null };
const t = (id: number, flatrate: any[]) => ({ media_type: 'movie' as const, tmdb_id: id, title: `T${id}`, flatrate });

const items = [t(1, [NF]), t(2, [NF, DP]), t(3, [NF]), t(4, [AP]), t(5, [AP]), t(6, []), t(7, [DP])];

describe('availability', () => {
  it('summarizes coverage per provider and with my services', () => {
    const s = summarize(items, [337]);
    expect(s).toMatchObject({ total: 7, covered: 2, nowhere: 1 });
    expect(s.providers.map((p) => [p.name, p.count, p.exclusive, p.mine])).toEqual([
      ['Netflix', 3, 2, false],
      ['Apple TV+', 2, 2, false],
      ['Disney Plus', 2, 0, true],
    ]);
  });

  it('finds the best two-service combination', () => {
    const combo = bestCombination(summarize(items, []).providers, 2);
    expect(combo.providers.map((p) => p.name)).toEqual(['Netflix', 'Apple TV+']);
    expect(combo.covered).toBe(5);
  });

  it('advises what to add and which subscription is hardly used', () => {
    const a = advice(summarize(items, [337]));
    expect(a.add?.name).toBe('Netflix');
    expect(a.unused.map((p) => p.name)).toEqual(['Disney Plus']);
  });

  it('matches alerts against wanted services or any service', () => {
    expect(alertMatches([NF, DP], [337]).map((p) => p.id)).toEqual([337]);
    expect(alertMatches([NF], null)).toEqual([NF]);
    expect(alertMatches([NF], [350])).toEqual([]);
    expect(alertMatches([], null)).toEqual([]);
  });
});
