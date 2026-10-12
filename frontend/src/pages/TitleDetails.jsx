import { AlertCircle, ArrowLeft, Star } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CastList from '../components/details/CastList.jsx';
import DetailActions from '../components/details/DetailActions.jsx';
import SimilarTitles from '../components/details/SimilarTitles.jsx';
import StreamingProviders from '../components/details/StreamingProviders.jsx';
import Trailer from '../components/details/Trailer.jsx';
import { CardSkeleton } from '../components/Skeleton.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useTitleDetails } from '../hooks/useTitleDetails.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { errorMessage } from '../lib/errors.js';
import { BACKDROP_BASE, formatRuntime, MEDIA_TYPES, POSTER_LARGE_BASE, titleKey, TYPE_LABEL } from '../lib/labels.js';

function BackButton() {
  const navigate = useNavigate();
  // Go back when the user came from inside the app, otherwise to the watchlist.
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));
  return (
    <button className="btn-ghost btn-compact detail-back" onClick={back}>
      <ArrowLeft size={16} aria-hidden="true" />
      Zurück
    </button>
  );
}

function Problem({ title, children }) {
  useDocumentTitle(title);
  return (
    <section className="card" aria-labelledby="detail-problem">
      <h1 id="detail-problem" tabIndex={-1}>
        {title}
      </h1>
      {children}
      <p className="links">
        <Link to="/">Zur Watchlist</Link>
      </p>
    </section>
  );
}

function metaParts(d) {
  const parts = [TYPE_LABEL[d.media_type]];
  if (d.release_date) parts.push(d.release_date.slice(0, 4));
  if (d.media_type === 'movie' && d.runtime) parts.push(formatRuntime(d.runtime));
  if (d.media_type === 'tv') {
    if (d.number_of_seasons) parts.push(d.number_of_seasons === 1 ? '1 Staffel' : `${d.number_of_seasons} Staffeln`);
    if (d.number_of_episodes) parts.push(`${d.number_of_episodes} Folgen`);
    if (d.runtime) parts.push(`ca. ${d.runtime} Min. pro Folge`);
  }
  return parts;
}

function Details({ details: d }) {
  useDocumentTitle(d.title);
  const watchlist = useWatchlist();
  const byKey = useMemo(() => new Map((watchlist.data ?? []).map((x) => [titleKey(x), x])), [watchlist.data]);
  const entry = byKey.get(titleKey(d));
  const score = Number(d.vote_average);
  const showOriginal = d.original_title && d.original_title !== d.title;

  return (
    <>
      <section className="card detail-head" aria-labelledby="detail-title">
        {d.backdrop_path && <img className="backdrop" src={BACKDROP_BASE + d.backdrop_path} alt="" decoding="async" />}
        <div className="detail-intro">
          {d.poster_path ? (
            <img className="poster-large detail-poster" src={POSTER_LARGE_BASE + d.poster_path} alt={`Poster: ${d.title}`} />
          ) : (
            <span className="poster-large detail-poster" aria-hidden="true" />
          )}
          <div className="stack">
            <h1 id="detail-title" tabIndex={-1}>
              {d.title}
            </h1>
            {showOriginal && <span className="meta-original muted">{d.original_title}</span>}
            <div className="meta">
              {metaParts(d).map((p) => (
                <span key={p}>{p}</span>
              ))}
              {score > 0 && (
                <span className="meta-item" title="TMDb-Bewertung">
                  <Star size={12} aria-hidden="true" />
                  <span className="visually-hidden">TMDb-Bewertung</span>
                  {score.toFixed(1)}
                </span>
              )}
            </div>
            {d.genres?.length > 0 && (
              <ul className="tags" aria-label="Genres">
                {d.genres.map((g) => (
                  <li key={g} className="badge">
                    {g}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DetailActions details={d} entry={entry} loading={watchlist.isPending && !watchlist.isError} />
        {d.tagline && <p className="tagline">{d.tagline}</p>}
        {d.overview ? <p className="overview">{d.overview}</p> : <p className="muted">Keine Beschreibung vorhanden.</p>}
        {d.imdb_id && (
          <p className="links">
            <a href={`https://www.imdb.com/title/${encodeURIComponent(d.imdb_id)}/`} target="_blank" rel="noopener noreferrer">
              Auf IMDb ansehen
            </a>
          </p>
        )}
      </section>

      {d.trailer && (
        <section className="card" aria-labelledby="trailer-title">
          <h2 id="trailer-title">Trailer</h2>
          <Trailer key={d.trailer.key} trailer={d.trailer} title={d.title} />
        </section>
      )}

      <StreamingProviders providers={d.providers} />
      <CastList cast={d.cast} crew={d.crew} />
      <SimilarTitles titles={d.similar} byKey={byKey} />
    </>
  );
}

// Detail page of a movie or series: /title/:mediaType/:tmdbId
export default function TitleDetailsPage() {
  const { mediaType, tmdbId } = useParams();
  const valid = MEDIA_TYPES.includes(mediaType) && /^[1-9]\d{0,8}$/.test(tmdbId ?? '');
  const query = useTitleDetails(mediaType, tmdbId, { enabled: valid });

  let content;
  if (!valid) {
    content = (
      <Problem title="Titel nicht gefunden">
        <p>Diese Adresse passt zu keinem Film und keiner Serie.</p>
      </Problem>
    );
  } else if (query.isPending) {
    content = (
      <>
        <CardSkeleton />
        <CardSkeleton />
      </>
    );
  } else if (query.isError) {
    content =
      query.error?.code === 'NOT_FOUND' ? (
        <Problem title="Titel nicht gefunden">
          <p>{errorMessage(query.error)}</p>
        </Problem>
      ) : (
        <Problem title="Details konnten nicht geladen werden">
          <p className="notice notice--error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            {errorMessage(query.error)}
          </p>
          <div className="actions">
            <button onClick={() => query.refetch()}>Erneut laden</button>
          </div>
        </Problem>
      );
  } else {
    content = <Details details={query.data} />;
  }

  return (
    <>
      <div>
        <BackButton />
      </div>
      {content}
    </>
  );
}
