import { MONTH_LONG, MONTH_SHORT } from '../../lib/stats.js';

// Small dependency-free charts. Each has a text alternative (table or list) for screen readers.

export function MonthBars({ values, highlight }) {
  const max = Math.max(1, ...values);
  return (
    <figure className="chart">
      <svg viewBox="0 0 360 120" role="img" aria-label="Titel pro Monat" className="chart-svg">
        {values.map((v, i) => {
          const h = Math.round((v / max) * 90);
          return (
            <g key={i}>
              <rect x={i * 30 + 4} y={100 - h} width={22} height={Math.max(h, v ? 2 : 0)} rx={3} className={i === highlight ? 'bar bar--accent' : 'bar'} />
              {v > 0 && (
                <text x={i * 30 + 15} y={96 - h} className="chart-value" textAnchor="middle">
                  {v}
                </text>
              )}
              <text x={i * 30 + 15} y={116} className="chart-label" textAnchor="middle">
                {MONTH_SHORT[i].slice(0, 1)}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="visually-hidden">
        <caption>Titel pro Monat</caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <th scope="row">{MONTH_LONG[i]}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function RatingBars({ values }) {
  const max = Math.max(1, ...values);
  return (
    <figure className="chart">
      <svg viewBox="0 0 300 110" role="img" aria-label="Verteilung meiner Bewertungen" className="chart-svg">
        {values.map((v, i) => {
          const h = Math.round((v / max) * 80);
          return (
            <g key={i}>
              <rect x={i * 30 + 4} y={90 - h} width={22} height={Math.max(h, v ? 2 : 0)} rx={3} className="bar" />
              <text x={i * 30 + 15} y={106} className="chart-label" textAnchor="middle">
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="visually-hidden">
        <caption>Anzahl Titel pro Bewertung</caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <th scope="row">{i + 1} von 10</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// Horizontal bars as a list: label, bar, value.
export function BarList({ items, total }) {
  const max = total ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="bar-list">
      {items.map((item) => (
        <li key={item.key}>
          <span className="bar-list-label">{item.label}</span>
          <span className="bar-list-bar" aria-hidden="true">
            <span style={{ '--progress': Math.min(1, item.value / max) }} />
          </span>
          <span className="bar-list-value">{item.display ?? item.value}</span>
        </li>
      ))}
    </ul>
  );
}
