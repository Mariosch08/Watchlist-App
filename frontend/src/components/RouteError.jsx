import { Link, useRouteError } from 'react-router-dom';

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const RELOAD_FLAG = 'watchlist.chunk-reload';

// Shown instead of a blank page when rendering or loading a page fails.
export default function RouteError() {
  const error = useRouteError();
  const message = String(error?.message ?? '');
  // After a deploy, old page chunks are gone: reload once to fetch the new version.
  if (CHUNK_ERROR.test(message)) {
    let reloaded = false;
    try {
      reloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
      if (!reloaded) sessionStorage.setItem(RELOAD_FLAG, '1');
    } catch {
      reloaded = true;
    }
    if (!reloaded) {
      window.location.reload();
      return null;
    }
  }
  console.error(error);
  return (
    <main className="page">
      <section className="card" role="alert">
        <h1>Etwas ist schiefgelaufen</h1>
        <p>Die Seite konnte nicht angezeigt werden. Lade sie neu oder geh zurück zur Watchlist.</p>
        <div className="actions">
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Seite neu laden
          </button>
          <Link to="/">Zur Watchlist</Link>
        </div>
      </section>
    </main>
  );
}
