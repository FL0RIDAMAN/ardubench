// Small building blocks shared by every screen.
import { useEffect, useRef, useState } from 'react';
import { HELP } from './help.js';

export function Panel({ title, children, className = '', tone }) {
  return (
    <section className={`panel ${tone ? 'panel-' + tone : ''} ${className}`} aria-label={title}>
      {title && <span className="panel-tag">{title}</span>}
      {children}
    </section>
  );
}

// A number you can type or step, like Betaflight Configurator's number fields
// (Nuxt UI InputNumber, orientation "vertical"): two yellow chevrons on the
// right edge, each half the field's height. Typing applies on Enter or when
// you leave the field; a chevron click (hold to repeat) or ↑/↓ applies at once.
const decimalsOf = (n) => ((String(n).split('.')[1] || '').length);

export function NumberInput({ value, onCommit, step = 1, min, max, suffix, label, width = 110, mono }) {
  const [text, setText] = useState(String(value ?? ''));
  const textRef = useRef(text);
  textRef.current = text;
  const repeat = useRef(null);
  useEffect(() => setText(String(value ?? '')), [value]);
  useEffect(() => () => clearTimeout(repeat.current), []);

  const clamp = (x) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, x));
  const commit = () => {
    const x = Number(textRef.current);
    if (textRef.current.trim() !== '' && Number.isFinite(x) && clamp(x) !== value) onCommit(clamp(x));
    else setText(String(value ?? ''));
  };
  const stepBy = (dir) => {
    const cur = Number(textRef.current);
    const base = textRef.current.trim() !== '' && Number.isFinite(cur) ? cur : (value ?? 0);
    const places = Math.max(decimalsOf(step), decimalsOf(base));
    const next = clamp(Number((base + dir * step).toFixed(Math.min(places, 6))));
    textRef.current = String(next);
    setText(String(next));
    if (next !== value) onCommit(next);
  };
  const startStep = (dir) => {
    stepBy(dir);
    const again = (ms) => { repeat.current = setTimeout(() => { stepBy(dir); again(70); }, ms); };
    again(400);
  };
  const stopStep = () => clearTimeout(repeat.current);

  const chevron = (d) => (
    <svg viewBox="0 0 12 12" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
  return (
    <span className={`numfield ${mono ? 'mono' : ''}`} style={{ width }}>
      <input
        aria-label={label}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); stepBy(e.key === 'ArrowUp' ? 1 : -1); }
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
      <span className="steps">
        {[[1, 'Increase', 'M3 7.5 6 4.5 9 7.5'], [-1, 'Decrease', 'M3 4.5 6 7.5 9 4.5']].map(([dir, word, d]) => (
          <button
            key={dir}
            type="button"
            tabIndex={-1}
            aria-label={`${word} ${label}`}
            onPointerDown={(e) => { e.preventDefault(); startStep(dir); }}
            onPointerUp={stopStep}
            onPointerLeave={stopStep}
            onPointerCancel={stopStep}
          >{chevron(d)}</button>
        ))}
      </span>
    </span>
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

// Sidebar and connect-button icons: the same Lucide icons Betaflight
// Configurator 2026.6.2 uses (src/components/sidebar/sidebar_items.js,
// src/components/device-picker/ConnectButton.vue), copied from lucide 1.82.0.
// Tabs Betaflight doesn't have use the closest Lucide icon.
// Lucide is ISC licensed: Copyright (c) 2026 Lucide Icons and Contributors.
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// Each entry: list of [svg element, attributes].
const ICONS = {
  setup: [["path",{"d":"M10 5H3"}],["path",{"d":"M12 19H3"}],["path",{"d":"M14 3v4"}],["path",{"d":"M16 17v4"}],["path",{"d":"M21 12h-9"}],["path",{"d":"M21 19h-5"}],["path",{"d":"M21 5h-7"}],["path",{"d":"M8 10v4"}],["path",{"d":"M8 12H3"}]], // lucide:sliders-horizontal
  motors: [["path",{"d":"M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z"}],["path",{"d":"M12 12v.01"}]], // lucide:fan
  receiver: [["path",{"d":"M16.247 7.761a6 6 0 0 1 0 8.478"}],["path",{"d":"M19.075 4.933a10 10 0 0 1 0 14.134"}],["path",{"d":"M4.925 19.067a10 10 0 0 1 0-14.134"}],["path",{"d":"M7.753 16.239a6 6 0 0 1 0-8.478"}],["circle",{"cx":"12","cy":"12","r":"2"}]], // lucide:radio
  compass: [["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"}]], // lucide:compass
  level: [["path",{"d":"M13.5 10.5 15 9"}],["path",{"d":"M4 4v15a1 1 0 0 0 1 1h15"}],["path",{"d":"M4.293 19.707 6 18"}],["path",{"d":"m9 15 1.5-1.5"}]], // lucide:axis-3d
  power: [["path",{"d":"M 22 14 L 22 10"}],["rect",{"x":"2","y":"6","width":"16","height":"12","rx":"2"}]], // lucide:battery
  notch: [["path",{"d":"M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"}]], // lucide:audio-waveform
  params: [["path",{"d":"M3 5h.01"}],["path",{"d":"M3 12h.01"}],["path",{"d":"M3 19h.01"}],["path",{"d":"M8 5h13"}],["path",{"d":"M8 12h13"}],["path",{"d":"M8 19h13"}]], // lucide:list
  fleet: [["circle",{"cx":"18","cy":"18","r":"3"}],["circle",{"cx":"6","cy":"6","r":"3"}],["path",{"d":"M13 6h3a2 2 0 0 1 2 2v7"}],["path",{"d":"M11 18H8a2 2 0 0 1-2-2V9"}]], // lucide:git-compare
  qc: [["rect",{"width":"8","height":"4","x":"8","y":"2","rx":"1","ry":"1"}],["path",{"d":"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"}],["path",{"d":"m9 14 2 2 4-4"}]], // lucide:clipboard-check
  connect: [["path",{"d":"M9 17H7A5 5 0 0 1 7 7h2"}],["path",{"d":"M15 7h2a5 5 0 1 1 0 10h-2"}],["line",{"x1":"8","x2":"16","y1":"12","y2":"12"}]], // lucide:link-2
  disconnect: [["path",{"d":"M9 17H7A5 5 0 0 1 7 7"}],["path",{"d":"M15 7h2a5 5 0 0 1 4 8"}],["line",{"x1":"8","x2":"12","y1":"12","y2":"12"}],["line",{"x1":"2","x2":"22","y1":"2","y2":"22"}]], // lucide:link-2-off
};

export function Icon({ name }) {
  const nodes = ICONS[name] || ICONS.params;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {nodes.map(([Tag, attrs], i) => <Tag key={i} {...attrs} />)}
    </svg>
  );
}
