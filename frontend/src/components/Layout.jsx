import { useQuery } from '@tanstack/react-query';
import { Bell, Clapperboard, Ellipsis, LoaderCircle, LogOut, Monitor, Moon, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { useImportRunner } from '../hooks/useImportRunner.js';
import { signOutHere } from '../lib/api/auth.js';
import { fetchNotifications } from '../lib/api/notifications.js';
import { queryKeys } from '../lib/queryClient.js';
import { THEME_LABEL, THEMES, useTheme } from '../lib/theme.js';
import { isInArea, MORE_ITEMS, NAV_GROUPS, TAB_ITEMS } from './navigation.js';

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Watchlist – Startseite">
      <span className="brand-mark" aria-hidden="true">
        <Clapperboard size={18} />
      </span>
      <span className="brand-name" aria-hidden="true">
        Watchlist
      </span>
    </Link>
  );
}

function ImportChip() {
  const { job, running } = useImportRunner();
  if (!running || !job) return null;
  return (
    <Link to="/import" className="import-chip" title="Import läuft" aria-label={`Import läuft: ${job.processed} von ${job.total}`}>
      <LoaderCircle size={14} aria-hidden="true" className="spin" />
      <span>
        Import <span className="mono">{job.processed}/{job.total}</span>
      </span>
    </Link>
  );
}

function useUnread(userId) {
  const list = useQuery({ queryKey: queryKeys.notifications(userId), queryFn: fetchNotifications, refetchInterval: 5 * 60_000 });
  return (list.data ?? []).filter((n) => !n.read_at).length;
}

function NotificationLink({ userId, withLabel = false }) {
  const unread = useUnread(userId);
  const label = unread ? `Mitteilungen (${unread} neu)` : 'Mitteilungen';
  const count = unread > 9 ? '9+' : unread;
  if (withLabel) {
    return (
      <NavLink to="/notifications" className="nav-item" title={label}>
        <Bell size={18} aria-hidden="true" />
        <span className="nav-label">Mitteilungen</span>
        {unread > 0 && (
          <span className="nav-count">
            {count}
            <span className="visually-hidden"> neu</span>
          </span>
        )}
      </NavLink>
    );
  }
  return (
    <NavLink to="/notifications" className="icon-link" aria-label={label} title={label}>
      <Bell size={20} aria-hidden="true" />
      {unread > 0 && <span className="nav-dot">{count}</span>}
    </NavLink>
  );
}

function ThemeCycle() {
  const { theme, cycle } = useTheme();
  const Icon = THEME_ICON[theme];
  const label = `Design: ${THEME_LABEL[theme]}`;
  return (
    <button type="button" className="nav-item" onClick={cycle} title={`${label} (wechseln)`} aria-label={`${label}, wechseln`}>
      <Icon size={18} aria-hidden="true" />
      <span className="nav-label">{label}</span>
    </button>
  );
}

function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="segmented segmented--fill" role="group" aria-label="Design">
      {THEMES.map((t) => {
        const Icon = THEME_ICON[t];
        return (
          <button key={t} type="button" className="segment" aria-pressed={theme === t} onClick={() => setTheme(t)}>
            <Icon size={16} aria-hidden="true" />
            {THEME_LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}

function SignOutButton({ className }) {
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    try {
      await signOutHere();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={className} onClick={logout} disabled={busy} title="Abmelden">
      <LogOut size={18} aria-hidden="true" />
      <span className="nav-label">{busy ? 'Abmelden …' : 'Abmelden'}</span>
    </button>
  );
}

function NavItem({ nav }) {
  const Icon = nav.icon;
  return (
    <NavLink to={nav.to} end={nav.end} className="nav-item" title={nav.label}>
      <Icon size={18} aria-hidden="true" />
      <span className="nav-label">{nav.label}</span>
    </NavLink>
  );
}

// Desktop: full sidebar; tablets: the same sidebar as a slim icon rail.
function Sidebar({ userId }) {
  return (
    <aside className="sidebar">
      <Brand />
      <nav className="sidebar-nav" aria-label="Hauptnavigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="nav-group" role="group" aria-label={group.label}>
            <span className="nav-group-label" aria-hidden="true">
              {group.label}
            </span>
            {group.items.map((nav) => (
              <NavItem key={nav.to} nav={nav} />
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <ImportChip />
        <NotificationLink userId={userId} withLabel />
        <ThemeCycle />
        <SignOutButton className="nav-item" />
      </div>
    </aside>
  );
}

// Phones: everything that has no tab of its own, as a bottom sheet.
function MoreSheet({ open, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby="more-title" onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet-body">
        <div className="sheet-head">
          <h2 id="more-title">Alle Bereiche</h2>
          <button type="button" className="btn-ghost btn-icon" aria-label="Schliessen" title="Schliessen" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav className="tile-grid" aria-label="Weitere Bereiche">
          {MORE_ITEMS.map((nav) => {
            const Icon = nav.icon;
            return (
              <NavLink key={nav.to} to={nav.to} className="tile" onClick={onClose}>
                <Icon size={22} aria-hidden="true" />
                <span>{nav.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sheet-section">
          <span className="eyebrow">Design</span>
          <ThemeChoice />
        </div>
        <SignOutButton className="btn-ghost sheet-signout" />
      </div>
    </dialog>
  );
}

function TabBar({ onMore, moreOpen }) {
  const { pathname } = useLocation();
  const inMore = MORE_ITEMS.some((nav) => isInArea(pathname, nav)) || pathname === '/notifications';
  return (
    <nav className="tabbar" aria-label="Schnellnavigation">
      {TAB_ITEMS.map((nav) => {
        const Icon = nav.icon;
        return (
          <NavLink key={nav.to} to={nav.to} end={nav.end} className="tab">
            <span className="tab-icon">
              <Icon size={20} aria-hidden="true" />
            </span>
            <span className="tab-label">{nav.label}</span>
          </NavLink>
        );
      })}
      <button type="button" className={inMore ? 'tab active' : 'tab'} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={onMore}>
        <span className="tab-icon">
          <Ellipsis size={20} aria-hidden="true" />
        </span>
        <span className="tab-label">Mehr</span>
      </button>
    </nav>
  );
}

export default function Layout() {
  const user = useUser();
  const location = useLocation();
  const first = useRef(true);
  const { running } = useImportRunner();
  const [moreOpen, setMoreOpen] = useState(false);

  // After navigating (not on first load), move focus to the page heading for screen readers.
  useEffect(() => {
    setMoreOpen(false);
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

  if (!user) {
    return (
      <div className="auth-shell">
        <header className="auth-head">
          <Brand />
        </header>
        <main id="main" className="page page--auth">
          <Outlet />
        </main>
        <ScrollRestoration getKey={(loc) => loc.pathname} />
      </div>
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Zum Inhalt springen
      </a>
      <Sidebar userId={user.id} />
      <header className="appbar">
        <Brand />
        <div className="appbar-tools">
          <ImportChip />
          <NotificationLink userId={user.id} />
        </div>
      </header>
      <main id="main" className="page">
        <Outlet />
      </main>
      <TabBar moreOpen={moreOpen} onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <ScrollRestoration getKey={(loc) => loc.pathname} />
    </div>
  );
}
