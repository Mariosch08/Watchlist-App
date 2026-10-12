// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/auth/AuthContext.jsx', () => ({ useUser: () => ({ id: 'me' }) }));
vi.mock('../src/lib/api/friends.js', () => ({
  fetchFriends: vi.fn(),
  sendFriendRequest: vi.fn(),
  respondFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
  fetchActivity: vi.fn(),
  fetchReceivedRecommendations: vi.fn(),
  answerRecommendation: vi.fn(),
}));
vi.mock('../src/lib/api/profile.js', () => ({ fetchProfile: vi.fn() }));
vi.mock('../src/lib/api/settings.js', () => ({ fetchSettings: vi.fn() }));
vi.mock('../src/lib/api/watchlist.js', () => ({ fetchWatchlist: vi.fn(), addTitle: vi.fn() }));

const api = await import('../src/lib/api/friends.js');
const profileApi = await import('../src/lib/api/profile.js');
const settingsApi = await import('../src/lib/api/settings.js');
const watchlistApi = await import('../src/lib/api/watchlist.js');
const { ToastProvider } = await import('../src/components/toast/ToastProvider.jsx');
const { default: FriendsPage } = await import('../src/pages/Friends.jsx');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <FriendsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchFriends.mockResolvedValue([
    { user_id: 'cara', display_name: 'Cara', username: 'cara', status: 'pending', incoming: true },
    { user_id: 'ben', display_name: 'Ben', username: 'ben', status: 'accepted', incoming: false, common_rated: 12, match_percent: 87 },
  ]);
  api.fetchActivity.mockResolvedValue([]);
  api.fetchReceivedRecommendations.mockResolvedValue([
    { id: 'r1', from_user: 'ben', media_type: 'movie', tmdb_id: 603, title: 'Matrix', message: 'Musst du sehen!', poster_path: null, release_date: '1999-03-31' },
  ]);
  profileApi.fetchProfile.mockResolvedValue({ username: 'mario' });
  settingsApi.fetchSettings.mockResolvedValue({ share_activity: false });
  watchlistApi.fetchWatchlist.mockResolvedValue([]);
});

describe('FriendsPage', () => {
  it('shows requests, the taste match and my own handle', async () => {
    api.respondFriendRequest.mockResolvedValue(undefined);
    renderPage();
    const friends = await screen.findByRole('region', { name: 'Freunde' });
    expect(within(friends).getByText('87 %')).toBeInTheDocument();
    expect(within(friends).getByText(/12 gemeinsame Bewertungen/)).toBeInTheDocument();
    expect(await screen.findByText('@mario')).toBeInTheDocument();
    const requests = screen.getByRole('region', { name: 'Anfragen' });
    await userEvent.click(within(requests).getByRole('button', { name: 'Annehmen' }));
    expect(api.respondFriendRequest).toHaveBeenCalledWith('cara', true);
    expect(await screen.findByText('Du und Cara seid jetzt befreundet.')).toBeInTheDocument();
  });

  it('adds a recommended title to my watchlist', async () => {
    watchlistApi.addTitle.mockResolvedValue({ item: {}, existed: false });
    api.answerRecommendation.mockResolvedValue(undefined);
    renderPage();
    const recs = await screen.findByRole('region', { name: 'Von Freunden empfohlen' });
    expect(within(recs).getByText('Ben: „Musst du sehen!“')).toBeInTheDocument();
    await userEvent.click(within(recs).getByRole('button', { name: /Merken/ }));
    expect(watchlistApi.addTitle).toHaveBeenCalledWith(expect.objectContaining({ tmdb_id: 603 }));
    expect(api.answerRecommendation).toHaveBeenCalledWith('r1', 'added');
    expect(await screen.findByText('„Matrix“ gemerkt.')).toBeInTheDocument();
  });

  it('explains unknown user names', async () => {
    api.sendFriendRequest.mockRejectedValue({ message: 'USER_NOT_FOUND', code: 'P0001' });
    renderPage();
    await userEvent.type(await screen.findByLabelText('Benutzername oder E-Mail'), 'nobody');
    await userEvent.click(screen.getByRole('button', { name: 'Anfrage senden' }));
    expect(await screen.findByText('Niemand mit diesem Benutzernamen oder dieser E-Mail gefunden.')).toBeInTheDocument();
  });
});
