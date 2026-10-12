// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/lib/errors.js';

vi.mock('../src/auth/AuthContext.jsx', () => ({ useUser: () => ({ id: 'user-1' }) }));
vi.mock('../src/lib/api/watchlist.js', () => ({
  fetchWatchlist: vi.fn(),
  addTitle: vi.fn(),
  updateItem: vi.fn(),
  removeItem: vi.fn(),
  restoreItem: vi.fn(),
}));
vi.mock('../src/lib/api/tmdb.js', () => ({ MIN_QUERY_LENGTH: 2, searchTitles: vi.fn(), fetchTitleDetails: vi.fn() }));
vi.mock('../src/lib/api/settings.js', () => ({ fetchSettings: vi.fn() }));
vi.mock('../src/lib/api/streaming.js', () => ({ fetchAlerts: vi.fn(), createAlert: vi.fn(), deleteAlert: vi.fn() }));

const api = await import('../src/lib/api/watchlist.js');
const tmdb = await import('../src/lib/api/tmdb.js');
const settingsApi = await import('../src/lib/api/settings.js');
const streamingApi = await import('../src/lib/api/streaming.js');
const { ToastProvider } = await import('../src/components/toast/ToastProvider.jsx');
const { default: TitleDetailsPage } = await import('../src/pages/TitleDetails.jsx');

const DETAILS = {
  tmdb_id: 438631,
  media_type: 'movie',
  title: 'Dune',
  original_title: 'Dune',
  poster_path: '/p.jpg',
  backdrop_path: '/b.jpg',
  release_date: '2021-09-15',
  vote_average: 7.8,
  vote_count: 12000,
  overview: 'Paul Atreides reist nach Arrakis.',
  tagline: null,
  genres: ['Science-Fiction', 'Abenteuer'],
  runtime: 155,
  number_of_seasons: null,
  number_of_episodes: null,
  imdb_id: 'tt1160419',
  cast: [{ id: 1, name: 'Timothée Chalamet', character: 'Paul Atreides', profile_path: null }],
  crew: [{ job: 'Regie', names: ['Denis Villeneuve'] }],
  trailer: { key: 'abcDEF12345', name: 'Trailer', language: 'de' },
  providers: { link: 'https://www.themoviedb.org/movie/438631/watch?locale=CH', flatrate: [{ id: 8, name: 'Netflix', logo_path: '/n.png' }], rent: [], buy: [{ id: 2, name: 'Apple TV', logo_path: null }] },
  similar: [
    { tmdb_id: 693134, media_type: 'movie', title: 'Dune: Part Two', release_date: '2024-02-27', poster_path: null },
    { tmdb_id: 95396, media_type: 'tv', title: 'Severance', release_date: '2022-02-17', poster_path: null },
  ],
};

function renderPage(path = '/title/movie/438631') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/title/:mediaType/:tmdbId" element={<TitleDetailsPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  settingsApi.fetchSettings.mockResolvedValue({ streaming_providers: [] });
  streamingApi.fetchAlerts.mockResolvedValue([]);
});

describe('TitleDetailsPage', () => {
  it('shows details, streaming, cast and similar titles', async () => {
    tmdb.fetchTitleDetails.mockResolvedValue(DETAILS);
    api.fetchWatchlist.mockResolvedValue([{ media_type: 'tv', tmdb_id: 95396, title: 'Severance', status: 'watching' }]);
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Dune' })).toBeInTheDocument();
    expect(tmdb.fetchTitleDetails).toHaveBeenCalledWith('movie', '438631');
    expect(screen.getByText('2 Std. 35 Min.')).toBeInTheDocument();
    expect(screen.getByText('Paul Atreides reist nach Arrakis.')).toBeInTheDocument();
    const streaming = screen.getByRole('region', { name: 'Streaming in der Schweiz' });
    expect(within(streaming).getByText('Netflix')).toBeInTheDocument();
    expect(within(streaming).getByText('Kaufen')).toBeInTheDocument();
    expect(within(streaming).queryByText('Leihen')).not.toBeInTheDocument();
    expect(screen.getByText('Denis Villeneuve')).toBeInTheDocument();
    const similar = screen.getByRole('region', { name: 'Ähnliche Titel' });
    expect(within(similar).getByRole('link', { name: /Dune: Part Two/ })).toHaveAttribute('href', '/title/movie/693134');
    expect(await within(similar).findByRole('link', { name: /Severance.*In deiner Liste:\s*Am Schauen/ })).toBeInTheDocument();
  });

  it('loads the trailer only after pressing play', async () => {
    tmdb.fetchTitleDetails.mockResolvedValue(DETAILS);
    api.fetchWatchlist.mockResolvedValue([]);
    const { container } = renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Trailer abspielen' }));
    const frame = container.querySelector('iframe');
    expect(frame.src).toContain('https://www.youtube-nocookie.com/embed/abcDEF12345');
  });

  it('adds the title to the watchlist, or shows status controls if it is listed', async () => {
    tmdb.fetchTitleDetails.mockResolvedValue(DETAILS);
    api.fetchWatchlist.mockResolvedValue([]);
    api.addTitle.mockResolvedValue({ item: { media_type: 'movie', tmdb_id: 438631, title: 'Dune', status: 'planned', my_rating: null }, existed: false });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Merken' }));
    expect(api.addTitle).toHaveBeenCalledWith(DETAILS, { status: 'planned' });
    // The cached list now has the title, so status and rating controls replace the buttons.
    expect(await screen.findByLabelText('Status')).toHaveValue('planned');
    expect(screen.queryByRole('button', { name: 'Merken' })).not.toBeInTheDocument();
  });

  it('explains unknown titles and invalid addresses', async () => {
    tmdb.fetchTitleDetails.mockRejectedValue(new AppError('Diesen Titel gibt es auf TMDb nicht (mehr).', { code: 'NOT_FOUND', status: 404 }));
    api.fetchWatchlist.mockResolvedValue([]);
    renderPage('/title/movie/999');
    expect(await screen.findByRole('heading', { name: 'Titel nicht gefunden' })).toBeInTheDocument();
    expect(screen.getByText('Diesen Titel gibt es auf TMDb nicht (mehr).')).toBeInTheDocument();
  });

  it('does not call TMDb for invalid addresses', async () => {
    renderPage('/title/book/abc');
    expect(await screen.findByRole('heading', { name: 'Titel nicht gefunden' })).toBeInTheDocument();
    expect(tmdb.fetchTitleDetails).not.toHaveBeenCalled();
  });

  it('confirms availability on my services or offers an alert', async () => {
    tmdb.fetchTitleDetails.mockResolvedValue(DETAILS);
    api.fetchWatchlist.mockResolvedValue([]);
    settingsApi.fetchSettings.mockResolvedValue({ streaming_providers: [8] });
    renderPage();
    expect(await screen.findByText('Mit deinen Abos verfügbar: Netflix.')).toBeInTheDocument();
  });

  it('creates an availability alert when the title is not on my services', async () => {
    tmdb.fetchTitleDetails.mockResolvedValue(DETAILS);
    api.fetchWatchlist.mockResolvedValue([]);
    settingsApi.fetchSettings.mockResolvedValue({ streaming_providers: [337] });
    streamingApi.createAlert.mockResolvedValue(undefined);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Benachrichtigen, wenn auf meinen Diensten' }));
    expect(streamingApi.createAlert.mock.calls[0][0]).toEqual({ media_type: 'movie', tmdb_id: 438631, title: 'Dune' });
    expect(await screen.findByText(/sobald „Dune“ auf deinen Streaming-Diensten ist/)).toBeInTheDocument();
  });
});
