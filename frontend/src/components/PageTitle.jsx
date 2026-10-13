// Page heading. Layout moves focus here after navigation. (`area` is kept for callers; titles stay text-only.)
export default function PageTitle({ area: _area, id, headingRef, children }) {
  return (
    <h1 id={id} ref={headingRef} tabIndex={-1} className="page-title">
      {children}
    </h1>
  );
}
