import { LogOut } from 'lucide-react';
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
          <nav className="nav" aria-label="Hauptnavigation">
            <NavLink to="/" end>
              Watchlist
            </NavLink>
            <NavLink to="/import">Import</NavLink>
            <NavLink to="/profile">Profil</NavLink>
            <button className="btn-ghost btn-compact" onClick={() => supabase.auth.signOut()} aria-label="Abmelden" title="Abmelden">
              <LogOut size={16} aria-hidden="true" />
              <span className="nav-label">Abmelden</span>
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
