import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createNight, deleteNight, fetchNights, fixNight, listKeys, setAvailability } from '../../lib/api/lists.js';
import { errorMessage } from '../../lib/errors.js';
import { detailPath } from '../../lib/labels.js';
import { formatNightOption, groupPick, nightIcs, nightSummary } from '../../lib/lists.js';
import { Messages } from '../Form.jsx';
import { useToast } from '../toast/ToastProvider.jsx';

const MAX_OPTIONS = 4;

function downloadIcs(night, listName, item) {
  const blob = new Blob([nightIcs(night, { listName, item })], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'filmabend.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NewNight({ listId, onCreated }) {
  const [title, setTitle] = useState('Filmabend');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () => {
      const iso = options.filter(Boolean).map((v) => new Date(v).toISOString());
      return createNight(listId, title.trim(), iso);
    },
    onSuccess: () => {
      setOptions(['', '']);
      onCreated();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const submit = (e) => {
    e.preventDefault();
    setError('');
    const filled = options.filter(Boolean);
    if (!title.trim()) return setError('Gib dem Filmabend einen Namen.');
    if (!filled.length) return setError('Schlag mindestens einen Termin vor.');
    if (filled.some((v) => new Date(v) < new Date())) return setError('Termine müssen in der Zukunft liegen.');
    create.mutate();
  };
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label>
        Name
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </label>
      <fieldset className="stack">
        <legend>Terminvorschläge</legend>
        {options.map((v, i) => (
          <input
            key={i}
            type="datetime-local"
            aria-label={`Termin ${i + 1}`}
            value={v}
            onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
          />
        ))}
        {options.length < MAX_OPTIONS && (
          <button type="button" className="btn-ghost btn-compact" onClick={() => setOptions([...options, ''])}>
            <Plus size={16} aria-hidden="true" /> Weiterer Termin
          </button>
        )}
      </fieldset>
      <Messages error={error} />
      <div className="actions">
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          Umfrage starten
        </button>
      </div>
    </form>
  );
}

function Night({ night, myId, canDecide, listName, pick, ranked, onChange }) {
  const toast = useToast();
  const s = nightSummary(night, myId);
  const chosenItem = night.chosen_tmdb_id ? ranked.find((t) => t.media_type === night.chosen_media_type && t.tmdb_id === night.chosen_tmdb_id) : null;
  const run = useMutation({ mutationFn: (fn) => fn(), onSuccess: onChange, onError: (err) => toast.error(errorMessage(err)) });
  const fixed = night.chosen_option != null;
  return (
    <li className="night">
      <div className="card-head">
        <h3>{night.title}</h3>
        {canDecide && (
          <button className="btn-ghost btn-compact btn-icon" aria-label={`Filmabend „${night.title}“ löschen`} title="Löschen" onClick={() => run.mutate(() => deleteNight(night.id))}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {fixed ? (
        <div className="stack">
          <p>
            <strong>Steht: {formatNightOption(night.options[night.chosen_option])}</strong>
            {chosenItem && (
              <>
                {' '}
                – wir schauen <Link to={detailPath(chosenItem)}>{chosenItem.title}</Link>
              </>
            )}
          </p>
          <div className="actions">
            <button className="btn-compact" onClick={() => downloadIcs(night, listName, chosenItem)}>
              <CalendarPlus size={16} aria-hidden="true" /> In meinen Kalender
            </button>
            {canDecide && (
              <button className="btn-ghost btn-compact" onClick={() => run.mutate(() => fixNight(night.id, { option: null, item: null }))}>
                Wieder öffnen
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul className="list">
          {s.options.map((o) => (
            <li key={o.index} className="night-option">
              <span className="night-date">{formatNightOption(o.at)}</span>
              <span className="meta">
                {o.yes} können{o.no ? ` · ${o.no} nicht` : ''}
                {s.best?.index === o.index && o.yes > 0 ? ' · beliebtester Termin' : ''}
              </span>
              <span className="segmented" role="group" aria-label={`Hast du am ${formatNightOption(o.at)} Zeit?`}>
                <button type="button" className="segment" aria-pressed={o.mine === true} onClick={() => run.mutate(() => setAvailability(night.id, o.index, true))}>
                  Kann
                </button>
                <button type="button" className="segment" aria-pressed={o.mine === false} onClick={() => run.mutate(() => setAvailability(night.id, o.index, false))}>
                  Kann nicht
                </button>
              </span>
              {canDecide && (
                <button className="btn-compact" disabled={run.isPending} onClick={() => run.mutate(() => fixNight(night.id, { option: o.index, item: pick }))}>
                  Festlegen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!fixed && canDecide && <p className="caption">Beim Festlegen wird der Titel mit den meisten Stimmen gewählt{pick ? `: „${pick.title}“` : ''}.</p>}
    </li>
  );
}

// Date poll for the group; the title comes from the list's votes.
export default function MovieNights({ listId, listName, myId, myRole, ranked }) {
  const queryClient = useQueryClient();
  const nights = useQuery({ queryKey: listKeys.nights(listId), queryFn: () => fetchNights(listId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: listKeys.nights(listId) });
  const canPlan = myRole === 'owner' || myRole === 'editor';
  const pick = groupPick(ranked, () => 0);
  return (
    <div className="stack">
      {nights.isError && <Messages error={errorMessage(nights.error)} />}
      {nights.data?.length > 0 && (
        <ul className="list nights">
          {nights.data.map((n) => (
            <Night
              key={n.id}
              night={n}
              myId={myId}
              canDecide={n.created_by === myId || myRole === 'owner'}
              listName={listName}
              pick={pick}
              ranked={ranked}
              onChange={refresh}
            />
          ))}
        </ul>
      )}
      {nights.data?.length === 0 && <p className="empty">Noch kein Filmabend geplant.</p>}
      {canPlan && (
        <details className="disclosure" open={nights.data?.length === 0}>
          <summary>Neuen Filmabend planen</summary>
          <NewNight listId={listId} onCreated={refresh} />
        </details>
      )}
    </div>
  );
}
