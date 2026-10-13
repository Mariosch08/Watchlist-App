// E-mails via Brevo.
//  cron  POST { }                    -> instant mails for new notifications; Sunday 18:00 (Zurich) the weekly digest
//  user  POST { action: 'test' }     -> a test mail to myself (once per hour)
//  link  GET/POST ?unsubscribe=<token>&what=instant|digest -> turns that kind of mail off (one click, no login)
import { adminClient } from '../_shared/admin.ts';
import { requireUser } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { isCronRequest } from '../_shared/cron.ts';
import {
  type DigestData,
  digestIsEmpty,
  digestMail,
  instantMail,
  INSTANT_TYPES,
  isDigestTime,
  type Mail,
  type MailNotification,
  MAX_MAILS_PER_RUN,
  sendBrevo,
  unsubscribeLink,
} from '../_shared/mail.ts';
import { buildAgenda, KIND_LABEL } from '../_shared/agenda.ts';
import { sanitizePlan } from '../_shared/rotation.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
const page = (status: number, text: string) =>
  new Response(
    `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Watchlist</title><body style="font-family:Georgia,serif;max-width:480px;margin:64px auto;padding:0 24px;color:#1f1e1c;background:#fbfaf7"><h1 style="font-size:24px">${text}</h1><p><a href="${env.appUrl}profile" style="color:#2f5d8a">Einstellungen öffnen</a></p></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const env = {
  apiKey: Deno.env.get('BREVO_API_KEY') ?? '',
  from: Deno.env.get('MAIL_FROM') ?? '',
  sandbox: Deno.env.get('MAIL_SANDBOX') === 'true',
  appUrl: (Deno.env.get('APP_URL') ?? 'http://localhost:5173/').replace(/\/?$/, '/'),
  functionsUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1`,
};
type Db = ReturnType<typeof adminClient>;

async function recipients(db: Db, userIds: string[]) {
  const [{ data: profiles }, { data: settings }] = await Promise.all([
    db.from('profiles').select('id, email, display_name').in('id', userIds),
    db.from('user_settings').select('user_id, email_instant, email_digest, unsubscribe_token, digest_sent_at').in('user_id', userIds),
  ]);
  const s = new Map((settings ?? []).map((r) => [r.user_id, r]));
  return new Map((profiles ?? []).filter((p) => p.email && s.has(p.id)).map((p) => [p.id, { ...p, ...s.get(p.id)! }]));
}

const send = (mail: Mail) => sendBrevo(mail, { apiKey: env.apiKey, from: env.from, sandbox: env.sandbox });

async function sendInstant(db: Db) {
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const { data: rows, error } = await db
    .from('notifications')
    .select('id, user_id, type, title, body, data, created_at')
    .is('emailed_at', null)
    .in('type', [...INSTANT_TYPES])
    .gte('created_at', since)
    .order('created_at')
    .limit(500);
  if (error) throw error;
  const byUser = new Map<string, typeof rows>();
  for (const r of rows ?? []) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  const people = await recipients(db, [...byUser.keys()]);
  let sent = 0;
  for (const [userId, list] of byUser) {
    const person = people.get(userId);
    if (sent < MAX_MAILS_PER_RUN && person?.email_instant) {
      try {
        await send(instantMail({ email: person.email, name: person.display_name }, list as MailNotification[], env.appUrl, unsubscribeLink(env.functionsUrl, person.unsubscribe_token, 'instant')));
        sent++;
      } catch (err) {
        console.error('instant mail failed', userId, err);
        continue; // retried next run
      }
    } else if (person?.email_instant) {
      continue; // over the per-run limit: next run
    }
    // Sent, or mails are off for this person: never pick these up again.
    await db.from('notifications').update({ emailed_at: new Date().toISOString() }).in('id', list.map((n) => n.id));
  }
  return sent;
}

