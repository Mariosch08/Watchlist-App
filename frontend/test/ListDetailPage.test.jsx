// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/auth/AuthContext.jsx', () => ({ useUser: () => ({ id: 'me' }) }));
vi.mock('../src/lib/api/friends.js', () => ({ fetchFriends: vi.fn() }));
vi.mock('../src/lib/api/watchlist.js', () => ({ fetchWatchlist: vi.fn(), addTitle: vi.fn(), updateItem: vi.fn(), removeItem: vi.fn(), restoreItem: vi.fn() }));
vi.mock('../src/lib/api/tmdb.js', () => ({ MIN_QUERY_LENGTH: 2, searchTitles: vi.fn(), fetchTitleDetails: vi.fn() }));
vi.mock('../src/lib/api/lists.js', async (orig) => {
  const real = await orig();
  return {
    listKeys: real.listKeys,
    fetchList: vi.fn(),
    fetchListPeople: vi.fn(),
    fetchListItems: vi.fn(),
    fetchNights: vi.fn(),
    addItems: vi.fn(),
    addMember: vi.fn(),
    castVote: vi.fn(),
    removeItem: vi.fn(),
    removeMember: vi.fn(),
    deleteList: vi.fn(),
    createNight: vi.fn(),
    setAvailability: vi.fn(),
    fixNight: vi.fn(),
    deleteNight: vi.fn(),
  };
});

const lists = await import('../src/lib/api/lists.js');
const friendsApi = await import('../src/lib/api/friends.js');
const watchlistApi = await import('../src/lib/api/watchlist.js');
const { ToastProvider } = await import('../src/components/toast/ToastProvider.jsx');
const { default: ListDetailPage } = await import('../src/pages/ListDetail.jsx');

const item = (tmdb_id, title) => ({ media_type: 'movie', tmdb_id, title, poster_path: null, release_date: '2020-01-01', added_at: `2026-10-0${tmdb_id}` });

function renderPage(path = '/lists/l1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/lists/:listId" element={<ListDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  lists.fetchList.mockResolvedValue({ id: 'l1', name: 'Filmabend', owner_id: 'me' });
  lists.fetchListPeople.mockResolvedValue([
    { user_id: 'me', display_name: 'Mario', role: 'owner' },
    { user_id: 'ben', display_name: 'Ben', role: 'editor' },
  ]);
  lists.fetchListItems.mockResolvedValue({
    items: [item(1, 'Alien'), item(2, 'Heat'), item(3, 'Up')],
    votes: [
      { media_type: 'movie', tmdb_id: 2, user_id: 'me', vote: 1 },
      { media_type: 'movie', tmdb_id: 2, user_id: 'ben', vote: 1 },
      { media_type: 'movie', tmdb_id: 3, user_id: 'ben', vote: -1 },
    ],
  });
  lists.fetchNights.mockResolvedValue([]);
  lists.castVote.mockResolvedValue(undefined);
  friendsApi.fetchFriends.mockResolvedValue([
    { user_id: 'ben', display_name: 'Ben', status: 'accepted' },
    { user_id: 'cara', display_name: 'Cara', status: 'accepted' },
  ]);
  watchlistApi.fetchWatchlist.mockResolvedValue([]);
});

describe('ListDetailPage', () => {
  it('ranks by votes, shows matches and picks tonight’s title without a veto', async () => {
    renderPage();
    const titles = await screen.findByRole('region', { name: 'Titel' });
    const rows = within(titles).getAllByRole('link').map((a) => a.textContent);
    expect(rows).toEqual(['Heat', 'Alien', 'Up']);
    expect(within(titles).getByText('Match')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Vorschlag' }));
    expect(within(screen.getByRole('region', { name: 'Was schauen wir?' })).getByRole('link', { name: 'Heat' })).toBeInTheDocument();
    // Only friends who are not members yet can be invited.
    const select = screen.getByLabelText('Freund:in einladen');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Auswählen …', 'Cara']);
  });

  it('votes optimistically and toggles a vote off again', async () => {
    renderPage();
    const titles = await screen.findByRole('region', { name: 'Titel' });
    const up = within(titles).getByRole('button', { name: 'Alien: dafür' });
    await userEvent.click(up);
    expect(lists.castVote).toHaveBeenLastCalledWith('l1', expect.objectContaining({ tmdb_id: 1 }), 1);
    expect(up).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(up);
    expect(lists.castVote).toHaveBeenLastCalledWith('l1', expect.objectContaining({ tmdb_id: 1 }), 0);
  });

  it('swipes through the titles I have not voted on, also with the arrow keys', async () => {
    renderPage('/lists/l1?ansicht=swipen');
    const deck = await screen.findByRole('region', { name: 'Swipen' });
    expect(within(deck).getByRole('link', { name: 'Alien' })).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(lists.castVote).toHaveBeenLastCalledWith('l1', expect.objectContaining({ tmdb_id: 1 }), 1);
    expect(await within(deck).findByRole('link', { name: 'Up' })).toBeInTheDocument();
    await userEvent.click(within(deck).getByRole('button', { name: 'Up: nein' }));
    expect(await within(deck).findByText(/alle Titel bewertet/)).toBeInTheDocument();
    expect(within(deck).getByRole('link', { name: 'Heat' })).toBeInTheDocument();
  });
});
