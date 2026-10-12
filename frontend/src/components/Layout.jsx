import { Link, NavLink, Outlet } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

export default function Layout() {
  const user = useUser();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="wordmark">
          Watchlist
        </Link>
        {user && (
          <nav className="nav">
            <NavLink to="/" end>
              Watchlist
            </NavLink>
            <NavLink to="/import">Import</NavLink>
            <NavLink to="/profile">Profil</NavLink>
            <button className="link" onClick={() => supabase.auth.signOut()}>
              Abmelden
            </button>
          </nav>
        )}
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