async function sendDigests(db: Db, now: Date) {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data: due } = await db
    .from('user_settings')
    .select('user_id')
    .eq('email_digest', true)
    .or(`digest_sent_at.is.null,digest_sent_at.lt.${new Date(now.getTime() - 6 * 86_400_000).toISOString()}`)
    .limit(MAX_MAILS_PER_RUN);
  const people = await recipients(db, (due ?? []).map((r) => r.user_id));
  const today = now.toISOString().slice(0, 10);
  let sent = 0;
  for (const [userId, person] of people) {
    const [{ data: notes }, { data: feed }, { data: series }, { data: titles }, { data: concerts }, { data: going }, { data: albums }, { data: plan }, { data: watched }, { data: dismissed }] =
      await Promise.all([
        db.from('notifications').select('type, title, body, data, created_at').eq('user_id', userId).gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(10),
        db.from('feed').select('type, external_id, title, reason, data').eq('user_id', userId).eq('status', 'new').in('type', ['movie', 'tv']).order('score', { ascending: false }).limit(5),
        db.from('series_progress').select('tmdb_id, next_episode_to_air, last_episode_to_air, season_episodes, next_up_season, next_up_episode').eq('user_id', userId),
        db.from('watchlist').select('media_type, tmdb_id, title, status, release_date').eq('user_id', userId),
        db.from('concerts').select('event_id, artist, name, venue, city, local_date, url').eq('user_id', userId).gte('local_date', today),
        db.from('concert_log').select('event_id, artist, venue, city, local_date').eq('user_id', userId).gte('local_date', today),
        db.from('feed').select('external_id, title, subtitle, release_date').eq('user_id', userId).eq('type', 'album').neq('status', 'disliked').gt('release_date', today),
        db.from('rotation_plans').select('months').eq('user_id', userId).maybeSingle(),
        db.from('watched_episodes').select('tmdb_id').eq('user_id', userId).limit(20000),
        db.from('catchup_plans').select('tmdb_id, season_number').eq('user_id', userId).eq('dismissed', true),
      ]);
    // "Diese Woche": the same agenda as the calendar (episodes, film starts, concerts, albums, catch-up, subscriptions).
    const byKey = new Map((titles ?? []).map((t) => [`${t.media_type}:${t.tmdb_id}`, t]));
    const watchedCount = new Map<number, number>();
    for (const w of watched ?? []) watchedCount.set(w.tmdb_id, (watchedCount.get(w.tmdb_id) ?? 0) + 1);
    const week = buildAgenda(
      {
        series: (series ?? []).map((s) => ({ ...s, title: byKey.get(`tv:${s.tmdb_id}`)?.title ?? 'Serie', watch_status: byKey.get(`tv:${s.tmdb_id}`)?.status, watched_count: watchedCount.get(s.tmdb_id) ?? 0 })),
        watchlist: titles ?? [],
        concerts: concerts ?? [],
        going: going ?? [],
        albums: albums ?? [],
        rotation: sanitizePlan(plan?.months),
        done: new Set((titles ?? []).filter((t) => t.status === 'completed').map((t) => `${t.media_type}:${t.tmdb_id}`)),
        dismissedCatchUps: new Set((dismissed ?? []).map((c) => `${c.tmdb_id}:${c.season_number}`)),
      },
      { today, days: 7 },
    );
    const data: DigestData = {
      notifications: (notes ?? []) as MailNotification[],
      suggestions: (feed ?? []).map((f) => ({ title: f.title, reason: f.reason, href: `${env.appUrl}title/${f.type}/${f.external_id}` })),
      episodes: week.slice(0, 12).map((i) => ({
        title: i.kind === 'rotation' ? i.title : `${KIND_LABEL[i.kind]}: ${i.title}`,
        when: `${new Date(`${i.date}T12:00:00Z`).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })}${i.kind === 'rotation' ? '' : ` · ${i.detail.split('\n')[0]}`}`,
        href: `${env.appUrl}${(i.path ?? '/').replace(/^\//, '')}`,
      })),
    };
    if (!digestIsEmpty(data)) {
      try {
        await send(digestMail({ email: person.email, name: person.display_name }, data, env.appUrl, unsubscribeLink(env.functionsUrl, person.unsubscribe_token, 'digest')));
        sent++;
      } catch (err) {
        console.error('digest failed', userId, err);
        continue;
      }
    }
    await db.from('user_settings').update({ digest_sent_at: now.toISOString() }).eq('user_id', userId);
  }
  return sent;
}

async function unsubscribe(db: Db, url: URL) {
  const token = url.searchParams.get('unsubscribe') ?? '';
  const what = url.searchParams.get('what');
  if (!UUID.test(token) || !['instant', 'digest'].includes(what ?? '')) return page(400, 'Dieser Abmeldelink ist ungültig.');
  const { data } = await db
    .from('user_settings')
    .update(what === 'digest' ? { email_digest: false } : { email_instant: false })
    .eq('unsubscribe_token', token)
    .select('user_id');
  if (!data?.length) return page(404, 'Dieser Abmeldelink ist ungültig.');
  return page(200, what === 'digest' ? 'Du bekommst keinen Wochenrückblick mehr.' : 'Du bekommst keine Sofort-Mails mehr.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const db = adminClient();
  const url = new URL(req.url);
  try {
    if (url.searchParams.has('unsubscribe')) return await unsubscribe(db, url);
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
    const configured = Boolean(env.apiKey && env.from);

    if (isCronRequest(req)) {
      if (!configured) return json(200, { skipped: 'BREVO_API_KEY or MAIL_FROM not configured' });
      const now = new Date();
      const instant = await sendInstant(db);
      const digests = isDigestTime(now) ? await sendDigests(db, now) : 0;
      return json(200, { instant, digests, sandbox: env.sandbox });
    }

    const user = await requireUser(req);
    if (!user) return json(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'test') return json(400, { error: 'Unknown action', code: 'INVALID_INPUT' });
    if (!configured) return json(501, { error: 'Mail is not configured', code: 'MAIL_NOT_CONFIGURED' });
    // One test mail per hour: the dedupe key of a marker notification is the limiter.
    const hour = new Date().toISOString().slice(0, 13);
    const { data: marker } = await db
      .from('notifications')
      .upsert(
        { user_id: user.id, type: 'other', title: 'Test-Mail verschickt', data: { path: '/profile' }, dedupe_key: `mailtest:${hour}`, emailed_at: new Date().toISOString() },
        { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
      )
      .select('id');
    if (!marker?.length) return json(429, { error: 'Test mail already sent this hour', code: 'RATE_LIMITED' });
    const people = await recipients(db, [user.id]);
    const person = people.get(user.id);
    if (!person) return json(404, { error: 'No e-mail address', code: 'NOT_FOUND' });
    await send(
      instantMail(
        { email: person.email, name: person.display_name },
        [{ type: 'other', title: 'Test-Mail: Der Versand funktioniert', body: 'So sehen Benachrichtigungen per E-Mail aus.', data: { path: '/profile' }, created_at: new Date().toISOString() }],
        env.appUrl,
        unsubscribeLink(env.functionsUrl, person.unsubscribe_token, 'instant'),
      ),
    );
    return json(200, { sent: true, sandbox: env.sandbox, to: person.email });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Internal error', code: 'INTERNAL' });
  }
});
