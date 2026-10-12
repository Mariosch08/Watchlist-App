// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/auth/AuthContext.jsx', () => ({ useUser: () => ({ id: 'user-1' }) }));
vi.mock('../src/lib/api/settings.js', () => ({ fetchSettings: vi.fn() }));
vi.mock('../src/lib/api/streaming.js', () => ({ scanAvailability: vi.fn(), fetchAlerts: vi.fn(), createAlert: vi.fn(), deleteAlert: vi.fn() }));

const settingsApi = await import('../src/lib/api/settings.js');
const streamingApi = await import('../src/lib/api/streaming.js');
const { ToastProvider } = await import('../src/components/toast/ToastProvider.jsx');
const { default: StreamingPage } = await import('../src/pages/Streaming.jsx');

const NETFLIX = { id: 8, name: 'Netflix', logo_path: null };
const DISNEY = { id: 337, name: 'Disney Plus', logo_path: null };
const SKY = { id: 1, name: 'Sky Show', logo_path: null };
const item = (tmdb_id, flatrate) => ({ media_type: 'movie', tmdb_id, title: `Film ${tmdb_id}`, poster_path: null, flatrate });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <StreamingPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  streamingApi.fetchAlerts.mockResolvedValue([]);
});

describe('StreamingPage', () => {
  it('shows coverage, the service worth adding and rarely used ones', async () => {
    settingsApi.fetchSettings.mockResolvedValue({ streaming_providers: [1] });
    streamingApi.scanAvailability.mockResolvedValue({
      items: [item(1, [DISNEY]), item(2, [DISNEY]), item(3, [DISNEY, NETFLIX]), item(4, [NETFLIX]), item(5, [SKY]), item(6, [])],
      limited: false,
      failed: 0,
    });
    renderPage();
    expect(await screen.findByText('1 / 6')).toBeInTheDocument();
    expect(screen.getByText('Lohnt sich diesen Monat: Disney Plus')).toBeInTheDocument();
    expect(screen.getByText('Kaum genutzt: Sky Show')).toBeInTheDocument();
    const providers = screen.getByRole('region', { name: 'Titel pro Dienst' });
    const disney = within(providers).getByRole('button', { name: /Disney Plus/ });
    await userEvent.click(disney);
    expect(disney).toHaveAttribute('aria-expanded', 'true');
    expect(within(providers).getByRole('link', { name: 'Film 3' })).toBeInTheDocument();
  });

  it('lists alerts and removes them', async () => {
    settingsApi.fetchSettings.mockResolvedValue({ streaming_providers: [] });
    streamingApi.scanAvailability.mockResolvedValue({ items: [], limited: false, failed: 0 });
    streamingApi.fetchAlerts.mockResolvedValue([{ media_type: 'tv', tmdb_id: 7, title: 'Severance', provider_ids: null, created_at: '2026-10-01', notified_at: null }]);
    streamingApi.deleteAlert.mockResolvedValue(undefined);
    renderPage();
    const alerts = await screen.findByRole('region', { name: 'Verfügbarkeits-Alarme' });
    expect(within(alerts).getByText('Wartet auf deine Dienste')).toBeInTheDocument();
    await userEvent.click(within(alerts).getByRole('button', { name: 'Entfernen' }));
    expect(streamingApi.deleteAlert.mock.calls[0][0]).toMatchObject({ media_type: 'tv', tmdb_id: 7 });
    expect(screen.queryByText('Severance')).not.toBeInTheDocument();
  });
});
