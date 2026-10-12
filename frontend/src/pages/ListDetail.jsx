import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dices, Plus, Search, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import MovieNights from '../components/lists/MovieNights.jsx';
import SwipeDeck from '../components/lists/SwipeDeck.jsx';
import { CardSkeleton, TitleRowSkeleton } from '../components/Skeleton.jsx';
import TitleRow from '../components/TitleRow.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useFriends } from '../hooks/useFriends.js';
import { useTitleSearch } from '../hooks/useTitleSearch.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import {
  addItems,
  addMember,
  castVote,
  deleteList,
  fetchList,
  fetchListItems,
  fetchListPeople,
  listKeys,
  removeItem,
  removeMember,
} from '../lib/api/lists.js';
import { errorMessage } from '../lib/errors.js';
import { detailPath } from '../lib/labels.js';
import { groupPick, rankItems, swipeQueue, voteKey } from '../lib/lists.js';

const ROLE_LABEL = { owner: 'Besitzer:in', editor: 'darf bearbeiten', viewer: 'stimmt ab' };
const VIEWS = [
  ['liste', 'Liste'],
  ['swipen', 'Swipen'],
  ['filmabend', 'Filmabend'],
];
const IMPORT_LIMIT = 50;

function Members({ listId, people, isOwner, myId }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const friends = useFriends();
  const [friend, setFriend] = useState('');
  const [role, setRole] = useState('editor');
  const refresh = () => queryClient.invalidateQueries({ queryKey: listKeys.people(listId) });
  const add = useMutation({
    mutationFn: () => addMember(listId, friend, role),
    onSuccess: () => {
      setFriend('');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({ mutationFn: (id) => removeMember(listId, id), onSuccess: refresh, onError: (err) => toast.error(errorMessage(err)) });
  const memberIds = new Set(people.map((p) => p.user_id));
  const candidates = friends.accepted.filter((f) => !memberIds.has(f.user_id));
  return (
    <div className="stack">
      <ul className="chip-list chip-list--plain" aria-label="Mitglieder">
        {people.map((p) => (
          <li key={p.user_id} className="chip">
            {p.user_id === myId ? 'Du' : p.display_name} <span className="meta-inline">· {ROLE_LABEL[p.role]}</span>
            {isOwner && p.role !== 'owner' && (
              <button className="link" aria-label={`${p.display_name} entfernen`} onClick={() => remove.mutate(p.user_id)}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {isOwner &&
        (candidates.length > 0 ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (friend) add.mutate();
            }}
          >
            <label>
              Freund:in einladen
              <select value={friend} onChange={(e) => setFriend(e.target.value)}>
                <option value="">Auswählen …</option>
                {candidates.map((f) => (
                  <option key={f.user_id} value={f.user_id}>
                    {f.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rolle
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="editor">Darf Titel hinzufügen</option>
                <option value="viewer">Darf nur abstimmen</option>
              </select>
            </label>
            <button type="submit" className="btn-compact" disabled={!friend || add.isPending}>
              Einladen
            </button>
          </form>
        ) : (
          <p className="caption">
            {friends.accepted.length ? 'Alle deine Freunde sind schon dabei.' : <>Einladen kannst du nur Freunde – <Link to="/friends">Freunde hinzufügen</Link>.</>}
          </p>
        ))}
    </div>
  );
}

function AddTitles({ listId, existing, onAdded }) {
  const toast = useToast();
  const watchlist = useWatchlist();
  const [query, setQuery] = useState('');
  const search = useTitleSearch(query);
  const add = useMutation({
    mutationFn: (titles) => addItems(listId, titles),
    onSuccess: (_, titles) => {
      onAdded();
      toast.success(titles.length === 1 ? `„${titles[0].title}“ hinzugefügt.` : `${titles.length} Titel hinzugefügt.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const planned = (watchlist.data ?? []).filter((t) => t.status === 'planned' && !existing.has(voteKey(t))).slice(0, IMPORT_LIMIT);
  return (
    <div className="stack">
      <div className="search-field" role="search">
        <Search size={16} aria-hidden="true" className="search-icon" />
        <input type="search" aria-label="Titel zur Liste hinzufügen" placeholder="Film oder Serie hinzufügen …" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {search.enabled && (
        <ul className="list">
          {search.results.slice(0, 6).map((r) => (
            <TitleRow key={voteKey(r)} item={r}>
              {existing.has(voteKey(r)) ? (
                <span className="badge">In der Liste</span>
              ) : (
                <button className="btn-compact" disabled={add.isPending} onClick={() => add.mutate([r])}>
                  <Plus size={16} aria-hidden="true" /> Hinzufügen
                </button>
              )}
            </TitleRow>
          ))}
          {search.settled && search.results.length === 0 && <li className="empty">Nichts gefunden.</li>}
        </ul>
      )}
      {planned.length > 0 && (
        <div className="actions">
          <button className="btn-ghost btn-compact" disabled={add.isPending} onClick={() => add.mutate(planned)}>
            Meine {planned.length} geplanten Titel übernehmen
          </button>
        </div>
      )}
    </div>
  );
}

export default function ListDetailPage() {
  const { listId } = useParams();
  const user = useUser();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some(([id]) => id === params.get('ansicht')) ? params.get('ansicht') : 'liste';
  const list = useQuery({ queryKey: listKeys.one(listId), queryFn: () => fetchList(listId) });
  const people = useQuery({ queryKey: listKeys.people(listId), queryFn: () => fetchListPeople(listId) });
  const data = useQuery({ queryKey: listKeys.items(listId), queryFn: () => fetchListItems(listId) });
  const [tonight, setTonight] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useDocumentTitle(list.data?.name ?? 'Liste');

  const myRole = people.data?.find((p) => p.user_id === user.id)?.role;
  const canEdit = myRole === 'owner' || myRole === 'editor';
  const ranked = useMemo(
    () => (data.data ? rankItems(data.data.items, data.data.votes, people.data?.length ?? 1, user.id) : []),
    [data.data, people.data, user.id],
  );
  const existing = useMemo(() => new Set(ranked.map(voteKey)), [ranked]);
  const refreshItems = () => queryClient.invalidateQueries({ queryKey: listKeys.items(listId) });

  const vote = useMutation({
    mutationFn: ({ t, v }) => castVote(listId, t, v),
    onMutate: ({ t, v }) =>
      queryClient.setQueryData(listKeys.items(listId), (d) =>
        d
          ? {
              ...d,
              votes: [
                ...d.votes.filter((x) => !(voteKey(x) === voteKey(t) && x.user_id === user.id)),
                ...(v ? [{ media_type: t.media_type, tmdb_id: t.tmdb_id, user_id: user.id, vote: v }] : []),
              ],
            }
          : d,
      ),
    onError: (err) => {
      refreshItems();
      toast.error(errorMessage(err));
    },
  });
  const { mutate: mutateVote } = vote;
  const onVote = useCallback((t, v) => mutateVote({ t, v }), [mutateVote]);
  const remove = useMutation({ mutationFn: (t) => removeItem(listId, t), onSuccess: refreshItems, onError: (err) => toast.error(errorMessage(err)) });
  const leaveOrDelete = useMutation({
    mutationFn: () => (myRole === 'owner' ? deleteList(listId) : removeMember(listId, user.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKeys.all(user.id) });
      navigate('/lists');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (list.isError) return <Messages error={errorMessage(list.error)} />;
  if (list.data === null) {
    return (
      <section className="card">
        <h1>Liste nicht gefunden</h1>
        <p className="muted">Diese Liste gibt es nicht (mehr) oder du bist kein Mitglied.</p>
        <Link to="/lists">Zu meinen Listen</Link>
      </section>
    );
  }
  if (!list.data || !people.data) return <CardSkeleton />;

  const matches = ranked.filter((t) => t.match);
  return (
    <>
      <div className="page-head">
        <h1 id="list-title" tabIndex={-1}>
          {list.data.name}
        </h1>
        <span className="caption">
          {ranked.length === 1 ? '1 Titel' : `${ranked.length} Titel`} · {people.data.length === 1 ? 'nur du' : `${people.data.length} Mitglieder`}
        </span>
      </div>

      <section className="card" aria-labelledby="members-title">
        <h2 id="members-title" className="visually-hidden">
          Mitglieder
        </h2>
        <Members listId={listId} people={people.data} isOwner={myRole === 'owner'} myId={user.id} />
      </section>

      {ranked.length > 0 && (
        <section className="card tonight-group" aria-labelledby="group-pick-title">
          <div className="card-head">
            <h2 id="group-pick-title">Was schauen wir?</h2>
            <button className="btn-compact" onClick={() => setTonight(groupPick(ranked) ?? 'none')}>
              <Dices size={16} aria-hidden="true" /> {tonight ? 'Nochmal' : 'Vorschlag'}
            </button>
          </div>
          {tonight === 'none' ? (
            <p className="muted">Noch kein Titel ohne Gegenstimme – stimmt zuerst ab.</p>
          ) : tonight ? (
            <p aria-live="polite">
              <Link className="title-link" to={detailPath(tonight)}>
                <strong>{tonight.title}</strong>
              </Link>{' '}
              – {tonight.up} 👍{tonight.match ? ', alle sind dafür' : ''}.
            </p>
          ) : (
            <p className="muted">Der Titel mit den meisten Stimmen ohne Gegenstimme{matches.length ? ` – ${matches.length} Match${matches.length === 1 ? '' : 'es'}, bei denen alle dafür sind` : ''}.</p>
          )}
        </section>
      )}

      <div className="segmented" role="group" aria-label="Ansicht">
        {VIEWS.map(([id, label]) => (
          <button key={id} type="button" className="segment" aria-pressed={view === id} onClick={() => setParams(id === 'liste' ? {} : { ansicht: id }, { replace: true })}>
            {label}
          </button>
        ))}
      </div>

      {view === 'swipen' ? (
        <section className="card" aria-label="Swipen">
          <SwipeDeck queue={swipeQueue(ranked)} matches={matches} onVote={onVote} busy={false} />
        </section>
      ) : view === 'filmabend' ? (
        <section className="card" aria-label="Filmabend">
          <MovieNights listId={listId} listName={list.data.name} myId={user.id} myRole={myRole} ranked={ranked} />
        </section>
      ) : (
        <section className="card" aria-label="Titel">
          {canEdit && <AddTitles listId={listId} existing={existing} onAdded={refreshItems} />}
          {data.isError ? (
            <Messages error={errorMessage(data.error)} />
          ) : !data.data ? (
            <TitleRowSkeleton rows={3} />
          ) : ranked.length === 0 ? (
            <p className="empty">Noch keine Titel. {canEdit ? 'Such oben einen Film oder übernimm deine geplanten Titel.' : 'Sobald jemand Titel hinzufügt, kannst du abstimmen.'}</p>
          ) : (
            <ul className="list">
              {ranked.map((t) => (
                <TitleRow
                  key={voteKey(t)}
                  item={t}
                  extraMeta={
                    <span className="meta-item">
                      {t.up} 👍 · {t.down} 👎{t.match && <span className="badge badge--accent">Match</span>}
                    </span>
                  }
                >
                  <div className="row-actions">
                    <button
                      className="btn-ghost btn-compact btn-icon"
                      aria-pressed={t.myVote === 1}
                      aria-label={`${t.title}: dafür`}
                      title="Dafür"
                      onClick={() => onVote(t, t.myVote === 1 ? 0 : 1)}
                    >
                      <ThumbsUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      className="btn-ghost btn-compact btn-icon"
                      aria-pressed={t.myVote === -1}
                      aria-label={`${t.title}: dagegen`}
                      title="Dagegen"
                      onClick={() => onVote(t, t.myVote === -1 ? 0 : -1)}
                    >
                      <ThumbsDown size={16} aria-hidden="true" />
                    </button>
                    {canEdit && (
                      <button className="btn-ghost btn-compact btn-icon" aria-label={`${t.title} aus der Liste entfernen`} title="Entfernen" onClick={() => remove.mutate(t)}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </TitleRow>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="actions">
        {confirmDelete ? (
          <>
            <button className="btn-danger btn-compact" disabled={leaveOrDelete.isPending} onClick={() => leaveOrDelete.mutate()}>
              {myRole === 'owner' ? 'Liste endgültig löschen' : 'Wirklich verlassen'}
            </button>
            <button className="btn-ghost btn-compact" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </button>
          </>
        ) : (
          <button className="btn-ghost btn-compact" onClick={() => setConfirmDelete(true)}>
            {myRole === 'owner' ? 'Liste löschen' : 'Liste verlassen'}
          </button>
        )}
      </div>
    </>
  );
}
