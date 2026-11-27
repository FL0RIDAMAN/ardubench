// Ports tab, laid out like Betaflight Configurator 2026.6.2's Ports tab
// (src/components/tabs/PortsTab.vue): one row per serial port with the
// columns Identifier | Configuration | Serial Rx | Telemetry Output |
// Sensor Input | Peripherals. ArduPilot gives each port one protocol
// (SERIALn_PROTOCOL), so choosing in one column turns the others off.
// Port names come from the board's @SYS/uarts.txt, like Mission Planner's
// serial port page (ConfigSerial.cs).
import { useEffect, useRef, useState } from 'react';
import { useVehicle } from '../useVehicle.js';
import { Toggle, Tag, Help } from '../components.jsx';
import {
  PROTOCOL_NAMES, P, columnOf, columnItems, BAUDS, baudRate, FIXED_BAUD, OPTION_BITS, OPTION_BITS_MOVED, RTSCTS,
  portNumbers, parseUarts, portWarnings,
} from '../ports.js';

// UART names per connection (they don't change until you plug in another board).
const uartCache = new Map();
// Mission Planner's SerialOptionRules.json: setting a port to MAVLink clears
// its options, and MAVLink1 also gets 115200 baud.
const MP_OPTIONS_REASON = 'Mission Planner clears a port’s options when it’s set to MAVLink';
const MP_BAUD_REASON = 'Mission Planner sets 115200 for MAVLink1';

const protoName = (p) => PROTOCOL_NAMES[p] || `Protocol ${p}`;

