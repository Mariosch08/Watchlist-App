export const PLACE_LABEL = { cinema: 'im Kino', home: 'zuhause', other: 'unterwegs' };

const monthLabel = (key) => new Date(`${key}-15T12:00:00`).toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });

// Entries (newest first) grouped by month: [{ key: '2026-10', label: 'Oktober 2026', entries }].
export function groupByMonth(entries) {
  const groups = [];
  for (const e of entries) {
    const key = e.watched_on.slice(0, 7);
    if (groups.at(-1)?.key !== key) groups.push({ key, label: monthLabel(key), entries: [] });
    groups.at(-1).entries.push(e);
  }
  return groups;
}

// Headline numbers for one year: viewings, cinema visits, rewatches, most frequent company.
export function diaryStats(entries, year) {
  const inYear = entries.filter((e) => e.watched_on.startsWith(String(year)));
  const company = new Map();
  for (const e of inYear) {
    for (const name of (e.with_whom ?? '').split(/,|\bund\b|&/).map((s) => s.trim()).filter(Boolean)) {
      const k = name.toLowerCase();
      company.set(k, { name: company.get(k)?.name ?? name, count: (company.get(k)?.count ?? 0) + 1 });
    }
  }
  const top = [...company.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  return {
    total: inYear.length,
    cinema: inYear.filter((e) => e.place === 'cinema').length,
    rewatches: inYear.filter((e) => e.rewatch).length,
    company: top,
  };
}

export const describeEntry = (e) =>
  [e.place ? PLACE_LABEL[e.place] : null, e.with_whom ? `mit ${e.with_whom}` : null, e.rewatch ? 'nochmal' : null].filter(Boolean).join(' · ');
