import { describe, expect, it } from 'vitest';
import { planRotation, planStart, priceOf, rotationEvents, sanitizePlan, viewingPace } from '../supabase/functions/_shared/rotation.ts';

const names = { 8: 'Netflix', 337: 'Disney+', 11: 'MUBI', 691: 'Play Suisse' };
const t = (key: string, minutes: number, providers: number[]) => ({ key, title: key.toUpperCase(), minutes, providers });

describe('prices and pace', () => {
  it('uses my own price first, then the default, then a marked estimate', () => {
    expect(priceOf(8)).toEqual({ price: 18.9, estimated: false });
    expect(priceOf(8, { 8: 21 })).toEqual({ price: 21, estimated: false });
    expect(priceOf(691, { 691: 0 })).toEqual({ price: 0, estimated: false });
    expect(priceOf(999)).toEqual({ price: 12, estimated: true });
    expect(priceOf(8, { 8: 'x' }).price).toBe(18.9);
  });

  it('measures minutes per week over the last twelve weeks, with a fallback', () => {
    const watched = [
      { date: '2026-10-01', minutes: 120 },
      { date: '2026-09-15', minutes: 2760 },
      { date: '2025-01-01', minutes: 9999 },
    ];
    expect(viewingPace(watched, '2026-10-14')).toEqual({ minutesPerWeek: 240, estimated: false });
    expect(viewingPace([{ date: '2026-10-01', minutes: 60 }], '2026-10-14')).toEqual({ minutesPerWeek: 240, estimated: true });
  });

  it('starts this month only if enough of it is left', () => {
    expect(planStart('2026-10-14')).toEqual({ month: '2026-10', share: 18 / 31 });
    expect(planStart('2026-10-25')).toEqual({ month: '2026-11', share: 1 });
  });
});

describe('planRotation', () => {
  const titles = [
    ...Array.from({ length: 9 }, (_, i) => t(`movie:${i + 1}`, 110, [8])),
    ...Array.from({ length: 6 }, (_, i) => t(`movie:${i + 20}`, 120, [337])),
    t('movie:40', 100, [8, 337]),
    t('movie:50', 90, [691]),
    t('movie:60', 95, []),
  ];

  it('picks one service per month by what fits my pace and compares with keeping both', () => {
    const plan = planRotation({ titles, names, pace: 240, prices: { 691: 0 }, current: [8, 337], today: '2026-10-25' });
    expect(plan.months.map((m) => [m.month, m.provider, m.titles.length])).toEqual([
      ['2026-11', 'Netflix', 9],
      ['2026-12', 'Disney+', 7],
    ]);
    expect(plan.months[0].minutes).toBe(990);
    expect(plan.cost).toBe(32.8);
    expect(plan.baseline).toBe(65.6);
    expect(plan.savings).toBe(32.8);
    expect(plan.free).toEqual(['movie:50']);
    expect(plan.later).toEqual([]);
  });

  it('keeps the same service for another month when there is more to watch', () => {
    const plan = planRotation({ titles: titles.slice(0, 9), names, pace: 120, today: '2026-10-25' });
    expect(plan.months.map((m) => m.provider)).toEqual(['Netflix', 'Netflix', 'Netflix']);
    expect(plan.months.map((m) => m.titles.length)).toEqual([4, 4, 1]);
    expect(plan.baseline).toBe(56.7); // no subscriptions now: Netflix for all three months
    expect(rotationEvents(plan.months, { today: '2026-10-25' }).map((e) => e.summary)).toEqual([
      'Abo starten: Netflix (4 Titel geplant)',
      'Netflix bis 31.1. kündigen – noch 1 Titel offen',
    ]);
  });

  it('plans nothing without streamable titles', () => {
    expect(planRotation({ titles: [t('movie:60', 95, [])], names, pace: 240, today: '2026-10-25' }).months).toEqual([]);
  });
});

describe('calendar reminders', () => {
  const months = [
    { month: '2026-11', provider_id: 8, provider: 'Netflix', price: 18.9, minutes: 990, titles: [{ key: 'movie:1', title: 'Roma' }, { key: 'movie:2', title: 'Okja' }] },
    { month: '2026-12', provider_id: 337, provider: 'Disney+', price: 13.9, minutes: 720, titles: [{ key: 'movie:20', title: 'Soul' }] },
  ];

  it('starts and cancels at the right time and counts what is left', () => {
    const events = rotationEvents(months, { today: '2026-10-25', done: new Set(['movie:1']) });
    expect(events.map((e) => [e.date, e.summary])).toEqual([
      ['2026-11-01', 'Abo starten: Netflix (2 Titel geplant)'],
      ['2026-11-27', 'Netflix bis 30.11. kündigen – noch 1 Titel offen'],
      ['2026-12-01', 'Abo starten: Disney+ (1 Titel geplant)'],
      ['2026-12-28', 'Disney+ bis 31.12. kündigen – noch 1 Titel offen'],
    ]);
    expect(events[1].description).toBe('Okja');
    // Late in the plan: only what is still ahead, the cancel reminder on the last day.
    expect(rotationEvents(months, { today: '2026-12-29' }).map((e) => [e.date, e.summary])).toEqual([['2026-12-31', 'Disney+ bis 31.12. kündigen – noch 1 Titel offen']]);
  });

  it('accepts only well-formed saved plans', () => {
    expect(sanitizePlan([{ month: '2026-11', provider_id: 8, provider: 'Netflix', price: 18.9, titles: [{ key: 'movie:1', title: 'Roma' }, { key: 1 }] }, { month: 'x' }])).toEqual([
      { month: '2026-11', provider_id: 8, provider: 'Netflix', price: 18.9, minutes: 0, titles: [{ key: 'movie:1', title: 'Roma' }] },
    ]);
    expect(sanitizePlan({})).toEqual([]);
  });
});
