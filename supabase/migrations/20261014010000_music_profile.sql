-- Music profile (D60): instead of one rank per artist the app keeps how strongly I listen to an
-- artist across the last weeks, months and years (affinity), where it is heading (trend) and how
-- small it is (niche, from Last.fm listeners and Spotify popularity). Up to 300 artists per user.
alter table public.music_artists
  add column affinity   real not null default 0 check (affinity between 0 and 1),
  add column trend      text check (trend in ('rising', 'core', 'steady', 'fading')),
  add column niche      real check (niche between 0 and 1),
  add column listeners  int check (listeners >= 0),
  add column popularity smallint check (popularity between 0 and 100),
  add column loved      int not null default 0 check (loved >= 0),
  add column genres     text[] not null default '{}' check (cardinality(genres) <= 5);

create index music_artists_user_affinity_idx on public.music_artists (user_id, affinity desc);

-- Artist lookups are now cached with listeners and tags under 'lfm:<artist>'; the old id-only entries go.
delete from public.tmdb_cache where cache_key like 'mbid:%';
