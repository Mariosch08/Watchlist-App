import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { TitleRowSkeleton } from '../components/Skeleton.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { createList, fetchLists, listKeys } from '../lib/api/lists.js';
import { errorMessage } from '../lib/errors.js';

const count = (rel) => rel?.[0]?.count ?? 0;

export default function ListsPage() {
  useDocumentTitle('Listen & Sammlungen');
  const user = useUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lists = useQuery({ queryKey: listKeys.all(user.id), queryFn: fetchLists });
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => createList({ name: name.trim() }),
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: listKeys.all(user.id) });
      navigate(`/lists/${id}`);
    },
  });
  return (
    <>
      <div className="page-head">
        <PageTitle area="lists" id="lists-title">
          Listen & Sammlungen
        </PageTitle>
      </div>
      <section className="card" aria-labelledby="new-list-title">
        <h2 id="new-list-title">
          <Plus size={18} aria-hidden="true" />
          Neue Liste
        </h2>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="z. B. Weihnachten oder Filmabend mit Anna" />
          </label>
          <button type="submit" className="btn-compact" disabled={create.isPending || !name.trim()}>
            <Plus size={16} aria-hidden="true" />
            Anlegen
          </button>
        </form>
        <Messages error={create.isError ? errorMessage(create.error) : ''} />
        <p className="caption">
          Ohne Mitglieder ist es deine private Sammlung („Weihnachten“, „Mit den Eltern“). Lädst du Freunde ein, sammelt ihr gemeinsam, stimmt ab oder swipt – und plant
          euren nächsten Filmabend.
        </p>
      </section>
      <section className="card" aria-labelledby="my-lists-title">
        <h2 id="my-lists-title">
          <Layers size={18} aria-hidden="true" />
          Meine Listen
        </h2>
        {lists.isError ? (
          <Messages error={errorMessage(lists.error)} />
        ) : !lists.data ? (
          <TitleRowSkeleton rows={2} />
        ) : lists.data.length === 0 ? (
          <p className="empty">Noch keine Listen. Leg oben eine an oder lass dich von Freunden einladen.</p>
        ) : (
          <ul className="list">
            {lists.data.map((l) => (
              <li key={l.id} className="title-row">
                <span className="row-icon" aria-hidden="true">
                  {count(l.list_members) > 1 ? <Users size={20} /> : <Layers size={20} />}
                </span>
                <div className="title-main">
                  <Link className="title-name title-link" to={`/lists/${l.id}`}>
                    {l.name}
                  </Link>
                  <div className="meta">
                    <span>{count(l.list_items) === 1 ? '1 Titel' : `${count(l.list_items)} Titel`}</span>
                    <span>{count(l.list_members) === 1 ? 'Sammlung' : `${count(l.list_members)} Mitglieder`}</span>
                    {l.owner_id !== user.id && <span>geteilt mit dir</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
