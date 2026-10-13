-- D68: how small an artist is comes from Last.fm listeners; Spotify popularity is only the fallback, and
-- popularity 0 (what stats.fm reports without a value) means unknown. Recompute the stored values right
-- away, so big names like Kendrick Lamar leave "Geheimtipps" without waiting for the next run.
update public.music_artists set popularity = null where popularity = 0;

update public.music_artists
   set niche = case
     when listeners > 0 then round(least(1, greatest(0, log(2000000.0 / listeners) / 2)), 3)
     when popularity > 0 then round(least(1, greatest(0, (65 - popularity) / 40.0)), 3)
   end;
