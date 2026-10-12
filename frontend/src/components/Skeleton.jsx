// Loading placeholder that matches the title-row layout.
export function TitleRowSkeleton({ rows = 3 }) {
  return (
    <ul className="list" aria-busy="true" aria-label="Wird geladen">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="title-row">
          <span className="poster skeleton" />
          <span className="title-main">
            <span className="skeleton skeleton--line skeleton--long" />
            <span className="skeleton skeleton--line skeleton--short" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CardSkeleton() {
  return (
    <section className="card" aria-busy="true" aria-label="Wird geladen">
      <span className="skeleton skeleton--line skeleton--short" />
      <span className="skeleton skeleton--line skeleton--long" />
      <span className="skeleton skeleton--line skeleton--long" />
    </section>
  );
}