export default function Ports({ stage, value, pending }) {
  const v = useVehicle();
  const params = Object.fromEntries([...v.params].map(([k, p]) => [k, p.value]));
  const nums = portNumbers(params);
  const [uarts, setUarts] = useState(() => uartCache.get(v.connectedAt) || null);
  const [optionsFor, setOptionsFor] = useState(null);
  // Betaflight shows its grid at 1010 px and up (a media query); here it's
  // the width of the tab's own area, since the sidebar takes some of it.
  const wrapRef = useRef(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 1020));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const key = v.connectedAt;
    if (uartCache.has(key)) { setUarts(uartCache.get(key)); return; }
    let live = true;
    v.ftpRead('@SYS/uarts.txt').then(
      (text) => ({ names: parseUarts(text) }),
      (e) => ({ names: {}, error: e.message || String(e) }),
    ).then((r) => { uartCache.set(key, r); if (live) setUarts(r); });
    return () => { live = false; };
  }, [v, v.connectedAt]);

  const proto = (n) => value(`SERIAL${n}_PROTOCOL`);
  const warnings = portWarnings(nums, value);
  const rxPort = nums.find((n) => proto(n) === P.RCIN);
  const portPending = (n) => ['PROTOCOL', 'BAUD', 'OPTIONS'].some((k) => pending[`SERIAL${n}_${k}`]);

  function setProtocol(n, p, why) {
    stage(`SERIAL${n}_PROTOCOL`, p, why);
    const opt = `SERIAL${n}_OPTIONS`, baud = `SERIAL${n}_BAUD`;
    if (p === P.MAVLINK1 || p === P.MAVLINK2) {
      if ((value(opt) || 0) !== 0) stage(opt, 0, MP_OPTIONS_REASON);
      if (p === P.MAVLINK1 && value(baud) !== undefined && value(baud) !== 115) stage(baud, 115, MP_BAUD_REASON);
    }
    // Picking something else undoes those automatic changes.
    if (p !== P.MAVLINK1 && p !== P.MAVLINK2 && pending[opt]?.reason === MP_OPTIONS_REASON) stage(opt, v.param(opt), '');
    if (p !== P.MAVLINK1 && pending[baud]?.reason === MP_BAUD_REASON) stage(baud, v.param(baud), '');
  }

  function portLabel(n) {
    const u = uarts && uarts.names[n];
    const rts = RTSCTS[value(`BRD_SER${n}_RTSCTS`)];
    const hw = u ? (u.startsWith('OTG') ? `USB (${u})` : u) : '';
    return [hw, rts && `(${rts})`].filter(Boolean).join(' ');
  }

  // The baud control for the column this port's protocol is in.
  function baudCtl(n) {
    const p = proto(n);
    const name = `SERIAL${n}_BAUD`;
    if (FIXED_BAUD[p]) {
      return <span className="port-fixed" title="ArduPilot ignores SERIALn_BAUD for this protocol">{FIXED_BAUD[p] === 'Auto' ? 'Auto' : `${FIXED_BAUD[p]} (fixed)`}</span>;
    }
    const b = value(name);
    if (b === undefined) return null;
    const known = BAUDS.some(([c]) => c === b);
    return (
      <select className="port-baud" aria-label={`SERIAL${n} baud rate`} value={b} onChange={(e) => stage(name, Number(e.target.value), `SERIAL${n} baud ${baudRate(Number(e.target.value))}`)}>
        {!known && <option value={b}>{baudRate(b)} ({b})</option>}
        {BAUDS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
      </select>
    );
  }

  function columnSelect(n, col, locked) {
    const p = proto(n);
    const here = columnOf(p) === col || (col === 'peripheral' && columnOf(p) === 'other');
    const { bf, ap } = columnItems(col);
    const label = { telemetry: 'Telemetry Output', sensor: 'Sensor Input', peripheral: 'Peripherals' }[col];
    return (
      <div className={`port-cell stack col-${col}`}>
        <select
          aria-label={`SERIAL${n} ${label}`}
          value={here ? p : ''}
          disabled={locked}
          onChange={(e) => {
            if (e.target.value === '') setProtocol(n, P.NONE, `SERIAL${n}: ${label} off`);
            else setProtocol(n, Number(e.target.value), `SERIAL${n}: ${protoName(Number(e.target.value))}`);
          }}
        >
          <option value="">Disabled</option>
          {here && columnOf(p) === 'other' && <option value={p}>Other: {protoName(p)} ({p})</option>}
          <optgroup label="Betaflight equivalents">
            {bf.map((x) => <option key={x.p} value={x.p}>{x.label}</option>)}
          </optgroup>
          <optgroup label="ArduPilot only">
            {ap.map((x) => <option key={x.p} value={x.p}>{x.label}</option>)}
          </optgroup>
        </select>
        {here && baudCtl(n)}
      </div>
    );
  }

  // The controls for one port, shared by the grid and the card layouts.
  function cells(n) {
    const p = proto(n);
    const col = columnOf(p);
    const console0 = n === 0; // SERIAL0_PROTOCOL @Values: 1 MAVLink1, 2 MAVLink2 only
    const opts = value(`SERIAL${n}_OPTIONS`) || 0;
    const optNames = [...OPTION_BITS, ...OPTION_BITS_MOVED].filter(([b]) => opts & (1 << b)).map(([, l]) => l.replace(/ \(moved.*\)$/, ''));
    return {
      id: (
        <>
          <div><b>SERIAL{n}</b>{portPending(n) && <span className="dot" title="Not written yet" />}</div>
          {portLabel(n) && <div className="small">{portLabel(n)}</div>}
          <div className="row-param">{p} {protoName(p)}</div>
        </>
      ),
      config: (
        <span className="port-cell">
          <Toggle label={`SERIAL${n} MAVLink`} checked={p === P.MAVLINK2} disabled={console0}
            onChange={(on) => setProtocol(n, on ? P.MAVLINK2 : P.NONE, on ? `SERIAL${n}: MAVLink2` : `SERIAL${n}: MAVLink off`)} />
          {col === 'msp' && baudCtl(n)}
        </span>
      ),
      rx: (
        <span className="port-cell">
          <Toggle label={`SERIAL${n} Serial Rx`} checked={p === P.RCIN} disabled={console0 || (rxPort !== undefined && rxPort !== n)}
            onChange={(on) => setProtocol(n, on ? P.RCIN : P.NONE, on ? `SERIAL${n}: receiver (RCIN)` : `SERIAL${n}: receiver off`)} />
          {col === 'rx' && baudCtl(n)}
        </span>
      ),
      telemetry: columnSelect(n, 'telemetry', console0),
      sensor: columnSelect(n, 'sensor', console0),
      peripheral: columnSelect(n, 'peripheral', console0),
      options: (
        <button type="button" className="btn-grey small-btn" onClick={() => setOptionsFor(n)} aria-label={`SERIAL${n} options`}>
          {optNames.length ? optNames.join(' / ') : 'None'}
        </button>
      ),
    };
  }

  return (
    <div className="ports">
      <div className="page-head">
        <h1 className="page-title">Ports</h1>
        <a className="wiki" href="https://ardupilot.org/copter/docs/common-serial-options.html" target="_blank" rel="noreferrer">WIKI</a>
      </div>

      <div className="callout">
        <p><b>Note:</b> each port runs one protocol in ArduPilot (SERIALn_PROTOCOL), so picking something in one column turns the other columns off for that port. Changes take effect after Write to FC and Reboot FC.</p>
        <p><b>Note:</b> Do <span className="neg">NOT</span> turn off MAVLink on the port this app is connected through, or the app can’t reach the flight controller after the reboot. SERIAL0 is ArduPilot’s console port and only takes MAVLink.</p>
      </div>
      {uarts && uarts.error && (
        <p className="muted small">Couldn’t read the board’s UART names (@SYS/uarts.txt over MAVFTP): {uarts.error}. Ports are shown by ArduPilot number only.</p>
      )}
      {warnings.length > 0 && (
        <ul className="warn-list" aria-label="Port problems">
          {warnings.map((w, i) => <li key={i} className={w.level === 'error' ? 'bad' : 'warn'}>{w.text}</li>)}
        </ul>
      )}

      <div ref={wrapRef}>
        {wide ? (
          <div className="ports-grid" role="table" aria-label="Serial ports">
            <div className="ph" role="columnheader">Identifier</div>
            <div className="ph" role="columnheader"><Tag /> <span>Configuration/<wbr />MAVLink</span> <Help id="portsConfig" /></div>
            <div className="ph" role="columnheader"><Tag /> Serial Rx <Help id="portsRx" /></div>
            <div className="ph" role="columnheader"><Tag /> Telemetry Output <Help id="portsTelemetry" /></div>
            <div className="ph" role="columnheader"><Tag /> Sensor Input <Help id="portsSensor" /></div>
            <div className="ph" role="columnheader"><Tag /> Peripherals <Help id="portsPeripheral" /></div>
            <div className="ph" role="columnheader"><Tag kind="ap" /> Options <Help id="portsOptions" /></div>
            {nums.map((n) => {
              const c = cells(n);
              return (
                <div className={`prow-ports ${portPending(n) ? 'changed' : ''}`} role="row" key={n}>
                  <div className="port-id" role="cell">{c.id}</div>
                  <div className="port-cell" role="cell">{c.config}</div>
                  <div className="port-cell center" role="cell">{c.rx}</div>
                  <div role="cell">{c.telemetry}</div>
                  <div role="cell">{c.sensor}</div>
                  <div role="cell">{c.peripheral}</div>
                  <div className="port-cell" role="cell">{c.options}</div>
                </div>
              );
            })}
          </div>
        ) : (
          // Narrow screens: one card per port, like Betaflight below 1010 px.
          <div className="port-cards">
            {nums.map((n) => {
              const c = cells(n);
              return (
                <section key={n} className={`port-card ${portPending(n) ? 'changed' : ''}`} aria-label={`SERIAL${n}`}>
                  <div className="port-card-id">{c.id}</div>
                  <div className="port-card-row"><span className="port-card-label"><Tag /> Configuration/MAVLink <Help id="portsConfig" /></span>{c.config}</div>
                  <div className="port-card-row"><span className="port-card-label"><Tag /> Serial Rx <Help id="portsRx" /></span>{c.rx}</div>
                  <div className="port-card-row"><span className="port-card-label"><Tag /> Telemetry Output <Help id="portsTelemetry" /></span>{c.telemetry}</div>
                  <div className="port-card-row"><span className="port-card-label"><Tag /> Sensor Input <Help id="portsSensor" /></span>{c.sensor}</div>
                  <div className="port-card-row"><span className="port-card-label"><Tag /> Peripherals <Help id="portsPeripheral" /></span>{c.peripheral}</div>
                  <div className="port-card-row"><span className="port-card-label"><Tag kind="ap" /> Options <Help id="portsOptions" /></span>{c.options}</div>
                </section>
              );
            })}
          </div>
        )}
      </div>
      <p className="muted small">The grey text under each port is SERIALn_PROTOCOL as edited. Bauds are SERIALn_BAUD (Mission Planner calls it Speed).</p>

      {optionsFor !== null && (
        <OptionsDialog
          n={optionsFor}
          value={value(`SERIAL${optionsFor}_OPTIONS`) || 0}
          onApply={(x) => { stage(`SERIAL${optionsFor}_OPTIONS`, x, `SERIAL${optionsFor} options`); setOptionsFor(null); }}
          onClose={() => setOptionsFor(null)}
        />
      )}
    </div>
  );
}

