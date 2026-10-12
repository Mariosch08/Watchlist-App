import { describe, expect, it } from 'vitest';
import { mapLegacyItem } from '../src/lib/legacy.js';

const now = new Date('2026-01-01T00:00:00Z');

describe('mapLegacyItem', () => {
  it('maps a typical legacy movie item to the owner', () => {
    const out = mapLegacyItem({ id: '603', title: 'The Matrix', type: 'movie', watched: true }, 'owner', now);
    expect(out).toMatchObject({ PK: 'USER#owner', SK: 'WL#movie#603', tmdb_id: 603, status: 'completed', source: 'manual' });
  });
  it('detects series and camelCase fields', () => {
    const out = mapLegacyItem({ tmdbId: 1399, mediaType: 'series', name: 'Game of Thrones', addedAt: '2024-05-01' }, 'owner', now);
    expect(out).toMatchObject({ SK: 'WL#tv#1399', media_type: 'tv', title: 'Game of Thrones', added_at: '2024-05-01', status: 'planned' });
  });
  it('skips items without a TMDb id', () => {
    expect(mapLegacyItem({ title: 'No id' }, 'owner', now)).toBeNull();
  });
});
