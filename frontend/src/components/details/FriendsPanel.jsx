import { useMutation, useQuery } from '@tanstack/react-query';
import { Send, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../../auth/AuthContext.jsx';
import { friendKeys, useFriends } from '../../hooks/useFriends.js';
import { fetchFriendsOnTitle, recommendTitle } from '../../lib/api/friends.js';
import { addItems, fetchLists, listKeys } from '../../lib/api/lists.js';
import { errorMessage } from '../../lib/errors.js';
import { STATUS_LABEL } from '../../lib/labels.js';
import { Messages } from '../Form.jsx';
import { useToast } from '../toast/ToastProvider.jsx';

// "Wer hat es gesehen?", "Schau das!" and "Zu einer Liste" for one title.
export default function FriendsPanel({ details }) {
  const user = useUser();
  const toast = useToast();
  const friends = useFriends();
  const hasFriends = friends.accepted.length > 0;
  const seen = useQuery({
    queryKey: friendKeys.onTitle(user.id, details.media_type, details.tmdb_id),
    queryFn: () => fetchFriendsOnTitle(details.media_type, details.tmdb_id),
    enabled: hasFriends,
  });
  const lists = useQuery({ queryKey: listKeys.all(user.id), queryFn: fetchLists });
  const [friend, setFriend] = useState('');
  const [message, setMessage] = useState('');
  const [list, setList] = useState('');
  const send = useMutation({
    mutationFn: () => recommendTitle(friend, details, message.trim()),
    onSuccess: () => {
      toast.success(`Empfehlung an ${friends.accepted.find((f) => f.user_id === friend)?.display_name ?? 'deine:n Freund:in'} gesendet.`);
      setMessage('');
      setFriend('');
    },
  });
  const addToList = useMutation({
    mutationFn: () => addItems(list, [details]),
    onSuccess: () => toast.success(`Zur Liste „${lists.data?.find((l) => l.id === list)?.name}“ hinzugefügt.`),
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!hasFriends && !lists.data?.length) return null;
  return (
    <section className="card" aria-labelledby="friends-panel-title">
      <h2 id="friends-panel-title">
        <UsersRound size={18} aria-hidden="true" />
        Mit Freunden
      </h2>
      {hasFriends && (
        <div className="stack">
          {seen.data?.length > 0 ? (
            <ul className="friend-ratings">
              {seen.data.map((f) => (
                <li key={f.user_id}>
                  <strong>{f.display_name}</strong>{' '}
                  <span className="meta-inline">{f.my_rating ? `${f.my_rating}/10` : STATUS_LABEL[f.status]}</span>
                </li>
              ))}
            </ul>
          ) : (
            seen.isSuccess && <p className="muted">Noch niemand aus deinem Freundeskreis hat diesen Titel.</p>
          )}
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (friend) send.mutate();
            }}
          >
            <label>
              Schau das!
              <select value={friend} onChange={(e) => setFriend(e.target.value)}>
                <option value="">Freund:in wählen …</option>
                {friends.accepted.map((f) => (
                  <option key={f.user_id} value={f.user_id}>
                    {f.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nachricht (optional)
              <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={280} placeholder="Musst du sehen!" />
            </label>
            <button type="submit" className="btn-compact" disabled={!friend || send.isPending}>
              <Send size={16} aria-hidden="true" /> Empfehlen
            </button>
          </form>
          <Messages error={send.isError ? errorMessage(send.error) : ''} />
        </div>
      )}
      {lists.data?.length > 0 && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (list) addToList.mutate();
          }}
        >
          <label>
            Zu einer Liste oder Sammlung
            <select value={list} onChange={(e) => setList(e.target.value)}>
              <option value="">Liste wählen …</option>
              {lists.data.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-compact" disabled={!list || addToList.isPending}>
            Hinzufügen
          </button>
        </form>
      )}
      {!hasFriends && (
        <p className="caption">
          <Link to="/friends">Freunde hinzufügen</Link>, um zu sehen, wer den Titel kennt.
        </p>
      )}
    </section>
  );
}
