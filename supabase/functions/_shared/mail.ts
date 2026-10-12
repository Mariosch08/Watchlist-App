// E-mail content (German, plain HTML with inline styles) and sending via the Brevo API. Pure and testable.
export const INSTANT_TYPES = new Set([
  'friend_request',
  'friend_accepted',
  'recommendation',
  'list_invite',
  'movie_night',
  'available',
  'new_season',
  'new_release',
  'concert',
]);
export const MAX_MAILS_PER_RUN = 100; // Brevo free plan: 300 mails per day

export interface MailNotification {
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface Mail {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Same deep links as the notifications page.
export function linkFor(n: Pick<MailNotification, 'data'>, appUrl: string) {
  const d = n.data ?? {};
  if ((d.media_type === 'movie' || d.media_type === 'tv') && Number.isInteger(d.tmdb_id)) return `${appUrl}title/${d.media_type}/${d.tmdb_id}`;
  if (typeof d.path === 'string' && /^\/[a-z]/.test(d.path)) return appUrl + d.path.slice(1);
  return `${appUrl}notifications`;
}

export const unsubscribeLink = (functionsUrl: string, token: string, what: 'instant' | 'digest') =>
  `${functionsUrl}/notify-email?unsubscribe=${encodeURIComponent(token)}&what=${what}`;

interface Item {
  title: string;
  body?: string | null;
  href: string;
}

function layout(heading: string, sections: { title?: string; items: Item[] }[], appUrl: string, unsubscribeUrl: string, why: string) {
  const ink = '#1f1e1c';
  const muted = '#5f5b55';
  const accent = '#2f5d8a';
  const html = `<!doctype html><html lang="de"><body style="margin:0;background:#fbfaf7;font-family:Georgia,serif;color:${ink}">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="margin:0 0 8px;font:600 13px/1.4 Arial,sans-serif;letter-spacing:.08em;color:${muted}">WATCHLIST</p>
<h1 style="margin:0 0 24px;font-size:26px;line-height:1.25">${escapeHtml(heading)}</h1>
${sections
  .map(
    (s) =>
      `${s.title ? `<h2 style="margin:24px 0 8px;font-size:18px">${escapeHtml(s.title)}</h2>` : ''}${s.items
        .map(
          (i) =>
            `<p style="margin:0 0 14px;font:16px/1.5 Arial,sans-serif"><a href="${escapeHtml(i.href)}" style="color:${accent};font-weight:600;text-decoration:none">${escapeHtml(i.title)}</a>${
              i.body ? `<br><span style="color:${muted}">${escapeHtml(i.body)}</span>` : ''
            }</p>`,
        )
        .join('')}`,
  )
  .join('')}
<p style="margin:32px 0 0"><a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:10px 18px;background:${accent};color:#fff;border-radius:6px;font:600 15px Arial,sans-serif;text-decoration:none">App öffnen</a></p>
<p style="margin:32px 0 0;font:12px/1.5 Arial,sans-serif;color:${muted}">${escapeHtml(why)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:${muted}">Abmelden</a> · <a href="${escapeHtml(appUrl)}profile" style="color:${muted}">Einstellungen</a></p>
</div></body></html>`;
  const text = [
    heading,
    '',
    ...sections.flatMap((s) => [...(s.title ? [s.title.toUpperCase()] : []), ...s.items.flatMap((i) => [`- ${i.title}${i.body ? ` – ${i.body}` : ''}`, `  ${i.href}`]), '']),
    `App öffnen: ${appUrl}`,
    '',
    `${why} Abmelden: ${unsubscribeUrl}`,
  ].join('\n');
  return { html, text };
}

export function instantMail(to: Mail['to'], notifications: MailNotification[], appUrl: string, unsubscribeUrl: string): Mail {
  const items = notifications.map((n) => ({ title: n.title, body: n.body, href: linkFor(n, appUrl) }));
  const subject = notifications.length === 1 ? notifications[0].title : `${notifications.length} Neuigkeiten: ${notifications[0].title}`;
  const { html, text } = layout(
    notifications.length === 1 ? 'Neuigkeit für dich' : `${notifications.length} Neuigkeiten für dich`,
    [{ items }],
    appUrl,
    unsubscribeUrl,
    'Du bekommst diese Mail, weil Sofort-Benachrichtigungen eingeschaltet sind.',
  );
  return { to, subject: subject.slice(0, 150), html, text, unsubscribeUrl };
}

export interface DigestData {
  notifications: MailNotification[];
  suggestions: { title: string; reason: string | null; href: string }[];
  episodes: { title: string; when: string; href: string }[];
}

export const digestIsEmpty = (d: DigestData) => !d.notifications.length && !d.suggestions.length && !d.episodes.length;

export function digestMail(to: Mail['to'], d: DigestData, appUrl: string, unsubscribeUrl: string): Mail {
  const sections = [
    ...(d.episodes.length ? [{ title: 'Diese Woche neu in deinen Serien', items: d.episodes.map((e) => ({ title: e.title, body: e.when, href: e.href })) }] : []),
    ...(d.suggestions.length ? [{ title: 'Für dich vorgeschlagen', items: d.suggestions.map((s) => ({ title: s.title, body: s.reason, href: s.href })) }] : []),
    ...(d.notifications.length
      ? [{ title: 'Was passiert ist', items: d.notifications.slice(0, 10).map((n) => ({ title: n.title, body: n.body, href: linkFor(n, appUrl) })) }]
      : []),
  ];
  const { html, text } = layout('Deine Woche', sections, appUrl, unsubscribeUrl, 'Du bekommst diese Mail, weil der Wochenrückblick eingeschaltet ist.');
  return { to, subject: 'Deine Watchlist-Woche', html, text, unsubscribeUrl };
}

// Sunday 18:xx in Zurich (the cron runs twice per hour; digest_sent_at prevents doubles).
export function isDigestTime(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return parts.weekday === 'Sun' && Number(parts.hour) === 18;
}

// Brevo transactional API. MAIL_SANDBOX=true sends "X-Sib-Sandbox: drop": Brevo validates but never delivers.
export async function sendBrevo(mail: Mail, opts: { apiKey: string; from: string; fromName?: string; sandbox?: boolean; fetchImpl?: typeof fetch }) {
  const res = await (opts.fetchImpl ?? fetch)('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': opts.apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: opts.from, name: opts.fromName ?? 'Watchlist' },
      to: [mail.to],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
      headers: {
        'List-Unsubscribe': `<${mail.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        ...(opts.sandbox ? { 'X-Sib-Sandbox': 'drop' } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}
