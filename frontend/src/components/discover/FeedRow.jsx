import { Check, Plus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { memo } from 'react';
import { feedToTitle } from '../../lib/api/discovery.js';
import TitleRow from '../TitleRow.jsx';

function FeedRow({ entry, inList, onFeedback, onAdd, pending }) {
  const title = feedToTitle(entry);
  const liked = entry.status === 'liked';
  return (
    <TitleRow
      item={title}
      busy={pending}
      extraMeta={
        <>
          {entry.data?.fresh && <span className="badge">Neu</span>}
          <span className="reason">{entry.reason}</span>
        </>
      }
    >
      <div className="row-actions">
        <button
          className="btn-ghost btn-compact btn-icon"
          aria-pressed={liked}
          aria-label={`${title.title}: gefällt mir`}
          title="Gefällt mir"
          disabled={pending}
          onClick={() => !liked && onFeedback(entry, 'like')}
        >
          <ThumbsUp size={16} aria-hidden="true" />
        </button>
        <button
          className="btn-ghost btn-compact btn-icon"
          aria-label={`${title.title}: nicht mein Ding`}
          title="Nicht mein Ding"
          disabled={pending}
          onClick={() => onFeedback(entry, 'dislike')}
        >
          <ThumbsDown size={16} aria-hidden="true" />
        </button>
        {inList ? (
          <span className="badge">
            <Check size={12} aria-hidden="true" /> In deiner Liste
          </span>
        ) : (
          <button className="btn-compact" disabled={pending} onClick={() => onAdd(entry)}>
            <Plus size={16} aria-hidden="true" />
            Merken
          </button>
        )}
      </div>
    </TitleRow>
  );
}

export default memo(FeedRow);
