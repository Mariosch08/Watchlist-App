// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/auth/AuthContext.jsx', () => ({ useUser: () => ({ id: 'user-1' }) }));
vi.mock('../src/lib/api/settings.js', () => ({ fetchSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('../src/lib/api/discovery.js', () => ({ sendFeedback: vi.fn() }));
vi.mock('../src/lib/api/music.js', () => ({
  fetchMusicFeed: vi.fn(),
  fetchArtists: vi.fn(),
  fetchConcerts: vi.fn(),
  fetchSpotifyConnection: vi.fn(),
  fetchConcertLog: vi.fn(),
  fetchConcertBuddies: vi.fn(),
  logConcert: vi.fn(),
  unlogConcert: vi.fn(),
  refreshMusic: vi.fn(),
  disconnectSpotify: vi.fn(),
}));

const settingsApi = await import('../src/lib/api/settings.js');
const musicApi = await import('../src/lib/api/music.js');
const discoveryApi = await import('../src/lib/api/discovery.js');
const { ToastProvider } = await import('../src/components/toast/ToastProvider.jsx');
const { default: MusicPage } = await import('../src/pages/Music.jsx');

const ALBUM = {
  id: 'f1',
  type: 'album',
  external_id: '11111111-1111-4111-8111-111111111111',
  title: 'In Rainbows',
  subtitle: 'Radiohead',
  image_url: 'https://coverartarchive.org/release-group/1/front-250',
  release_date: '2026-10-08',
  reason: 'Neues Album von Radiohead – du hörst Radiohead oft',
  data: { artist: 'Radiohead', kind: 'Album', fresh: true, spotify_url: 'https://open.spotify.com/search/Radiohead%20In%20Rainbows' },
  status: 'new',
  created_at: '2026-10-12T05:00:00Z',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <MusicPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  musicApi.fetchMusicFeed.mockResolvedValue([]);
  musicApi.fetchArtists.mockResolvedValue([]);
  musicApi.fetchConcerts.mockResolvedValue([]);
  musicApi.fetchSpotifyConnection.mockResolvedValue(null);
  musicApi.fetchConcertLog.mockResolvedValue([]);
  musicApi.fetchConcertBuddies.mockResolvedValue([]);
});

describe('MusicPage', () => {
  it('asks for a Last.fm name, validates it and searches right after saving', async () => {
    settingsApi.fetchSettings.mockResolvedValue({ lastfm_username: null });
    settingsApi.updateSettings.mockResolvedValue({ lastfm_username: 'mario_08' });
    musicApi.refreshMusic.mockResolvedValue({ artists: 40, albums: 6, concerts: 2 });
    renderPage();
    const input = await screen.findByLabelText('Last.fm-Benutzername');
    const form = input.closest('form');
    await userEvent.type(input, '8bad');
    await userEvent.click(within(form).getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText(/beginnen mit einem Buchstaben/)).toBeInTheDocument();
    expect(settingsApi.updateSettings).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, 'mario_08');
    await userEvent.click(within(form).getByRole('button', { name: 'Speichern' }));
    expect(settingsApi.updateSettings).toHaveBeenCalledWith({ lastfm_username: 'mario_08' });
    expect(await screen.findByText('6 Neuerscheinungen und 2 Konzerte für 40 Artists gefunden.')).toBeInTheDocument();
    expect(musicApi.refreshMusic).toHaveBeenCalledTimes(1);
  });

  it('accepts a stats.fm profile link and saves just the name', async () => {
    settingsApi.fetchSettings.mockResolvedValue({ lastfm_username: null, statsfm_username: null });
    settingsApi.updateSettings.mockResolvedValue({ lastfm_username: null, statsfm_username: 'mario08' });
    musicApi.refreshMusic.mockResolvedValue({ artists: 50, albums: 3, concerts: 0 });
    renderPage();
    const input = await screen.findByLabelText('stats.fm-Profilname');
    await userEvent.type(input, 'https://stats.fm/mario08');
    await userEvent.click(within(input.closest('form')).getByRole('button', { name: 'Speichern' }));
    expect(settingsApi.updateSettings).toHaveBeenCalledWith({ statsfm_username: 'mario08' });
    expect(await screen.findByText('3 Neuerscheinungen für 50 Artists gefunden.')).toBeInTheDocument();
  });

  it('shows releases with reason and links, concerts and top artists; 👎 removes a release', async () => {
    settingsApi.fetchSettings.mockResolvedValue({ lastfm_username: 'mario_08' });
    musicApi.fetchMusicFeed.mockResolvedValue([ALBUM]);
    musicApi.fetchArtists.mockResolvedValue([{ artist_key: 'radiohead', name: 'Radiohead', sources: ['lastfm'], rank: 1, updated_at: '2026-10-12T05:00:00Z' }]);
    musicApi.fetchConcerts.mockResolvedValue([
      { event_id: 'tm1', artist: 'Radiohead', name: 'Radiohead – World Tour', venue: 'Hallenstadion', city: 'Zürich', local_date: '2027-03-01', url: 'https://www.ticketmaster.ch/e/1' },
    ]);
    discoveryApi.sendFeedback.mockResolvedValue({});
    renderPage();
    const releases = await screen.findByRole('region', { name: 'Neu erschienen für dich' });
    expect(within(releases).getByText('In Rainbows')).toBeInTheDocument();
    expect(within(releases).getByText('Neues Album von Radiohead – du hörst Radiohead oft')).toBeInTheDocument();
    expect(within(releases).getByRole('link', { name: 'Spotify' })).toHaveAttribute('href', ALBUM.data.spotify_url);
    const concerts = screen.getByRole('region', { name: 'Konzerte in der Schweiz' });
    expect(await within(concerts).findByText('Hallenstadion, Zürich')).toBeInTheDocument();
    expect(within(concerts).getByRole('link', { name: 'Tickets' })).toHaveAttribute('href', 'https://www.ticketmaster.ch/e/1');
    expect(screen.getByRole('region', { name: 'Dein Musikprofil' })).toHaveTextContent('Alle 1 Artists');
    expect(screen.queryByRole('region', { name: 'Demnächst' })).not.toBeInTheDocument();

    await userEvent.click(within(releases).getByRole('button', { name: 'In Rainbows von Radiohead: nicht mein Ding' }));
    expect(discoveryApi.sendFeedback).toHaveBeenCalledWith('f1', 'dislike');
    expect(within(releases).queryByText('In Rainbows')).not.toBeInTheDocument();
  });

  it('lists announced releases separately and explains the music profile', async () => {
    settingsApi.fetchSettings.mockResolvedValue({ lastfm_username: 'mario_08' });
    const soon = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    musicApi.fetchMusicFeed.mockResolvedValue([
      ALBUM,
      { ...ALBUM, id: 'f2', title: 'Next One', release_date: soon, reason: 'Neue Single von Tiny – Geheimtipp aus deiner Sammlung', data: { artist: 'Tiny', kind: 'Single', upcoming: true, small: true } },
    ]);
    const a = (name, extra) => ({ artist_key: name.toLowerCase(), name, sources: ['lastfm', 'statsfm'], rank: 1, affinity: 0.5, genres: [], loved: 0, niche: 0.1, updated_at: '2026-10-12T05:00:00Z', ...extra });
    musicApi.fetchArtists.mockResolvedValue([
      a('Radiohead', { affinity: 0.9, trend: 'core', genres: ['art rock'], loved: 3 }),
      a('Tiny', { rank: 2, trend: 'rising', niche: 0.8, listeners: 18000, genres: ['dream pop'] }),
      a('Muse', { rank: 3, trend: 'fading', genres: ['art rock'] }),
      a('Keane', { rank: 4, trend: 'steady' }),
      a('Coldplay', { rank: 5, trend: 'steady' }),
    ]);
    renderPage();
    const upcoming = await screen.findByRole('region', { name: 'Demnächst' });
    expect(within(upcoming).getByText('Next One')).toBeInTheDocument();
    expect(within(upcoming).getByText(/^erscheint /)).toBeInTheDocument();
    expect(within(upcoming).getByText('Geheimtipp')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Neu erschienen für dich' })).queryByText('Next One')).not.toBeInTheDocument();

    const profile = screen.getByRole('region', { name: 'Dein Musikprofil' });
    expect(within(profile).getByText('Artists ausgewertet').nextSibling).toHaveTextContent('5');
    expect(within(profile).getByText('Kleine Artists').nextSibling).toHaveTextContent('1');
    expect(within(profile).getByText('Lieblingssongs').nextSibling).toHaveTextContent('3');
    expect(within(profile).getByRole('group', { name: 'Dauerbrenner' })).toHaveTextContent('Radiohead');
    expect(within(profile).getByRole('group', { name: 'Im Kommen' })).toHaveTextContent('Tiny');
    expect(within(profile).getByRole('group', { name: 'Geheimtipps' })).toHaveTextContent('Tiny');
    expect(within(profile).getByRole('group', { name: 'Wiederentdecken' })).toHaveTextContent('Muse');
    expect(profile).toHaveTextContent('Aus Last.fm und stats.fm: letzte 4 Wochen, 6 Monate und alle Jahre, dazu deine Lieblingssongs.');
  });
});
