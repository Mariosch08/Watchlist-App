-- Phase 12: e-mails (instant mails and a weekly digest) are sent by the notify-email function.
-- digest_sent_at is written by the server only (no client grant).
alter table public.user_settings add column digest_sent_at timestamptz;

create index notifications_unmailed_idx on public.notifications (created_at) where emailed_at is null;
