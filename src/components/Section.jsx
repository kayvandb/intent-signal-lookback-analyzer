import React, { useState } from "react";

export default function Section({ number, title, subtitle, status, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const locked = status === "locked";

  return (
    <section className={`section${locked ? " section--locked" : ""}`}>
      <button
        className="section__header"
        onClick={() => !locked && setOpen((o) => !o)}
        disabled={locked}
        type="button"
      >
        <span className={`section__badge section__badge--${status}`}>
          {status === "complete" ? "✓" : number}
        </span>
        <span className="section__titles">
          <span className="section__title">{title}</span>
          {subtitle && <span className="section__subtitle">{subtitle}</span>}
        </span>
        {!locked && <span className="section__chevron">{open ? "▾" : "▸"}</span>}
      </button>
      {open && !locked && <div className="section__body">{children}</div>}
    </section>
  );
}
