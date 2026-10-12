-- Phase 3: import jobs keep their parsed rows while processing (cleared when done).
alter table public.import_jobs
  add column items     jsonb not null default '[]',
  add column processed int not null default 0;

-- Jobs are created and advanced only by the imdb Edge Function (service role).
revoke insert on public.import_jobs from authenticated;
