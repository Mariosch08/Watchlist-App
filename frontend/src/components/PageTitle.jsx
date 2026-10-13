import { AREA_ICON } from './navigation.js';

// Page heading with the symbol of its area. Layout moves focus here after navigation.
export default function PageTitle({ area, id, headingRef, children }) {
  const Icon = AREA_ICON[area];
  return (
    <h1 id={id} ref={headingRef} tabIndex={-1} className="page-title">
      {Icon && (
        <span className="page-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
      )}
      <span>{children}</span>
    </h1>
  );
}
