import { describe, expect, it } from 'vitest';
import { formatListeners, musicProfile } from '../src/lib/musicProfile.js';

const artist = (name, extra = {}) => ({ artist_key: name.toLowerCase(), name, rank: 1, sources: ['lastfm'], affinity: 0.5, niche: null, genres: [], loved: 0, trend: null, ...extra });

describe('musicProfile', () => {
  it('groups artists by trend and size, strongest first', () => {
    const p = musicProfile([
      artist('B', { affinity: 0.4, trend: 'core' }),
      artist('A', { affinity: 0.9, trend: 'core' }),
      artist('Tiny', { affinity: 0.3, niche: 0.7, trend: 'rising' }),
      artist('Old', { affinity: 0.2, trend: 'fading' }),
      artist('Spotify only', { sources: ['spotify', 'other'] }),
    ]);
    expect(p.total).toBe(5);
    expect(p.small).toBe(1);
    expect(p.groups.core.map((a) => a.name)).toEqual(['A', 'B']);
    expect(p.groups.rising.map((a) => a.name)).toEqual(['Tiny']);
    expect(p.groups.hidden.map((a) => a.name)).toEqual(['Tiny']);
    expect(p.groups.fading.map((a) => a.name)).toEqual(['Old']);
    expect(p.all[0].name).toBe('A');
    expect(p.sources).toEqual(['lastfm', 'spotify']);
    expect(p.trends).toBe(true);
  });

  it('weighs the mainstream share and genres by how much I listen', () => {
    const p = musicProfile([
      artist('Fav', { affinity: 1, niche: 1, genres: ['indie'] }),
      artist('B', { affinity: 0.05, niche: 0, genres: ['pop'] }),
      artist('C', { affinity: 0.05, niche: 0, genres: ['pop'] }),
      artist('D', { affinity: 0.05, niche: 0, genres: ['pop'] }),
      artist('E', { affinity: 0.05, niche: 0, genres: ['pop'] }),
    ]);
    expect(p.offMainstream).toBe(83); // 1 / (1 + 4 · 0.05)
    expect(p.genres).toEqual([
      { name: 'indie', share: 83 },
      { name: 'pop', share: 17 },
    ]);
  });

  it('needs at least five sized artists for the mainstream share', () => {
    expect(musicProfile([artist('A', { niche: 0.5 })]).offMainstream).toBeNull();
    expect(musicProfile().total).toBe(0);
    expect(musicProfile([artist('A')]).trends).toBe(false);
  });

  it('formats listener counts the Swiss way', () => {
    expect(formatListeners(18000)).toMatch(/^18.000 Hörer$/);
  });
});
