// Small building blocks shared by every screen.
import { useState } from 'react';
import { HELP } from './help.js';

export function Panel({ title, children, className = '', tone }) {
  return (
    <section className={`panel ${tone ? 'panel-' + tone : ''} ${className}`} aria-label={title}>
      {title && <span className="panel-tag">{title}</span>}
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}

export function Tag({ kind = 'bf' }) {
  return <span className={`tag tag-${kind}`}>{kind === 'bf' ? 'BF' : 'AP only'}</span>;
}

// The "?" button. Hover (or tap) to open, like Betaflight's tooltips.
export function Help({ id, up }) {
  const [open, setOpen] = useState(false);
  const h = HELP[id];
  if (!h) return null;
  return (
    <span className="help" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className={`help-q ${open ? 'open' : ''}`}
        aria-label={'Help: ' + h.title}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(!open)}
      >?</button>
      {open && (
        <div role="tooltip" className={`help-pop ${up ? 'up' : ''}`}>
          <div className="help-title">{h.title}</div>
          {h.items.map(([k, v], i) => <p key={i}><b>{k}</b>{v}</p>)}
        </div>
      )}
    </span>
  );
}

// Inline SVG icons for the sidebar (simple strokes, no icon font).
const ICONS = {
  setup: 'M4 6h10M4 12h16M4 18h7M17 4v4M14 16v4',
  frame: 'M5 5l14 14M19 5L5 19M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z',
  motors: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 9C10 4 6 4 5 6M15 12c5-2 5-6 3-7M12 15c2 5 6 5 7 3M9 12c-5 2-5 6-3 7',
  receiver: 'M12 12v8M8 8a6 6 0 0 1 8 0M5 5a10 10 0 0 1 14 0',
  compass: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M15 9l-2 4-4 2 2-4z',
  level: 'M3 16h18M6 16l6-8 6 8',
  power: 'M3 8h15v8H3zM18 11h3v2',
  notch: 'M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0',
  params: 'M4 6h16M4 12h16M4 18h10',
  fleet: 'M7 4v16M17 4v16M3 9h8M13 15h8',
  qc: 'M5 5h14v14H5zM8 12l3 3 5-6',
  plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
};

export function Icon({ name }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={ICONS[name] || ICONS.params} />
    </svg>
  );
}
