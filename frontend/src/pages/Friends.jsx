import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Gift, Inbox, Plus, Radio, UserPlus, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { TitleRowSkeleton } from '../components/Skeleton.jsx';
import TitleRow from '../components/TitleRow.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { friendKeys, useFriends } from '../hooks/useFriends.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import {
  answerRecommendation,
  fetchActivity,
  fetchReceivedRecommendations,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
} from '../lib/api/friends.js';
import { fetchProfile } from '../lib/api/profile.js';
import { fetchSettings } from '../lib/api/settings.js';
import { addTitle } from '../lib/api/watchlist.js';
import { errorMessage } from '../lib/errors.js';
import { titleKey } from '../lib/labels.js';
import { queryKeys } from '../lib/queryClient.js';

const SENT = {
  sent: (h) => `Anfrage an ${h} gesendet.`,
  pending: () => 'Die Anfrage ist schon unterwegs.',
  accepted: () => 'Ihr seid jetzt befreundet.',
  already_friends: () => 'Ihr seid bereits befreundet.',
};

function AddFriend() {
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: queryKeys.profile(user.id), queryFn: () => fetchProfile(user.id) });
  const [handle, setHandle] = useState('');
  const send = useMutation({
    mutationFn: () => sendFriendRequest(handle),
    onSuccess: (result) => {
      toast.success(SENT[result]?.(handle.trim()) ?? 'Erledigt.');
      setHandle('');
      queryClient.invalidateQueries({ queryKey: friendKeys.all(user.id) });
    },
  });
  return (
    <section className="card" aria-labelledby="add-friend-title">
      <h2 id="add-friend-title">
        <UserPlus size={18} aria-hidden="true" />
        Freund:in hinzufügen
      </h2>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (handle.trim()) send.mutate();
        }}
      >
        <label>
          Benutzername oder E-Mail
          <input value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={320} autoComplete="off" spellCheck="false" placeholder="@benutzername" />
        </label>
        <button type="submit" className="btn-compact" disabled={send.isPending || !handle.trim()}>
          <UserPlus size={16} aria-hidden="true" />
          {send.isPending ? 'Wird gesendet …' : 'Anfrage senden'}
        </button>
      </form>
      <Messages error={send.isError ? errorMessage(send.error) : ''} />
      <p className="caption">
        {profile.data?.username ? (
          <>
            Dein Benutzername: <strong>@{profile.data.username}</strong> – damit finden dich andere.
          </>
        ) : (
          <>
            Lege unter <Link to="/profile">Profil</Link> einen Benutzernamen fest, damit dich Freunde finden.
          </>
        )}
      </p>
    </section>
  );
}

function MatchBar({ friend }) {
  if (friend.match_percent == null) {
    return <span className="meta">{friend.common_rated ? `${friend.common_rated} gemeinsame Bewertungen – ab 3 gibt es ein Match` : 'Noch keine gemeinsamen Bewertungen'}</span>;
  }
  return (
    <span className="match">
      <span className="match-bar" aria-hidden="true">
        <span style={{ '--progress': friend.match_percent / 100 }} />
      </span>
      <span>
        <strong>{friend.match_percent} %</strong> Geschmacks-Match · {friend.common_rated} gemeinsame Bewertungen
      </span>
    </span>
  );
}

