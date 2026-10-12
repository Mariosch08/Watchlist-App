import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export default function NotFoundPage() {
  useDocumentTitle('Seite nicht gefunden');
  return (
    <section className="card" aria-labelledby="notfound-title">
      <h1 id="notfound-title">Seite nicht gefunden</h1>
      <p>Diese Adresse gibt es nicht (mehr).</p>
      <p className="links">
        <Link to="/">Zur Watchlist</Link>
      </p>
    </section>
  );
}
