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
  // Sidebar footer (Betaflight's Sidebar.vue; floppy replaces its expert-mode wrench):
  settings: [["path",{"d":"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"}],["circle",{"cx":"12","cy":"12","r":"3"}]], // lucide:settings
  sun: [["circle",{"cx":"12","cy":"12","r":"4"}],["path",{"d":"M12 2v2"}],["path",{"d":"M12 20v2"}],["path",{"d":"m4.93 4.93 1.41 1.41"}],["path",{"d":"m17.66 17.66 1.41 1.41"}],["path",{"d":"M2 12h2"}],["path",{"d":"M20 12h2"}],["path",{"d":"m6.34 17.66-1.41 1.41"}],["path",{"d":"m19.07 4.93-1.41 1.41"}]], // lucide:sun
  moon: [["path",{"d":"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}]], // lucide:moon
  save: [["path",{"d":"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"}],["path",{"d":"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"}],["path",{"d":"M7 3v4a1 1 0 0 0 1 1h7"}]], // lucide:save
  log: [["path",{"d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{"d":"M14 2v5a1 1 0 0 0 1 1h5"}],["path",{"d":"M10 9H8"}],["path",{"d":"M16 13H8"}],["path",{"d":"M16 17H8"}]], // lucide:file-text
  // Status bar (Betaflight's StatusBar.vue, SensorStatus.vue, BottomStatusIcons.vue, DataFlash.vue):
  cpu: [["path",{"d":"M12 20v2"}],["path",{"d":"M12 2v2"}],["path",{"d":"M17 20v2"}],["path",{"d":"M17 2v2"}],["path",{"d":"M2 12h2"}],["path",{"d":"M2 17h2"}],["path",{"d":"M2 7h2"}],["path",{"d":"M20 12h2"}],["path",{"d":"M20 17h2"}],["path",{"d":"M20 7h2"}],["path",{"d":"M7 20v2"}],["path",{"d":"M7 2v2"}],["rect",{"x":"4","y":"4","width":"16","height":"16","rx":"2"}],["rect",{"x":"8","y":"8","width":"8","height":"8","rx":"1"}]], // lucide:cpu
  gyro: [["path",{"d":"m15.194 13.707 3.814 1.86-1.86 3.814"}],["path",{"d":"M16.47214 7.52786 A 5 10 0 1 0 13 21.79796"}],["path",{"d":"M21.79796 11 A 10 5 0 1 0 19 15.57071"}]], // lucide:rotate-3d
  accel: [["path",{"d":"M5 3v16h16"}],["path",{"d":"m5 19 6-6"}],["path",{"d":"m2 6 3-3 3 3"}],["path",{"d":"m18 16 3 3-3 3"}]], // lucide:move-3d
  mag: [["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"}]], // lucide:compass
  baro: [["path",{"d":"M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"}]], // lucide:thermometer
  gps: [["path",{"d":"m13.5 6.5-3.148-3.148a1.205 1.205 0 0 0-1.704 0L6.352 5.648a1.205 1.205 0 0 0 0 1.704L9.5 10.5"}],["path",{"d":"M16.5 7.5 19 5"}],["path",{"d":"m17.5 10.5 3.148 3.148a1.205 1.205 0 0 1 0 1.704l-2.296 2.296a1.205 1.205 0 0 1-1.704 0L13.5 14.5"}],["path",{"d":"M9 21a6 6 0 0 0-6-6"}],["path",{"d":"M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0-1.704 0z"}]], // lucide:satellite
  rangefinder: [["path",{"d":"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"}],["path",{"d":"m14.5 12.5 2-2"}],["path",{"d":"m11.5 9.5 2-2"}],["path",{"d":"m8.5 6.5 2-2"}],["path",{"d":"m17.5 15.5 2-2"}]], // lucide:ruler
  armed: [["path",{"d":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"}],["path",{"d":"M12 9v4"}],["path",{"d":"M12 17h.01"}]], // lucide:triangle-exclamation-point
  failsafe: [["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{"d":"M12 8v4"}],["path",{"d":"M12 16h.01"}]], // lucide:shield-exclamation-point
  link: [["path",{"d":"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"}],["path",{"d":"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"}]], // lucide:link
  logs: [["ellipse",{"cx":"12","cy":"5","rx":"9","ry":"3"}],["path",{"d":"M3 5V19A9 3 0 0 0 21 19V5"}],["path",{"d":"M3 12A9 3 0 0 0 21 12"}]], // lucide:database
  app: [["rect",{"width":"20","height":"14","x":"2","y":"3","rx":"2"}],["line",{"x1":"8","x2":"16","y1":"21","y2":"21"}],["line",{"x1":"12","x2":"12","y1":"17","y2":"21"}]], // lucide:monitor
};

export function Icon({ name, size = 20 }) {
  const nodes = ICONS[name] || ICONS.params;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {nodes.map(([Tag, attrs], i) => <Tag key={i} {...attrs} />)}
    </svg>
  );
}
