// Pure functions for the watchlist view: segments, filters, sorting and counts.

export const SEGMENTS = [
  { id: 'next', label: 'Als Nächstes', statuses: ['watching', 'planned'] },
  { id: 'watched', label: 'Gesehen', statuses: ['completed'] },
  { id: 'paused', label: 'Pausiert', statuses: ['paused', 'dropped'] },
  { id: 'all', label: 'Alle', statuses: null },
];

export const TYPES = [
  { id: 'all', label: 'Filme & Serien' },
  { id: 'movie', label: 'Filme' },
  { id: 'tv', label: 'Serien' },
];

export const SORTS = [
  { id: 'added', label: 'Zuletzt hinzugefügt' },
  { id: 'watched', label: 'Zuletzt gesehen' },
  { id: 'title', label: 'Titel A–Z' },
  { id: 'year', label: 'Neueste zuerst' },
  { id: 'tmdb', label: 'TMDb-Bewertung' },
  { id: 'mine', label: 'Meine Bewertung' },
];

const DEFAULT_SORT = { next: 'added', watched: 'watched', paused: 'added', all: 'added' };

export const defaultSort = (segment) => DEFAULT_SORT[segment] ?? 'added';

const has = (list, id) => list.some((x) => x.id === id);

// Validates URL parameters; unknown values fall back to defaults.
export function normalizeView(params) {
  const get = (k) => (typeof params?.get === 'function' ? params.get(k) : params?.[k]) ?? '';
  const segment = has(SEGMENTS, get('s')) ? get('s') : 'next';
  const type = has(TYPES, get('type')) ? get('type') : 'all';
  const sort = has(SORTS, get('sort')) ? get('sort') : defaultSort(segment);
  const q = get('q').slice(0, 100);
  return { segment, type, sort, q };
}

// URL parameters for a view, leaving out defaults so the plain URL stays "/".
export function viewToParams(view) {
  const params = {};
  if (view.segment !== 'next') params.s = view.segment;
  if (view.type !== 'all') params.type = view.type;
  if (view.sort !== defaultSort(view.segment)) params.sort = view.sort;
  if (view.q.trim()) params.q = view.q;
  return params;
}

export const foldText = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function matchesText(item, q) {
  const needle = foldText(q).trim();
  if (!needle) return true;
  return foldText(item.title).includes(needle) || foldText(item.original_title).includes(needle);
}

const collator = new Intl.Collator('de-CH', { sensitivity: 'base', numeric: true });
const time = (iso) => (iso ? Date.parse(iso) : 0);
const year = (item) => Number(item.release_date?.slice(0, 4)) || 0;
const STATUS_RANK = { watching: 0, planned: 1 };

const COMPARATORS = {
  added: (a, b) => time(b.added_at) - time(a.added_at),
  watched: (a, b) => time(b.watched_at) - time(a.watched_at) || time(b.added_at) - time(a.added_at),
  title: (a, b) => collator.compare(a.title, b.title),
  year: (a, b) => year(b) - year(a),
  tmdb: (a, b) => (Number(b.vote_average) || 0) - (Number(a.vote_average) || 0),
  mine: (a, b) => (b.my_rating ?? 0) - (a.my_rating ?? 0) || time(b.rated_at) - time(a.rated_at),
};

export function sortItems(items, sort, segment) {
  const compare = COMPARATORS[sort] ?? COMPARATORS.added;
  const tieBreak = (a, b) => collator.compare(a.title, b.title);
  // In "Als Nächstes", series you are watching come before planned titles.
  const statusFirst = segment === 'next' ? (a, b) => (STATUS_RANK[a.status] ?? 2) - (STATUS_RANK[b.status] ?? 2) : () => 0;
  return [...items].sort((a, b) => statusFirst(a, b) || compare(a, b) || tieBreak(a, b));
}

const inSegment = (item, segment) => {
  const def = SEGMENTS.find((s) => s.id === segment);
  return !def?.statuses || def.statuses.includes(item.status);
};

// Visible items plus counts per segment (counts respect type and text filter).
export function applyView(items, view) {
  const base = (items ?? []).filter((i) => (view.type === 'all' || i.media_type === view.type) && matchesText(i, view.q));
  const counts = Object.fromEntries(SEGMENTS.map((s) => [s.id, base.filter((i) => inSegment(i, s.id)).length]));
  const visible = sortItems(
    base.filter((i) => inSegment(i, view.segment)),
    view.sort,
    view.segment,
  );
  return { visible, counts, total: items?.length ?? 0 };
}
