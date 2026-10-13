import { describe, expect, it } from 'vitest';
import { screenLine, sharedScreen } from '../src/lib/sharedScreen.js';

const people = [
  { user_id: 'a', display_name: 'Anna', is_me: true, attending: true, providers: [8], seen: [] },
  { user_id: 'l', display_name: 'Lara', is_me: false, attending: true, providers: [11], seen: ['movie:603'] },
  { user_id: 't', display_name: 'Thomas', is_me: false, attending: true, providers: null, seen: null },
  { user_id: 'c', display_name: 'Carla', is_me: false, attending: false, providers: [337], seen: ['movie:666277'] },
];
const ranked = [
  { media_type: 'movie', tmdb_id: 603, title: 'Matrix' },
  { media_type: 'movie', tmdb_id: 666277, title: 'Past Lives' },
  { media_type: 'movie', tmdb_id: 1, title: 'Roma' },
  { media_type: 'movie', tmdb_id: 2, title: 'Nowhere' },
];
const providers = new Map([
  ['movie:666277', [{ id: 11, name: 'MUBI' }]],
  ['movie:1', [{ id: 11, name: 'MUBI' }, { id: 8, name: 'Netflix' }]],
  ['movie:2', [{ id: 350, name: 'Apple TV+' }]],
]);

describe('sharedScreen', () => {
  it('leaves out what someone attending has seen and says whose subscription to use', () => {
    const screen = sharedScreen({ people, ranked, providers });
    expect(screen.group.map((p) => p.display_name)).toEqual(['Anna', 'Lara', 'Thomas']);
    expect(screen.entries.map((e) => [e.item.title, screenLine(e)])).toEqual([
      ['Past Lives', 'Läuft auf Laras MUBI'], // Carla has seen it, but she is not coming
      ['Roma', 'Läuft auf deinem Netflix'],
      ['Nowhere', 'In keinem Abo der Runde – läuft bei Apple TV+'],
    ]);
    expect(screen.skipped).toEqual([{ item: ranked[0], by: ['Lara'] }]);
    expect(screen.hidden).toEqual(['Thomas']);
  });

  it('uses everybody in the list while nobody has answered, and waits for streaming data', () => {
    const open = people.map((p) => ({ ...p, attending: false }));
    const screen = sharedScreen({ people: open, ranked, providers: new Map() });
    expect(screen.attending).toBe(false);
    expect(screen.entries.map((e) => e.item.title)).toEqual(['Roma', 'Nowhere']);
    expect(screenLine(screen.entries[0])).toBe('Streaming wird geprüft …');
    expect(screenLine({ flatrate: [], owners: [] })).toBe('In keinem Abo');
  });

  it('writes the genitive of names ending in s', () => {
    const screen = sharedScreen({ people: [{ ...people[2], providers: [11] }], ranked: [ranked[2]], providers });
    expect(screenLine(screen.entries[0])).toBe('Läuft auf Thomas’ MUBI');
  });
});
