// Understands what other apps share with us (share target): IMDb, TMDb and Letterboxd links,
// or a text like „Schau dir „Dark“ auf Netflix an“ → a search query.
const URL_PATTERN = /https?:\/\/[^\s<>"]+/i;

export function parseShared({ title = '', text = '', url = '' } = {}) {
  const link = url || text.match(URL_PATTERN)?.[0] || '';
  const imdb = link.match(/imdb\.com\/(?:[a-z-]+\/)?title\/(tt\d{5,10})/i);
  if (imdb) return { kind: 'imdb', imdbId: imdb[1].toLowerCase() };
  const tmdb = link.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
  if (tmdb) return { kind: 'tmdb', media_type: tmdb[1].toLowerCase(), tmdb_id: Number(tmdb[2]) };
  const letterboxd = link.match(/letterboxd\.com\/(?:[^/]+\/)?film\/([a-z0-9-]+)/i);
  if (letterboxd) return { kind: 'query', query: letterboxd[1].replace(/-\d{4}$/, '').replace(/-/g, ' ') };

  const rest = text.replace(URL_PATTERN, ' ');
  const quoted = rest.match(/[„“"«‚'‘]([^„“"»«‘’']{2,100})[“”"»‘’']/);
  const candidate = (quoted?.[1] ?? (title || rest)).replace(/\s+/g, ' ').trim();
  return candidate.length >= 2 ? { kind: 'query', query: candidate.slice(0, 100) } : { kind: 'none' };
}
