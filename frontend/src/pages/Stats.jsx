import { useQuery } from '@tanstack/react-query';
import { Share2, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import { CardSkeleton } from '../components/Skeleton.jsx';
import { BarList, MonthBars, RatingBars } from '../components/stats/Charts.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { diaryKeys, fetchDiary } from '../lib/api/diary.js';
import { fetchGenres } from '../lib/api/discovery.js';
import { fetchArtists } from '../lib/api/music.js';
import { fetchProfile } from '../lib/api/profile.js';
import { fetchTopRated } from '../lib/api/tmdb.js';
import { errorMessage } from '../lib/errors.js';
import { detailPath } from '../lib/labels.js';
import { queryKeys } from '../lib/queryClient.js';
import { availableYears, challenges, MONTH_LONG, reviewSvg, viewings, yearStats } from '../lib/stats.js';

async function shareReview(svg, year) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], `filmjahr-${year}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Mein Filmjahr ${year}` });
      return 'shared';
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    return 'downloaded';
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Challenges({ list }) {
  return (
    <ul className="challenges">
      {list.map((c) => (
        <li key={c.id} className={c.done ? 'challenge challenge--done' : 'challenge'}>
          <div className="challenge-head">
            <strong>
              {c.done && <Trophy size={16} aria-hidden="true" />} {c.title}
            </strong>
            <span className="challenge-count">{c.loading ? '…' : `${c.value} / ${c.goal}`}</span>
          </div>
          <span className="progress" role="progressbar" aria-label={c.title} aria-valuemin={0} aria-valuemax={c.goal} aria-valuenow={c.value}>
            <span className="progress-fill" style={{ '--progress': c.value / c.goal }} />
          </span>
          <span className="caption">
            {c.detail}
            {c.missing?.length > 0 && c.missing.length <= 4 ? ` – es fehlen noch: ${c.missing.map((d) => `${d}er`).join(', ')}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function StatsPage() {
  useDocumentTitle('Statistik');
  const user = useUser();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const watchlist = useWatchlist();
  const diary = useQuery({ queryKey: diaryKeys.all(user.id), queryFn: fetchDiary });
  const genres = useQuery({ queryKey: ['genres'], queryFn: fetchGenres, staleTime: 24 * 60 * 60_000 });
  const topRated = useQuery({ queryKey: ['topRated'], queryFn: fetchTopRated, staleTime: 24 * 60 * 60_000 });
  const artists = useQuery({ queryKey: queryKeys.music(user.id, 'artists'), queryFn: fetchArtists });
  const profile = useQuery({ queryKey: queryKeys.profile(user.id), queryFn: () => fetchProfile(user.id) });
  const [sharing, setSharing] = useState(false);

  const views = useMemo(() => (watchlist.data && diary.data ? viewings(watchlist.data, diary.data) : null), [watchlist.data, diary.data]);
  const years = useMemo(() => (views ? availableYears(views) : []), [views]);
  const year = years.includes(Number(params.get('jahr'))) ? Number(params.get('jahr')) : years[0];
  const genreNames = useMemo(() => new Map([...(genres.data?.movie ?? []), ...(genres.data?.tv ?? [])].map((g) => [g.id, g.name])), [genres.data]);
  const stats = useMemo(() => (views ? yearStats(views, year, genreNames) : null), [views, year, genreNames]);
  const goals = useMemo(
    () => (views ? challenges({ views, watchlist: watchlist.data, topRated: topRated.data ?? (topRated.isError ? [] : null), year }) : []),
    [views, watchlist.data, topRated.data, topRated.isError, year],
  );

  if (watchlist.isError || diary.isError) return <Messages error={errorMessage(watchlist.error ?? diary.error)} />;
  if (!stats) return <CardSkeleton />;

  const share = async () => {
    setSharing(true);
    try {
      const result = await shareReview(reviewSvg(stats, { name: profile.data?.display_name }), year);
      if (result === 'downloaded') toast.success('Bild gespeichert – bereit zum Teilen.');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Das Bild konnte nicht erstellt werden.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1 id="stats-title" tabIndex={-1}>
          Statistik
        </h1>
        {years.length > 1 && (
          <div className="segmented" role="group" aria-label="Jahr">
            {years.slice(0, 6).map((y) => (
              <button key={y} type="button" className="segment" aria-pressed={y === year} onClick={() => setParams(y === years[0] ? {} : { jahr: String(y) }, { replace: true })}>
                {y}
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="card review" aria-labelledby="review-title">
        <div className="card-head">
          <h2 id="review-title">Mein Filmjahr {year}</h2>
          <button className="btn-compact" disabled={sharing || stats.total === 0} onClick={share}>
            <Share2 size={16} aria-hidden="true" /> {sharing ? 'Wird erstellt …' : 'Als Bild teilen'}
          </button>
        </div>
        {stats.total === 0 ? (
          <p className="empty">
            Für {year} gibt es noch nichts. Markiere Titel als gesehen oder trag sie ins <Link to="/diary">Tagebuch</Link> ein.
          </p>
        ) : (
          <>
            <dl className="stats stats--large">
              <div className="stat">
                <dt>Titel gesehen</dt>
                <dd>{stats.titles}</dd>
              </div>
              <div className="stat">
                <dt>{stats.estimated ? 'Stunden Film (ca.)' : 'Stunden Film'}</dt>
                <dd>{stats.hours}</dd>
              </div>
              <div className="stat">
                <dt>Filme · Serien</dt>
                <dd>
                  {stats.movies} · {stats.series}
                </dd>
              </div>
              <div className="stat">
                <dt>Ø Bewertung</dt>
                <dd>{stats.average ?? '–'}</dd>
              </div>
              {stats.cinema > 0 && (
                <div className="stat">
                  <dt>Im Kino</dt>
                  <dd>{stats.cinema}</dd>
                </div>
              )}
            </dl>
            <MonthBars values={stats.months} highlight={stats.bestMonth} />
            {stats.bestMonth != null && <p className="caption">Stärkster Monat: {MONTH_LONG[stats.bestMonth]}.</p>}
          </>
        )}
      </section>

      {stats.total > 0 && (
        <div className="grid-2">
          <section className="card" aria-labelledby="genres-title">
            <h2 id="genres-title">Genres</h2>
            <BarList
              items={stats.genres.map((g) => ({ key: g.id, label: g.name, value: g.count, display: g.average ? `${g.count} · Ø ${g.average}` : g.count }))}
            />
          </section>
          <section className="card" aria-labelledby="ratings-title">
            <h2 id="ratings-title">Meine Bewertungen</h2>
            <RatingBars values={stats.ratings} />
          </section>
          {stats.decades.length > 0 && (
            <section className="card" aria-labelledby="decades-title">
              <h2 id="decades-title">Filme nach Jahrzehnt</h2>
              <BarList items={stats.decades.map((d) => ({ key: d.decade, label: `${d.decade}er`, value: d.count }))} />
            </section>
          )}
          {stats.favourites.length > 0 && (
            <section className="card" aria-labelledby="favourites-title">
              <h2 id="favourites-title">Lieblinge {year}</h2>
              <ol className="favourites">
                {stats.favourites.map((f) => (
                  <li key={`${f.media_type}-${f.tmdb_id}`}>
                    <Link to={detailPath(f)}>{f.title}</Link> <span className="meta-inline">{f.rating}/10</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}

      <section className="card" aria-labelledby="challenges-title">
        <h2 id="challenges-title">Herausforderungen</h2>
        <Challenges list={goals} />
      </section>

      {artists.data?.length > 0 && (
        <section className="card" aria-labelledby="music-stats-title">
          <h2 id="music-stats-title">Musik: meistgehört</h2>
          <BarList items={artists.data.slice(0, 8).map((a, i, all) => ({ key: a.artist_key, label: a.name, value: all.length - i, display: `#${a.rank}` }))} />
          <p className="caption">
            Aus deinen Hördaten der letzten 6 Monate – mehr auf <Link to="/music">Musik</Link>.
          </p>
        </section>
      )}
    </>
  );
}