function OptionsDialog({ n, value, onApply, onClose }) {
  const ref = useRef(null);
  const [bits, setBits] = useState(value);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  const moved = OPTION_BITS_MOVED.filter(([b]) => value & (1 << b));
  const flip = (b) => setBits((x) => x ^ (1 << b));
  return (
    <dialog ref={ref} className="bf-dialog" aria-label={`SERIAL${n} options`} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <h3>SERIAL{n} options</h3>
      <p className="dialog-info">SERIAL{n}_OPTIONS is a bitmask of electrical settings for this port. It defaults to 0 and takes effect after a reboot.</p>
      <div className="option-bits">
        {OPTION_BITS.map(([b, l]) => (
          <label key={b} className="check"><input type="checkbox" checked={!!(bits & (1 << b))} onChange={() => flip(b)} /> {l} <span className="muted mono small">bit {b}</span></label>
        ))}
        {moved.map(([b, l]) => (
          <label key={b} className="check bad"><input type="checkbox" checked={!!(bits & (1 << b))} onChange={() => flip(b)} /> {l} <span className="muted mono small">bit {b}: ArduPilot won’t arm with this set</span></label>
        ))}
      </div>
      <p className="mono small">SERIAL{n}_OPTIONS {value} → {bits}</p>
      <div className="btns right-end">
        <button type="button" className="btn-grey" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-yellow" onClick={() => onApply(bits)} disabled={bits === value}>Apply</button>
      </div>
    </dialog>
  );
}
