// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/auth/AuthContext.jsx', () => ({ useUser: () => ({ id: 'me' }) }));
vi.mock('../src/lib/api/watchlist.js', () => ({ fetchWatchlist: vi.fn(), addTitle: vi.fn(), updateItem: vi.fn(), removeItem: vi.fn(), restoreItem: vi.fn() }));
vi.mock('../src/lib/api/diary.js', () => ({ fetchDiary: vi.fn(), diaryKeys: { all: (id) => ['diary', id] } }));
vi.mock('../src/lib/api/series.js', () => ({ fetchSeriesOverview: vi.fn(), fetchEpisodesBetween: vi.fn(), fetchCatchups: vi.fn(), dismissCatchup: vi.fn() }));
vi.mock('../src/lib/api/music.js', () => ({ fetchConcertLog: vi.fn(), fetchMusicDays: vi.fn(), fetchConcerts: vi.fn(), fetchMusicFeed: vi.fn() }));
vi.mock('../src/lib/api/streaming.js', () => ({ fetchRotationPlan: vi.fn() }));
vi.mock('../src/lib/api/settings.js', () => ({ fetchSettings: vi.fn(), regenerateCalendarToken: vi.fn(), calendarUrl: () => 'x', webcalUrl: () => 'y' }));

const api = {
  watchlist: await import('../src/lib/api/watchlist.js'),
  diary: await import('../src/lib/api/diary.js'),
  series: await import('../src/lib/api/series.js'),
  music: await import('../src/lib/api/music.js'),
  streaming: await import('../src/lib/api/streaming.js'),
  settings: await import('../src/lib/api/settings.js'),
};
const { ToastProvider } = await import('../src/components/toast/ToastProvider.jsx');
const { default: CalendarPage } = await import('../src/pages/Calendar.jsx');

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
const month = today.slice(0, 7);
const day = `${month}-03`;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/calendar']}>
          <CalendarPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.watchlist.fetchWatchlist.mockResolvedValue([]);
  api.diary.fetchDiary.mockResolvedValue([]);
  api.series.fetchSeriesOverview.mockResolvedValue([]);
  api.series.fetchEpisodesBetween.mockResolvedValue([]);
  api.series.fetchCatchups.mockResolvedValue([]);
  api.music.fetchConcertLog.mockResolvedValue([]);
  api.music.fetchMusicDays.mockResolvedValue([]);
  api.music.fetchConcerts.mockResolvedValue([]);
  api.music.fetchMusicFeed.mockResolvedValue([]);
  api.streaming.fetchRotationPlan.mockResolvedValue(null);
  api.settings.fetchSettings.mockResolvedValue({ calendar_token: 't' });
});

describe('CalendarPage', () => {
  it('always shows the month, even without any data', async () => {
    renderPage();
    expect(await screen.findByRole('grid')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell').length).toBeGreaterThanOrEqual(28);
    expect(screen.getByRole('button', { name: 'Vorheriger Monat' })).toBeInTheDocument();
  });

  it('shows what was watched and heard on a day, and a line per week', async () => {
    api.diary.fetchDiary.mockResolvedValue([{ media_type: 'movie', tmdb_id: 1, title: 'Past Lives', watched_on: day, rating: 9 }]);
    api.music.fetchMusicDays.mockResolvedValue([{ day, plays: 60, minutes: 210, minutes_estimated: false, top_artist: 'Phoebe Bridgers', top_artist_plays: 20 }]);
    renderPage();
    const cell = await screen.findByRole('gridcell', { name: /3\. .*1 geschaut.*3 h 30 min Musik.*Top-Artist Phoebe Bridgers/ });
    expect(within(cell).getByText('4 h')).toBeInTheDocument();
    expect(screen.getByText(/Musik · Top: Phoebe Bridgers · 1 Titel/)).toBeInTheDocument();
    await userEvent.click(cell);
    expect(screen.getByRole('link', { name: 'Past Lives' })).toHaveAttribute('href', '/title/movie/1');
    expect(screen.getByText('Phoebe Bridgers', { selector: 'strong' })).toBeInTheDocument();
  });
});
