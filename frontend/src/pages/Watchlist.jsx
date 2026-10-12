import { useEffect, useState } from 'react';
import { Messages, useSubmit } from '../components/Form.jsx';
import { unwrap } from '../lib/errors.js';
import { invokeFunction, supabase } from '../lib/supabase.js';

const POSTER_BASE = 'https://image.tmdb.org/t/p/w154';
const TYPE_LABEL = { movie: 'Film', tv: 'Serie' };

function TitleRow({ item, action }) {
  return (
    <li className="title-row">
      {item.poster_path ? <img src={POSTER_BASE + item.poster_path} alt="" loading="lazy" /> : <div className="poster-placeholder" />}
      <div className="grow">
        <strong>{item.title}</strong>
        <div className="muted">
          {TYPE_LABEL[item.media_type]} {item.release_date ? `· ${item.release_date.slice(0, 4)}` : ''}
        </div>
      </div>
      {action}
    </li>
  );
}

export default function WatchlistPage() {
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const { busy, error, run } = useSubmit();

  useEffect(() => {
    run(async () => setItems(unwrap(await supabase.from('watchlist').select().order('added_at', { ascending: false }))));
  }, []);

  const key = (i) => `${i.media_type}-${i.tmdb_id}`;
  const inList = new Set((items ?? []).map(key));

  const search = (e) => {
    e.preventDefault();
    run(async () => setResults((await invokeFunction('tmdb', { action: 'search', query: query.trim() })).results));
  };
  const add = (r) =>
    run(async () => {
      const row = { tmdb_id: r.tmdb_id, media_type: r.media_type, title: r.title, poster_path: r.poster_path, release_date: r.release_date };
      const item = unwrap(await supabase.from('watchlist').upsert(row, { onConflict: 'user_id,media_type,tmdb_id', ignoreDuplicates: true }).select().maybeSingle()) ?? row;
      setItems((list) => [item, ...list.filter((i) => key(i) !== key(item))]);
    });
  const remove = (i) =>
    run(async () => {
      unwrap(await supabase.from('watchlist').delete().match({ media_type: i.media_type, tmdb_id: i.tmdb_id }));
      setItems((list) => list.filter((x) => key(x) !== key(i)));
    });

  return (
    <>
      <section className="card">
        <form className="row" onSubmit={search}>
          <input placeholder="Film oder Serie suchen …" value={query} onChange={(e) => setQuery(e.target.value)} required maxLength={100} />
          <button disabled={busy}>Suchen</button>
        </form>
        <ul className="plain">
          {results.map((r) => (
            <TitleRow
              key={key(r)}
              item={r}
              action={
                <button disabled={busy || inList.has(key(r))} onClick={() => add(r)}>
                  {inList.has(key(r)) ? '✓' : '＋'}
                </button>
              }
            />
          ))}
        </ul>
      </section>
      <Messages error={error} />
      <section className="card">
        <h1>Meine Watchlist</h1>
        {items === null ? (
          <p>Lade …</p>
        ) : items.length === 0 ? (
          <p className="muted">Noch leer. Suche oben nach Filmen und Serien.</p>
        ) : (
          <ul className="plain">
            {items.map((i) => (
              <TitleRow
                key={key(i)}
                item={i}
                action={
                  <button className="link danger" disabled={busy} onClick={() => remove(i)}>
                    Entfernen
                  </button>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
