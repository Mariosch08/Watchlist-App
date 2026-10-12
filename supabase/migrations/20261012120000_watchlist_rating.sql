-- Store TMDb rating and original title on watchlist entries (shown in the list).
alter table public.watchlist
  add column original_title text check (char_length(original_title) <= 300),
  add column vote_average numeric(3, 1) check (vote_average between 0 and 10);
