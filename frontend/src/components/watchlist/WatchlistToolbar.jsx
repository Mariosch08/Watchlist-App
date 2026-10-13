import { LayoutGrid, List } from 'lucide-react';
import { SEGMENTS, SORTS, TYPES } from '../../lib/watchlistView.js';

// Segment tabs with counts, type filter and sort order. All state lives in the URL.
export default function WatchlistToolbar({ view, counts, onChange }) {
  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Status">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="segment"
            aria-pressed={view.segment === s.id}
            onClick={() => onChange({ segment: s.id })}
          >
            {s.label}
            <span className="segment-count">{counts[s.id] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="toolbar-filters">
        <select aria-label="Typ" value={view.type} onChange={(e) => onChange({ type: e.target.value })}>
          {TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select aria-label="Sortierung" value={view.sort} onChange={(e) => onChange({ sort: e.target.value })}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="segmented segmented--icons" role="group" aria-label="Ansicht">
          <button type="button" className="segment btn-icon" aria-pressed={view.layout === 'grid'} aria-label="Raster" title="Raster" onClick={() => onChange({ layout: 'grid' })}>
            <LayoutGrid size={16} aria-hidden="true" />
          </button>
          <button type="button" className="segment btn-icon" aria-pressed={view.layout === 'list'} aria-label="Liste" title="Liste" onClick={() => onChange({ layout: 'list' })}>
            <List size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
