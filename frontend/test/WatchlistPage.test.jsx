// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/auth/AuthContext.jsx', () => ({ useUser: () => ({ id: 'user-1' }) }));
vi.mock('../src/lib/api/watchlist.js', () => ({
  fetchWatchlist: vi.fn(),
  addTitle: vi.fn(),
  updateItem: vi.fn(),
  removeItem: vi.fn(),
  restoreItem: vi.fn(),
}));
vi.mock('../src/lib/api/tmdb.js', () => ({ MIN_QUERY_LENGTH: 2, searchTitles: vi.fn() }));

const api = await import('../src/lib/api/watchlist.js');
const tmdb = await import('../src/lib/api/tmdb.js');
const { ToastProvider } = await import('../src/components/toast/ToastProvider.jsx');
const { default: WatchlistPage } = await import('../src/pages/Watchlist.jsx');

const row = (over) => ({
  media_type: 'movie',
  tmdb_id: 1,
  title: 'Dune',
  original_title: 'Dune',
  status: 'planned',
  my_rating: null,
  rated_at: null,
  watched_at: null,
  added_at: '2026-10-01T00:00:00Z',
  ...over,
});
const LIST = [row(), row({ tmdb_id: 2, media_type: 'tv', title: 'Severance', original_title: 'Severance', status: 'watching', added_at: '2026-09-01T00:00:00Z' })];

function renderPage(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <WatchlistPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.resetAllMocks());

describe('WatchlistPage', () => {
  it('shows a load error with retry instead of an endless skeleton', async () => {
    api.fetchWatchlist.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce(LIST);
    renderPage();
    expect(await screen.findByText(/konnte nicht geladen werden/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Erneut laden' }));
    expect(await screen.findByText('Dune')).toBeInTheDocument();
  });

  it('shows counts per tab and watching titles first', async () => {
    api.fetchWatchlist.mockResolvedValue(LIST);
    renderPage();
    const tab = await screen.findByRole('button', { name: /Als Nächstes/ });
    expect(tab).toHaveTextContent('2');
    const names = screen.getAllByText(/Dune|Severance/).map((n) => n.textContent);
    expect(names).toEqual(['Severance', 'Dune']);
  });

  it('updates status optimistically without blocking other rows, and rolls back on error', async () => {
    api.fetchWatchlist.mockResolvedValue(LIST);
    let reject;
    api.updateItem.mockImplementation(() => new Promise((_, r) => (reject = r)));
    renderPage('/?s=all');
    const select = await screen.findByLabelText('Status von Dune');
    await userEvent.selectOptions(select, 'completed');
    expect(screen.getByLabelText('Status von Dune')).toHaveValue('completed');
    // The other row stays usable while the first one saves.
    expect(screen.getByLabelText('Status von Severance')).not.toBeDisabled();
    reject(new Error('Failed to fetch'));
    await waitFor(() => expect(screen.getByLabelText('Status von Dune')).toHaveValue('planned'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/konnte nicht gespeichert werden/);
  });

  it('removes a title and restores it with undo', async () => {
    api.fetchWatchlist.mockResolvedValue(LIST);
    api.removeItem.mockResolvedValue(undefined);
    api.restoreItem.mockImplementation(async (snapshot) => snapshot);
    renderPage();
    const dune = (await screen.findByText('Dune')).closest('li');
    await userEvent.click(within(dune).getByRole('button', { name: 'Entfernen' }));
    expect(screen.queryByText('Dune')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
    expect(await screen.findByText('Dune')).toBeInTheDocument();
    expect(api.restoreItem).toHaveBeenCalledWith(expect.objectContaining({ tmdb_id: 1, title: 'Dune' }));
  });

  it('filters the own list and searches TMDb with the same field', async () => {
    api.fetchWatchlist.mockResolvedValue(LIST);
    tmdb.searchTitles.mockResolvedValue({
      page: 1,
      total_pages: 1,
      results: [{ media_type: 'tv', tmdb_id: 2, title: 'Severance' }, { media_type: 'movie', tmdb_id: 9, title: 'Seven' }],
    });
    renderPage();
    await screen.findByText('Dune');
    await userEvent.type(screen.getByRole('searchbox'), 'sev');
    expect(screen.queryByText('Dune')).not.toBeInTheDocument();
    expect(await screen.findByText('Seven')).toBeInTheDocument();
    expect(await screen.findByText(/In deiner Liste · Am Schauen/)).toBeInTheDocument();
    expect(tmdb.searchTitles).toHaveBeenCalledWith('sev', 1);
  });
});
