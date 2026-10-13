import { describe, expect, it, vi } from 'vitest';
import { digestIsEmpty, digestMail, escapeHtml, instantMail, isDigestTime, linkFor, sendBrevo, unsubscribeLink } from '../supabase/functions/_shared/mail.ts';

const APP = 'https://mariosch08.github.io/Watchlist-App/';
const UNSUB = unsubscribeLink('https://x.supabase.co/functions/v1', '11111111-2222-4333-8444-555555555555', 'instant');
const note = (title: string, data: Record<string, unknown> = {}) => ({ type: 'recommendation', title, body: null, data, created_at: '2026-10-12T10:00:00Z' });

describe('mail content', () => {
  it('links like the notifications page and never to foreign hosts', () => {
    expect(linkFor(note('x', { media_type: 'movie', tmdb_id: 603 }), APP)).toBe(`${APP}title/movie/603`);
    expect(linkFor(note('x', { path: '/lists/abc' }), APP)).toBe(`${APP}lists/abc`);
    expect(linkFor(note('x', { path: '//evil.example' }), APP)).toBe(`${APP}notifications`);
    expect(UNSUB).toBe('https://x.supabase.co/functions/v1/notify-email?unsubscribe=11111111-2222-4333-8444-555555555555&what=instant');
  });

  it('escapes user content and summarizes several notifications in one mail', () => {
    const mail = instantMail({ email: 'a@example.com' }, [note('Ben empfiehlt dir „<b>Heat</b>“'), note('Filmabend steht')], APP, UNSUB);
    expect(mail.subject).toBe('2 Neuigkeiten: Ben empfiehlt dir „<b>Heat</b>“');
    expect(mail.html).toContain('&lt;b&gt;Heat&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>Heat</b>');
    expect(mail.html).toContain('Abmelden');
    expect(mail.text).toContain(UNSUB);
    expect(escapeHtml('"&')).toBe('&quot;&amp;');
  });

  it('builds the weekly digest only with content', () => {
    const empty = { notifications: [], suggestions: [], episodes: [] };
    expect(digestIsEmpty(empty)).toBe(true);
    const mail = digestMail(
      { email: 'a@example.com' },
      { ...empty, episodes: [{ title: 'Severance S02E05', when: 'Freitag, 17. Oktober', href: `${APP}title/tv/95396` }], suggestions: [{ title: 'Dune', reason: 'Weil du Arrival mochtest', href: `${APP}title/movie/438631` }] },
      APP,
      UNSUB,
    );
    expect(mail.subject).toBe('Deine Watchlist-Woche');
    expect(mail.text).toMatch(/DIESE WOCHE BEI DIR\n- Severance S02E05 – Freitag, 17. Oktober/);
    expect(mail.html).toContain('Für dich vorgeschlagen');
  });

  it('knows when it is Sunday 18:00 in Zurich (summer and winter time)', () => {
    expect(isDigestTime(new Date('2026-10-18T16:07:00Z'))).toBe(true); // CEST
    expect(isDigestTime(new Date('2026-10-18T17:07:00Z'))).toBe(false);
    expect(isDigestTime(new Date('2026-12-20T17:37:00Z'))).toBe(true); // CET
    expect(isDigestTime(new Date('2026-12-19T17:37:00Z'))).toBe(false); // Saturday
  });
});

describe('sendBrevo', () => {
  it('sends with unsubscribe headers and honours the sandbox switch', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 201 }));
    const mail = instantMail({ email: 'a@example.com', name: 'Anna' }, [note('Hallo')], APP, UNSUB);
    await sendBrevo(mail, { apiKey: 'key', from: 'app@example.com', sandbox: true, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('key');
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual([{ email: 'a@example.com', name: 'Anna' }]);
    expect(body.headers).toEqual({ 'List-Unsubscribe': `<${UNSUB}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', 'X-Sib-Sandbox': 'drop' });
  });

  it('fails loudly on API errors', async () => {
    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    await expect(sendBrevo(instantMail({ email: 'a@example.com' }, [note('x')], APP, UNSUB), { apiKey: 'bad', from: 'a@b.c', fetchImpl })).rejects.toThrow('Brevo 401');
  });
});
