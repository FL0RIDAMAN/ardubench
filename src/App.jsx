import { useState, useEffect, useCallback } from 'react';
import { useVehicle } from './useVehicle.js';
import { SerialLink, serialSupported } from './link/SerialLink.js';
import { VirtualLink } from './link/VirtualLink.js';
import { Icon } from './components.jsx';
import Motors from './tabs/Motors.jsx';
import Parameters from './tabs/Parameters.jsx';
import Ports from './tabs/Ports.jsx';
import Compass from './tabs/Compass.jsx';
import Level from './tabs/Level.jsx';
import Placeholder from './tabs/Placeholder.jsx';
import Welcome from './tabs/Welcome.jsx';
import StatusBar from './StatusBar.jsx';
import SidebarFooter from './SidebarFooter.jsx';

const TABS = [
  { id: 'setup', label: 'Setup', icon: 'setup' },
  { id: 'ports', label: 'Ports', icon: 'ports' },
  { id: 'motors', label: 'Motors', icon: 'motors' },
  { id: 'receiver', label: 'Receiver', icon: 'receiver' },
  { id: 'compass', label: 'Compass', icon: 'compass' },
  { id: 'level', label: 'Accel & Level', icon: 'level' },
  { id: 'power', label: 'Power & Failsafe', icon: 'power' },
  { id: 'notch', label: 'Harmonic Notch', icon: 'notch' },
  { id: 'params', label: 'Parameters', icon: 'params' },
  { id: 'fleet', label: 'Fleet Diff', icon: 'fleet' },
  { id: 'qc', label: 'QC Checklist', icon: 'qc' },
];

// Parameter values as people expect to read them: 0.12 rather than 0.11999999731779099.
function fmtParam(x) {
  if (x === undefined || x === null) return '—';
  return Number.isInteger(x) ? String(x) : String(Number(x.toFixed(4)));
}

export default function App() {
  const v = useVehicle();
  const [tab, setTab] = useState('motors');
  const [port, setPort] = useState(serialSupported() ? 'usb' : 'virtual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Changes the user has made but not written to the FC yet: name -> { value, reason }
  const [pending, setPending] = useState({});
  const [writing, setWriting] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  const stage = useCallback((name, value, reason) => {
    setPending((p) => {
      const n = { ...p };
      if (v.param(name) !== undefined && Math.abs(v.param(name) - value) < 1e-6) delete n[name];
      else n[name] = { value, reason };
      return n;
    });
  }, [v]);

  const value = (name) => (pending[name] ? pending[name].value : v.param(name));

  async function connect() {
    setError('');
    setBusy(true);
    try {
      await v.connect(port === 'virtual' ? new VirtualLink() : new SerialLink());
      setPending({});
    } catch (e) {
      if (e && e.name === 'NotFoundError') setError(''); // user closed the port picker
      else setError(e.message || String(e));
    }
    setBusy(false);
  }

  async function disconnect() {
    await v.disconnect();
    setPending({});
  }

  async function writeAll() {
    setWriting(true);
    setError('');
    const left = { ...pending };
    for (const [name, p] of Object.entries(pending)) {
      try { await v.setParam(name, p.value); delete left[name]; } catch (e) { setError(e.message); }
    }
    setPending(left);
    setWriting(false);
  }

  const connected = v.connected;
  const pendingCount = Object.keys(pending).length;
  const fw = [...v.messages].reverse().find((m) => /^Ardu(Copter|Plane|Rover)/.test(m.text));

  return (
    <div className="app">
      <div className="body">
        <nav className="sidebar" aria-label="Tabs">
          <div className="brand">
            <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="14" fill="none" stroke="#FFBB00" strokeWidth="3" /><path d="M17 6v22M6 17h22" stroke="#FFBB00" strokeWidth="3" /></svg>
            <span>ARDU<em>BENCH</em></span>
          </div>

          {connected || v.link ? (
            <button type="button" className="btn-disconnect" onClick={disconnect}>
              <Icon name="disconnect" /> Disconnect ({v.linkName})
            </button>
          ) : (
            <div className="connect">
              <label className="sr-only" htmlFor="port">Connection</label>
              <select id="port" value={port} onChange={(e) => setPort(e.target.value)}>
                <option value="usb" disabled={!serialSupported()}>USB {serialSupported() ? '' : '(use Chrome or Edge)'}</option>
                <option value="virtual">Virtual (no hardware)</option>
              </select>
              <button type="button" className="btn-connect" onClick={connect} disabled={busy}>
                <Icon name="connect" /> {busy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          )}

          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
              >
                <Icon name={t.icon} />{t.label}
              </button>
            ))}
          </div>
          <SidebarFooter v={v} firmware={fw ? fw.text : null} />
        </nav>

        <main className="main">
          {error && <div className="error" role="alert">{error}</div>}
          {!connected ? (
            <Welcome busy={busy || (v.link && !v.connected)} />
          ) : !v.paramsLoaded && v.params.size === 0 ? (
            <div className="loading">
              <h1>Loading parameters…</h1>
              <div className="bar"><div style={{ width: `${v.paramCount ? (100 * v.params.size) / v.paramCount : 0}%` }} /></div>
              <p>{v.params.size} of {v.paramCount || '?'}</p>
            </div>
          ) : tab === 'motors' ? (
            <Motors stage={stage} value={value} pending={pending} />
          ) : tab === 'params' ? (
            <Parameters stage={stage} value={value} pending={pending} />
          ) : tab === 'ports' ? (
            <Ports stage={stage} value={value} pending={pending} />
          ) : tab === 'compass' ? (
            <Compass stage={stage} value={value} pending={pending} />
          ) : tab === 'level' ? (
            <Level stage={stage} value={value} pending={pending} />
          ) : (
            <Placeholder title={TABS.find((t) => t.id === tab).label} />
          )}
        </main>
      </div>

      {connected && (pendingCount > 0 || v.rebootNeeded) && (
        <div className="savebar">
          {pendingCount > 0 && (
            <ul className="savebar-list" aria-label="Unsaved changes">
              {Object.entries(pending).map(([name, p]) => (
                <li key={name}>
                  <span className="mono">{name} {fmtParam(v.param(name))} → {fmtParam(p.value)}</span>
                  {p.reason && <span className="muted">: {p.reason}</span>}
                </li>
              ))}
            </ul>
          )}
          {pendingCount > 0 && <span>{pendingCount} unsaved change{pendingCount > 1 ? 's' : ''}</span>}
          {pendingCount > 0 && <button type="button" className="btn-grey" onClick={() => setPending({})}>Discard</button>}
          {pendingCount > 0 && <button type="button" className="btn-yellow" onClick={writeAll} disabled={writing}>{writing ? 'Writing…' : 'Write to FC'}</button>}
          {pendingCount === 0 && v.rebootNeeded && <span>Some changes take effect after a reboot.</span>}
          {pendingCount === 0 && v.rebootNeeded && <button type="button" className="btn-yellow" onClick={() => v.reboot().catch((e) => setError(e.message))}>Reboot FC</button>}
        </div>
      )}

      <StatusBar v={v} firmware={fw ? fw.text : null} />
    </div>
  );
}
