import { NavLink, Outlet } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { signOut } from '../auth/session.js';

export default function Layout() {
  const user = useUser();
  return (
    <>
      <header className="topbar">
        <strong>🎬 Watchlist</strong>
        {user && (
          <nav>
            <NavLink to="/">Watchlist</NavLink>
            <NavLink to="/profile">Profil</NavLink>
            <button className="link" onClick={signOut}>
              Abmelden
            </button>
          </nav>
        )}
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
