import { useEffect, useState } from 'react';
import { Messages, useSubmit } from '../components/Form.jsx';
import TitleRow from '../components/TitleRow.jsx';
import WatchlistActions from '../components/WatchlistActions.jsx';
import { titleKey } from '../lib/labels.js';
import { addToWatchlist, loadWatchlist, removeFromWatchlist, searchTitles, updateWatchlistItem } from '../lib/watchlist.js';

export default function WatchlistPage() {
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
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
      <section className="panel reveal" style={{ '--i': 0 }}>
        <p className="eyebrow">Suchen</p>
        <form className="row search-form" onSubmit={search}>
          <input
            className="search-input"
            placeholder="Film oder Serie …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            maxLength={100}
          />
          <button disabled={busy}>Suchen</button>
        </form>
        {results.length > 0 && (
          <ul className="plain">
            {results.map((r, index) => (
              <TitleRow key={titleKey(r)} item={r} index={index}>
                <button
                  className="icon-button"
                  aria-label={inList.has(titleKey(r)) ? 'Bereits in der Watchlist' : 'Zur Watchlist hinzufügen'}
                  disabled={busy || inList.has(titleKey(r))}
                  onClick={() => add(r)}
                >
                  {inList.has(titleKey(r)) ? '✓' : '+'}
                </button>
              </TitleRow>
            ))}
          </ul>
        )}
      </section>
      <Messages error={error} />
      <section className="panel reveal" style={{ '--i': 1 }}>
        <div className="panel-head">
          <h1>Meine Watchlist</h1>
          {items?.length > 0 && <span className="eyebrow">{items.length} Titel</span>}
        </div>
        {items === null ? (
          <p className="muted">Lade …</p>
        ) : items.length === 0 ? (
          <p className="muted">Noch leer. Suche oben nach Filmen und Serien.</p>
        ) : (
          <ul className="plain">
            {items.map((i, index) => (
              <TitleRow key={titleKey(i)} item={i} index={index + 2}>
                <WatchlistActions item={i} busy={busy} onUpdate={(changes) => update(i, changes)} onRemove={() => remove(i)} />
              </TitleRow>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
