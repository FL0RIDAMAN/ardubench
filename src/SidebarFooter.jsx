// The row of small buttons at the bottom of the sidebar, like Betaflight
// Configurator's (src/components/sidebar/Sidebar.vue): Options, dark/light
// mode, save parameters (where Betaflight has its expert-mode wrench), and
// Show Log.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './components.jsx';
import { getTheme, applyTheme } from './theme.js';

// MAV_PARAM_TYPE 9 and 10 are floats; everything else is a whole number.
function paramText(p) {
  if (p.type === 9 || p.type === 10) return String(Number(p.value.toPrecision(7)));
  return String(Math.round(p.value));
}

// Mission Planner's .param format: one NAME,VALUE per line; # lines are comments.
function saveParams(v, firmware) {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    + `_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const lines = [
    `# Saved by ArduBench ${now.toISOString()}${firmware ? `, ${firmware}` : ''}`,
    ...[...v.params.keys()].sort().map((n) => `${n},${paramText(v.params.get(n))}`),
  ];
  const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ArduBench_${stamp}.param`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  return (
    <dialog ref={ref} className="bf-dialog" aria-label={title} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <h3>{title}</h3>
      {children}
      <div className="btns right-end"><button type="button" className="btn-grey" onClick={onClose}>Close</button></div>
    </dialog>
  );
}

function fmtClock(t) {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function SidebarFooter({ v, firmware }) {
  const [open, setOpen] = useState(null); // 'options' | 'log' | null
  const [theme, setTheme] = useState(getTheme());
  const canSave = v.connected && v.paramsLoaded && v.params.size > 0;
  const dark = theme === 'dark';

  function toggleTheme() {
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }

  return (
    <div className="sidebar-footer">
      <button type="button" className="icon-btn" title="Options" aria-label="Options" onClick={() => setOpen('options')}>
        <Icon name="settings" size={18} />
      </button>
      <button type="button" className="icon-btn" title="Toggle dark / light mode" aria-label="Toggle dark / light mode" onClick={toggleTheme}>
        <Icon name={dark ? 'sun' : 'moon'} size={18} />
      </button>
      <button
        type="button"
        className="icon-btn"
        title={canSave ? 'Save parameters to a file (what the FC has now; unsaved changes aren’t included)' : 'Save parameters to a file (connect first)'}
        aria-label="Save parameters to a file"
        disabled={!canSave}
        onClick={() => saveParams(v, firmware)}
      >
        <Icon name="save" size={18} />
      </button>
      <button type="button" className="icon-btn" title="Show Log" aria-label="Show Log" onClick={() => setOpen('log')}>
        <Icon name="log" size={18} />
      </button>

      {open === 'options' && (
        <Modal title="Options" onClose={() => setOpen(null)}>
          <p className="muted">No options yet.</p>
        </Modal>
      )}
      {open === 'log' && (
        <Modal title="Log" onClose={() => setOpen(null)}>
          {v.messages.length === 0 ? <p className="muted">No messages yet. Messages from the flight controller and the connection show up here.</p> : (
            <ol className="log-list">
              {v.messages.map((m, i) => (
                <li key={i} className={m.severity <= 3 ? 'bad' : m.severity === 4 ? 'warn' : ''}>
                  <span className="mono muted">{fmtClock(m.t)}</span> {m.text}
                </li>
              ))}
            </ol>
          )}
        </Modal>
      )}
    </div>
  );
}