function FriendRows() {
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const friends = useFriends();
  const [confirm, setConfirm] = useState(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: friendKeys.all(user.id) });
  const respond = useMutation({
    mutationFn: ({ id, accept }) => respondFriendRequest(id, accept),
    onSuccess: (_, { accept, name }) => {
      if (accept) toast.success(`Du und ${name} seid jetzt befreundet.`);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: removeFriend,
    onSuccess: () => {
      setConfirm(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (friends.isError) return <Messages error={errorMessage(friends.error)} />;
  if (!friends.data) return <TitleRowSkeleton rows={2} />;
  const incoming = friends.list.filter((f) => f.status === 'pending' && f.incoming);
  const outgoing = friends.list.filter((f) => f.status === 'pending' && !f.incoming);
  return (
    <>
      {incoming.length > 0 && (
        <section className="card" aria-labelledby="requests-title">
          <h2 id="requests-title">
            <Inbox size={18} aria-hidden="true" />
            Anfragen
          </h2>
          <ul className="list">
            {incoming.map((f) => (
              <li key={f.user_id} className="title-row">
                <div className="title-main">
                  <span className="title-name">{f.display_name}</span>
                  {f.username && <span className="meta">@{f.username}</span>}
                </div>
                <div className="row-actions">
                  <button className="btn-primary btn-compact" disabled={respond.isPending} onClick={() => respond.mutate({ id: f.user_id, accept: true, name: f.display_name })}>
                    <Check size={16} aria-hidden="true" /> Annehmen
                  </button>
                  <button className="btn-ghost btn-compact" disabled={respond.isPending} onClick={() => respond.mutate({ id: f.user_id, accept: false })}>
                    Ablehnen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card" aria-labelledby="friends-title">
        <h2 id="friends-title">
          <Users size={18} aria-hidden="true" />
          Freunde
        </h2>
        {friends.accepted.length === 0 && outgoing.length === 0 ? (
          <p className="empty">Noch keine Freunde. Schick oben eine Anfrage – danach seht ihr eure Bewertungen, euren Geschmacks-Match und könnt gemeinsame Listen anlegen.</p>
        ) : (
          <ul className="list">
            {friends.accepted.map((f) => (
              <li key={f.user_id} className="title-row">
                <div className="title-main">
                  <span className="title-name">
                    {f.display_name} {f.username && <span className="meta-inline">@{f.username}</span>}
                  </span>
                  <MatchBar friend={f} />
                </div>
                {confirm === f.user_id ? (
                  <div className="row-actions">
                    <button className="btn-danger btn-compact" disabled={remove.isPending} onClick={() => remove.mutate(f.user_id)}>
                      Wirklich entfernen
                    </button>
                    <button className="btn-ghost btn-compact" onClick={() => setConfirm(null)}>
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <button className="btn-ghost btn-compact" onClick={() => setConfirm(f.user_id)}>
                    Entfernen
                  </button>
                )}
              </li>
            ))}
            {outgoing.map((f) => (
              <li key={f.user_id} className="title-row">
                <div className="title-main">
                  <span className="title-name">{f.display_name}</span>
                  <span className="meta">Anfrage gesendet – wartet auf Antwort</span>
                </div>
                <button className="btn-ghost btn-compact" disabled={remove.isPending} onClick={() => remove.mutate(f.user_id)}>
                  Zurückziehen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Recommendations() {
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const friends = useFriends();
  const watchlist = useWatchlist();
  const recs = useQuery({ queryKey: friendKeys.recommendations(user.id), queryFn: () => fetchReceivedRecommendations(user.id) });
  const answer = useMutation({
    mutationFn: async ({ rec, status }) => {
      if (status === 'added') await addTitle(rec);
      await answerRecommendation(rec.id, status);
    },
    onSuccess: (_, { rec, status }) => {
      queryClient.setQueryData(friendKeys.recommendations(user.id), (list) => list?.filter((r) => r.id !== rec.id));
      if (status === 'added') {
        queryClient.invalidateQueries({ queryKey: queryKeys.watchlist(user.id) });
        toast.success(`„${rec.title}“ gemerkt.`);
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (!recs.data?.length) return null;
  const nameOf = new Map(friends.list.map((f) => [f.user_id, f.display_name]));
  const inList = new Set((watchlist.data ?? []).map(titleKey));
  return (
    <section className="card" aria-labelledby="recs-title">
      <h2 id="recs-title">
        <Gift size={18} aria-hidden="true" />
        Von Freunden empfohlen
      </h2>
      <ul className="list">
        {recs.data.map((r) => (
          <TitleRow
            key={r.id}
            item={r}
            busy={answer.isPending && answer.variables?.rec.id === r.id}
            extraMeta={
              <span className="reason">
                {nameOf.get(r.from_user) ?? 'Ein:e Freund:in'}
                {r.message ? `: „${r.message}“` : ' empfiehlt dir diesen Titel'}
              </span>
            }
          >
            <div className="row-actions">
              {inList.has(titleKey(r)) ? (
                <button className="btn-ghost btn-compact" onClick={() => answer.mutate({ rec: r, status: 'dismissed' })}>
                  <Check size={16} aria-hidden="true" /> Schon in deiner Liste
                </button>
              ) : (
                <button className="btn-compact" disabled={answer.isPending} onClick={() => answer.mutate({ rec: r, status: 'added' })}>
                  <Plus size={16} aria-hidden="true" /> Merken
                </button>
              )}
              <button className="btn-ghost btn-compact btn-icon" aria-label={`Empfehlung „${r.title}“ ausblenden`} title="Ausblenden" onClick={() => answer.mutate({ rec: r, status: 'dismissed' })}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </TitleRow>
        ))}
      </ul>
    </section>
  );
}

const ACTIVITY_VERB = { rated: 'hat bewertet', watched: 'hat gesehen', added: 'möchte sehen' };

function Activity() {
  const user = useUser();
  const activity = useQuery({ queryKey: friendKeys.activity(user.id), queryFn: fetchActivity });
  const settings = useQuery({ queryKey: queryKeys.settings(user.id), queryFn: fetchSettings });
  return (
    <section className="card" aria-labelledby="activity-title">
      <h2 id="activity-title">
        <Radio size={18} aria-hidden="true" />
        Was deine Freunde schauen
      </h2>
      {activity.isError ? (
        <Messages error={errorMessage(activity.error)} />
      ) : !activity.data ? (
        <TitleRowSkeleton rows={2} />
      ) : activity.data.length === 0 ? (
        <p className="empty">Noch keine Aktivität. Freunde sehen hier nur etwas, wenn sie es im Profil freigeben.</p>
      ) : (
        <ul className="list">
          {activity.data.map((a) => (
            <TitleRow
              key={`${a.user_id}-${a.media_type}-${a.tmdb_id}`}
              item={a}
              extraMeta={
                <span className="reason">
                  {a.display_name} {ACTIVITY_VERB[a.kind]}
                  {a.kind === 'rated' && a.my_rating ? ` (${a.my_rating}/10)` : ''} · {new Date(a.at).toLocaleDateString('de-CH')}
                </span>
              }
            />
          ))}
        </ul>
      )}
      {settings.data && !settings.data.share_activity && (
        <p className="caption">
          Deine eigene Aktivität ist privat. Freigeben kannst du sie unter <Link to="/profile">Profil → Einstellungen</Link>.
        </p>
      )}
    </section>
  );
}

export default function FriendsPage() {
  useDocumentTitle('Freunde');
  return (
    <>
      <div className="page-head">
        <PageTitle area="friends" id="friends-page-title">
          Freunde
        </PageTitle>
        <Link className="button-link btn-compact" to="/lists">
          Listen & Sammlungen
        </Link>
      </div>
      <Recommendations />
      <FriendRows />
      <AddFriend />
      <Activity />
    </>
  );
}

