import {
  ArrowDownUp,
  Bell,
  CalendarDays,
  ChartColumn,
  CircleUser,
  Clapperboard,
  Disc3,
  Layers,
  MonitorPlay,
  NotebookPen,
  Sparkles,
  Users,
} from 'lucide-react';

// One icon per area: the sidebar, the tab bar and the page headings all use the same symbol.
export const AREA_ICON = {
  watchlist: Clapperboard,
  discover: Sparkles,
  diary: NotebookPen,
  lists: Layers,
  calendar: CalendarDays,
  streaming: MonitorPlay,
  music: Disc3,
  friends: Users,
  stats: ChartColumn,
  profile: CircleUser,
  import: ArrowDownUp,
  notifications: Bell,
};

const item = (area, to, label, extra = {}) => ({ area, to, label, icon: AREA_ICON[area], ...extra });

// Sidebar groups (desktop). `tab` marks the four areas that get their own slot in the phone tab bar.
export const NAV_GROUPS = [
  {
    label: 'Bibliothek',
    items: [
      item('watchlist', '/', 'Watchlist', { end: true, tab: 1 }),
      item('diary', '/diary', 'Tagebuch', { tab: 3 }),
      item('lists', '/lists', 'Listen', { tab: 4 }),
      item('calendar', '/calendar', 'Kalender'),
    ],
  },
  {
    label: 'Entdecken',
    items: [item('discover', '/discover', 'Für dich', { tab: 2 }), item('streaming', '/streaming', 'Streaming'), item('music', '/music', 'Musik')],
  },
  {
    label: 'Gemeinsam',
    items: [item('friends', '/friends', 'Freunde')],
  },
  {
    label: 'Ich',
    items: [item('stats', '/stats', 'Statistik'), item('profile', '/profile', 'Profil'), item('import', '/import', 'Import / Export')],
  },
];

const ALL = NAV_GROUPS.flatMap((g) => g.items);
export const TAB_ITEMS = ALL.filter((i) => i.tab).sort((a, b) => a.tab - b.tab);
export const MORE_ITEMS = ALL.filter((i) => !i.tab);

// The detail and sub pages that belong to an area (for the active state of the tab bar).
export function isInArea(pathname, nav) {
  if (nav.end) return pathname === nav.to;
  return pathname === nav.to || pathname.startsWith(`${nav.to}/`);
}
