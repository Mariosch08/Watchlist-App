import { Check, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Messages, useSubmit } from '../components/Form.jsx';
import { TitleRowSkeleton } from '../components/Skeleton.jsx';
import TitleRow from '../components/TitleRow.jsx';
import WatchlistActions from '../components/WatchlistActions.jsx';
import { titleKey } from '../lib/labels.js';
import { addToWatchlist, loadWatchlist, removeFromWatchlist, searchTitles, updateWatchlistItem } from '../lib/watchlist.js';

export default function WatchlistPage() {
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const { busy, error, run } = useSubmit();

  useEffect(() => {
    run(async () => setItems(await loadWatchlist()));
  }, []);

  const inList = new Set((items ?? []).map(titleKey));
  const replace = (saved) => setItems((list) => list.map((x) => (titleKey(x) === titleKey(saved) ? saved : x)));

  const search = (e) => {
    e.preventDefault();
    run(async () => setResults(await searchTitles(query)));
  };
  const add = (r) =>
    run(async () => {
      const item = await addToWatchlist(r);
      setItems((list) => [item, ...list.filter((i) => titleKey(i) !== titleKey(item))]);
    });
  const update = (i, changes) => run(async () => replace(await updateWatchlistItem(i, changes)));
  const remove = (i) =>
    run(async () => {
      await removeFromWatchlist(i);
      setItems((list) => list.filter((x) => titleKey(x) !== titleKey(i)));
    });

  return (
    <>
      <section className="card" aria-labelledby="search-title">
        <h2 id="search-title">Titel suchen</h2>
        <form className="inline-form" onSubmit={search} role="search">
          <input
            type="search"
            aria-label="Film oder Serie"
            placeholder="z. B. Dune oder Severance"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            maxLength={100}
          />
          <button className="btn-primary" disabled={busy}>
            Suchen
          </button>
        </form>
        {results?.length === 0 && <p className="empty">Keine Treffer für „{query}“. Versuche den Originaltitel.</p>}
        {results?.length > 0 && (
          <ul className="list">
            {results.map((r) => {
              const added = inList.has(titleKey(r));
              return (
                <TitleRow key={titleKey(r)} item={r}>
                  <button
                    className="btn-icon"
                    aria-label={added ? `${r.title} ist in der Watchlist` : `${r.title} zur Watchlist hinzufügen`}
                    title={added ? 'In der Watchlist' : 'Zur Watchlist hinzufügen'}
                    disabled={busy || added}
                    onClick={() => add(r)}
                  >
                    {added ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                  </button>
                </TitleRow>
              );
            })}
          </ul>
        )}
      </section>
      <Messages error={error} />
      <section className="card" aria-labelledby="watchlist-title">
        <div className="card-head">
          <h1 id="watchlist-title">Meine Watchlist</h1>
          {items?.length > 0 && <span className="caption">{items.length} Titel</span>}
        </div>
        {items === null ? (
          <TitleRowSkeleton />
        ) : items.length === 0 ? (
          <p className="empty">Noch keine Titel. Suche oben nach einem Film oder einer Serie, oder importiere deine IMDb-Daten.</p>
        ) : (
          <ul className="list">
            {items.map((i) => (
              <TitleRow key={titleKey(i)} item={i}>
                <WatchlistActions item={i} busy={busy} onUpdate={(changes) => update(i, changes)} onRemove={() => remove(i)} />
              </TitleRow>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
