import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { useImportRunner } from '../hooks/useImportRunner.js';
import { signOutHere } from '../lib/api/auth.js';
import { fetchNotifications } from '../lib/api/notifications.js';
import { queryKeys } from '../lib/queryClient.js';

function ImportChip() {
  const { job, running } = useImportRunner();
  if (!running || !job) return null;
  return (
    <Link to="/import" className="badge badge--accent nav-chip" title="Import läuft">
      Import {job.processed}/{job.total}
    </Link>
  );
}

function NotificationBell({ userId }) {
  const list = useQuery({ queryKey: queryKeys.notifications(userId), queryFn: fetchNotifications, refetchInterval: 5 * 60_000 });
  const unread = (list.data ?? []).filter((n) => !n.read_at).length;
  const label = unread ? `Benachrichtigungen (${unread} neu)` : 'Benachrichtigungen';
  return (
    <NavLink to="/notifications" className="nav-icon" aria-label={label} title={label}>
      <Bell size={16} aria-hidden="true" />
      {unread > 0 && <span className="nav-dot">{unread > 9 ? '9+' : unread}</span>}
    </NavLink>
  );
}

export default function Layout() {
  const user = useUser();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const first = useRef(true);
  const { running } = useImportRunner();

  // After navigating (not on first load), move focus to the page heading for screen readers.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.querySelector('main h1')?.focus({ preventScroll: true });
  }, [location.pathname]);

  // Warn before closing the tab while an import is running.
  useEffect(() => {
    if (!running) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const logout = async () => {
    setSigningOut(true);
    try {
      await signOutHere();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <header className="topbar">
        <Link to="/" className="wordmark">
          Watchlist
        </Link>
        {user && (
          <nav className="nav" aria-label="Hauptnavigation">
            <ImportChip />
            <NavLink to="/" end>
              Watchlist
            </NavLink>
            <NavLink to="/discover">Für dich</NavLink>
            <NavLink to="/calendar">Kalender</NavLink>
            <NavLink to="/import">Import</NavLink>
            <NavLink to="/profile">Profil</NavLink>
            <NotificationBell userId={user.id} />
            <button className="btn-ghost btn-compact" onClick={logout} disabled={signingOut} aria-label="Abmelden" title="Abmelden">
              <LogOut size={16} aria-hidden="true" />
              <span className="nav-label">{signingOut ? 'Abmelden …' : 'Abmelden'}</span>
            </button>
          </nav>
        )}
      </header>
      <main className="page">
        <Outlet />
      </main>
      <ScrollRestoration getKey={(loc) => loc.pathname} />
    </>
  );
}
