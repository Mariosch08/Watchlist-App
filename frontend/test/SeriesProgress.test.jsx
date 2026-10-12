// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/auth/AuthContext.jsx', () => ({ useUser: () => ({ id: 'user-1' }) }));
vi.mock('../src/lib/api/series.js', () => ({
  fetchProgress: vi.fn(),
  fetchSeason: vi.fn(),
  fetchSeriesOverview: vi.fn(),
  startTracking: vi.fn(),
  markEpisodes: vi.fn(),
  unmarkEpisodes: vi.fn(),
  saveNextUp: vi.fn(),
}));
vi.mock('../src/lib/api/watchlist.js', () => ({ addTitle: vi.fn(), updateItem: vi.fn() }));
vi.mock('../src/lib/api/settings.js', () => ({ fetchSettings: vi.fn() }));

const series = await import('../src/lib/api/series.js');
const watchlist = await import('../src/lib/api/watchlist.js');
const settings = await import('../src/lib/api/settings.js');
const { ToastProvider } = await import('../src/components/toast/ToastProvider.jsx');
const { default: SeriesProgress } = await import('../src/components/series/SeriesProgress.jsx');

const details = {
  tmdb_id: 95396,
  media_type: 'tv',
  title: 'Severance',
  tmdb_status: 'Returning Series',
  seasons: [
    { season_number: 1, name: 'Staffel 1', episode_count: 3 },
    { season_number: 2, name: 'Staffel 2', episode_count: 3 },
  ],
  last_episode_to_air: { season_number: 2, episode_number: 2 },
  next_episode_to_air: { season_number: 2, episode_number: 3, air_date: '2099-01-01' },
};

function renderProgress() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['watchlist', 'user-1'], []);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <SeriesProgress details={details} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
  settings.fetchSettings.mockResolvedValue({ hide_spoilers: true });
  series.startTracking.mockResolvedValue();
  series.markEpisodes.mockResolvedValue();
  series.saveNextUp.mockResolvedValue();
  watchlist.addTitle.mockImplementation(async (d, { status }) => ({ item: { ...d, status }, existed: false }));
});

describe('SeriesProgress', () => {
  it('marks the next episode, starts tracking and adds the series as "Am Schauen"', async () => {
    series.fetchProgress.mockResolvedValue({ tracking: false, episodes: [] });
    renderProgress();
    expect(await screen.findByText('0 von 5 Folgen gesehen')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Als gesehen markieren' }));
    expect(await screen.findByText('1 von 5 Folgen gesehen')).toBeInTheDocument();
    await waitFor(() => expect(series.markEpisodes).toHaveBeenCalledWith(95396, [{ season_number: 1, episode_number: 1 }]));
    expect(series.startTracking).toHaveBeenCalled();
    expect(series.saveNextUp).toHaveBeenCalledWith(95396, { season_number: 1, episode_number: 2 });
    expect(watchlist.addTitle).toHaveBeenCalledWith(details, { status: 'watching' });
  });

  it('marks a whole season and only counts aired episodes', async () => {
    series.fetchProgress.mockResolvedValue({ tracking: true, episodes: [{ season_number: 1, episode_number: 1 }] });
    series.fetchSeason.mockResolvedValue({ season_number: 2, episodes: [] });
    renderProgress();
    await userEvent.click(await screen.findByText('Staffel 2'));
    await userEvent.click(await screen.findByRole('button', { name: 'Ganze Staffel als gesehen markieren' }));
    await waitFor(() =>
      expect(series.markEpisodes).toHaveBeenCalledWith(95396, [
        { season_number: 2, episode_number: 1 },
        { season_number: 2, episode_number: 2 },
      ]),
    );
    expect(await screen.findByText('3 von 5 Folgen gesehen')).toBeInTheDocument();
  });
});
