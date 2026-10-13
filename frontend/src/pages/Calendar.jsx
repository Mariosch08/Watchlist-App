import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { CardSkeleton } from '../components/Skeleton.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { KIND_LABEL } from '../../../supabase/functions/_shared/agenda.ts';
import MonthCalendar from '../components/calendar/MonthCalendar.jsx';
import { CatchUpList } from '../components/series/CatchUp.jsx';
import { useAgenda } from '../hooks/useAgenda.js';
import { calendarUrl, fetchSettings, regenerateCalendarToken, webcalUrl } from '../lib/api/settings.js';
import { errorMessage } from '../lib/errors.js';
import { queryKeys } from '../lib/queryClient.js';

const DAYS = 30;
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });

function Subscribe() {
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: queryKeys.settings(user.id), queryFn: fetchSettings });
  const regenerate = useMutation({
    mutationFn: regenerateCalendarToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings(user.id) });
      toast.success('Neuer Kalender-Link erstellt. Der alte funktioniert nicht mehr.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const token = settings.data?.calendar_token;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(calendarUrl(token));
      toast.success('Kalender-Link kopiert.');
    } catch {
      toast.error('Kopieren nicht möglich.');
    }
  };
  return (
    <section className="card" aria-labelledby="subscribe-title">
      <h2 id="subscribe-title">
        Im eigenen Kalender abonnieren
      </h2>
      <p className="muted">
        Alles von dieser Seite – neue Folgen, Filmstarts, Konzerte, Alben, Aufhol-Termine und Abo-Erinnerungen – erscheint automatisch in Google
        Kalender, Apple Kalender oder Outlook. Der Link ist privat – teile ihn nicht.
      </p>
      {settings.isError && <Messages error={errorMessage(settings.error)} />}
      {token && (
        <div className="actions">
          <a className="button-link btn-primary" href={webcalUrl(token)}>
            <CalendarPlus size={16} aria-hidden="true" /> Kalender abonnieren
          </a>
          <button onClick={copy}>
            <Copy size={16} aria-hidden="true" /> Link kopieren
          </button>
          <button className="btn-ghost" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
            Neuen Link erstellen
          </button>
        </div>
      )}
      <p className="caption">Google Kalender: „Weitere Kalender“ → „Per URL“ → kopierten Link einfügen.</p>
    </section>
  );
}

export default function CalendarPage() {
  useDocumentTitle('Kalender');
  const { items, error } = useAgenda(DAYS);
  const byDay = (items ?? []).reduce((acc, e) => acc.set(e.date, [...(acc.get(e.date) ?? []), e]), new Map());
  return (
    <>
      <PageTitle area="calendar" id="calendar-title">
        Kalender
      </PageTitle>
      <MonthCalendar />
      <section className="card" aria-labelledby="next-title">
        <h2 id="next-title">Als Nächstes</h2>
        <p className="muted">Die nächsten {DAYS} Tage: Folgen, Filmstarts, Konzerte, Alben, Aufhol-Termine und Abo-Erinnerungen.</p>
        {error ? (
          <Messages error={errorMessage(error)} />
        ) : !items ? (
          <CardSkeleton />
        ) : items.length === 0 ? (
          <p className="empty">
            In den nächsten {DAYS} Tagen steht nichts an. Verfolge Serien, indem du auf ihrer Detailseite Folgen abhakst – zum Beispiel über die{' '}
            <Link to="/">Watchlist</Link>.
          </p>
        ) : (
          <div className="calendar">
            {[...byDay].map(([date, list]) => (
              <div key={date} className="calendar-day">
                <h3>{dayLabel(date)}</h3>
                <ul className="list">
                  {list.map((e) => (
                    <li key={e.uid} className="title-row">
                      <div className="title-main">
                        {e.path ? (
                          <Link className="title-name title-link" to={e.path}>
                            {e.title}
                          </Link>
                        ) : (
                          <span className="title-name">{e.title}</span>
                        )}
                        <span className="meta">
                          <span className="badge">{KIND_LABEL[e.kind]}</span>
                          {e.detail && <span>{e.detail.split('\n')[0]}</span>}
                        </span>
                      </div>
                      {e.url && (
                        <a className="button-link btn-compact" href={e.url} target="_blank" rel="noopener noreferrer">
                          Tickets
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
      <CatchUpList />
      <Subscribe />
    </>
  );
}
