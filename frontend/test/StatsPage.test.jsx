// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/auth/AuthContext.jsx', () => ({ useUser: () => ({ id: 'me' }) }));
vi.mock('../src/lib/api/watchlist.js', () => ({ fetchWatchlist: vi.fn(), addTitle: vi.fn(), updateItem: vi.fn(), removeItem: vi.fn(), restoreItem: vi.fn() }));
vi.mock('../src/lib/api/diary.js', () => ({ fetchDiary: vi.fn(), diaryKeys: { all: (id) => ['diary', id] } }));
vi.mock('../src/lib/api/discovery.js', () => ({ fetchGenres: vi.fn() }));
vi.mock('../src/lib/api/music.js', () => ({ fetchArtists: vi.fn(), fetchMusicStats: vi.fn() }));
vi.mock('../src/lib/api/profile.js', () => ({ fetchProfile: vi.fn() }));
vi.mock('../src/lib/api/tmdb.js', () => ({ fetchTopRated: vi.fn() }));

const watchlistApi = await import('../src/lib/api/watchlist.js');
const diaryApi = await import('../src/lib/api/diary.js');
const discovery = await import('../src/lib/api/discovery.js');
const music = await import('../src/lib/api/music.js');
const profile = await import('../src/lib/api/profile.js');
const tmdb = await import('../src/lib/api/tmdb.js');
const { ToastProvider } = await import('../src/components/toast/ToastProvider.jsx');
const { default: StatsPage } = await import('../src/pages/Stats.jsx');

const year = new Date().getFullYear();
const movie = (tmdb_id, month, rating, extra = {}) => ({
  media_type: 'movie',
  tmdb_id,
  title: `Film ${tmdb_id}`,
  status: 'completed',
  my_rating: rating,
  watched_at: `${year}-${String(month).padStart(2, '0')}-10T20:00:00Z`,
  release_date: '1999-01-01',
  genre_ids: [18],
  runtime: 120,
  ...extra,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <StatsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  watchlistApi.fetchWatchlist.mockResolvedValue([movie(1, 1, 9), movie(2, 1, 7), movie(3, 2, 10), movie(4, 3, null, { watched_at: `${year - 1}-05-01T20:00:00Z` })]);
  diaryApi.fetchDiary.mockResolvedValue([{ media_type: 'movie', tmdb_id: 3, title: 'Film 3', watched_on: `${year}-02-10`, place: 'cinema', rating: 10, rewatch: false }]);
  discovery.fetchGenres.mockResolvedValue({ movie: [{ id: 18, name: 'Drama' }], tv: [] });
  music.fetchArtists.mockResolvedValue([{ artist_key: 'radiohead', name: 'Radiohead', rank: 1, playcount: 812 }]);
  music.fetchMusicStats.mockResolvedValue({ streams: 5321, minutes: 20576, artists: 310 });
  profile.fetchProfile.mockResolvedValue({ display_name: 'Mario' });
  tmdb.fetchTopRated.mockResolvedValue([{ tmdb_id: 3 }, { tmdb_id: 99 }]);
});

describe('StatsPage', () => {
  it('shows the year at a glance, genres, favourites, challenges and music', async () => {
    renderPage();
    const review = await screen.findByRole('region', { name: `Mein Filmjahr ${year}` });
    expect(within(review).getByText('Titel gesehen').nextSibling).toHaveTextContent('3');
    expect(within(review).getByText('Im Kino').nextSibling).toHaveTextContent('1');
    expect(within(review).getByText('Stärkster Monat: Januar.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Genres' })).getByText('Drama')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: `Lieblinge ${year}` })).getAllByRole('link')[0]).toHaveTextContent('Film 3');
    const top = await screen.findByRole('progressbar', { name: 'TMDb Top 100' });
    expect(top).toHaveAttribute('aria-valuenow', '1');
    const musicStats = screen.getByRole('region', { name: 'Musik: meistgehört' });
    expect(musicStats).toHaveTextContent('Radiohead');
    expect(await within(musicStats).findByText('343')).toBeInTheDocument(); // 20576 min ≈ 343 h
    expect(within(musicStats).getByText(/812 Streams/)).toBeInTheDocument();
  });

  it('switches to an earlier year', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: String(year - 1) }));
    const review = screen.getByRole('region', { name: `Mein Filmjahr ${year - 1}` });
    expect(within(review).getByText('Titel gesehen').nextSibling).toHaveTextContent('1');
  });
});
