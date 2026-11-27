// The bottom status bar, built like Betaflight Configurator 2026.6.2's
// (src/components/status-bar/StatusBar.vue and the components it uses):
// CPU load | sensors | battery | armed, failsafe, link | logs ... versions.
// Each item reads ArduPilot's own report of that thing; see the notes below.
import { Icon } from './components.jsx';
import { SENSOR, MAV_STATE_CRITICAL } from './vehicle.js';
import pkg from '../package.json';

// Betaflight's battery defaults (vbatmaxcellvoltage 4.30 V, vbatwarningcellvoltage
// 3.50 V, src/js/utils/battery.js). ArduPilot has no per-cell settings, so the
// cell count is estimated from the pack voltage the same way Betaflight does.
const MAX_CELL_V = 4.3;
const WARN_CELL_V = 3.5;
const NO_BATTERY_V = 1.8;

function Sep() {
  return <span className="sb-sep" aria-hidden="true" />;
}

function fmtBytes(b) {
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

export default function StatusBar({ v, firmware }) {
  const connected = v.connected;
  const load = v.load ?? 0;
  const loadClass = load >= 85 ? 'critical' : load >= 60 ? 'warning' : 'ok';

  // Sensors: yellow = present (Betaflight's rule), red = present but ArduPilot
  // reports it unhealthy, grey = not fitted. GPS is also red until a 3D fix.
  const sensor = (key, label, extra) => {
    const bit = SENSOR[key];
    const present = (v.sensors.present & bit) !== 0;
    const healthy = (v.sensors.health & bit) !== 0;
    let state = present ? (healthy ? 'on' : 'bad') : 'off';
    let note = present ? (healthy ? 'detected' : 'detected, reported unhealthy') : 'not detected';
    if (extra) [state, note] = extra(present, healthy, state, note);
    return (
      <li key={key} title={`${label}: ${note}`}>
        <span className={`sb-${state}`}><Icon name={key} size={16} /></span>
        <span className="sr-only">{label}: {note}</span>
      </li>
    );
  };
  const gpsRule = (present, healthy, state, note) => {
    if (!present) return [state, note];
    const fix = v.gps ? v.gps.fix : 0;
    const sats = v.gps ? `, ${v.gps.sats} satellites` : '';
    if (fix >= 3) return [healthy ? 'on' : 'bad', `${fix >= 4 ? 'DGPS/RTK' : '3D'} fix${sats}`];
    return ['bad', `no 3D fix yet${sats}`];
  };

  // Battery: same drawing rules as Betaflight's BatteryIcon.vue.
  const volts = v.battery ? v.battery.voltage : 0;
  const hasBattery = volts > NO_BATTERY_V;
  const cells = hasBattery ? Math.ceil(volts / MAX_CELL_V) : 0;
  const min = WARN_CELL_V * cells;
  const max = MAX_CELL_V * cells;
  const empty = hasBattery && volts < min;
  const battState = !hasBattery ? 'none' : empty ? 'empty' : volts < WARN_CELL_V * cells ? 'warning' : 'ok';
  const battWidth = !hasBattery ? 0 : empty ? 100 : Math.max(0, Math.min(100, ((volts - min) / (max - min)) * 100));

  // Armed and failsafe from the heartbeat (ArduCopter reports MAV_STATE_CRITICAL
  // while any failsafe is active). Link: data from the FC in the last second.
  const failsafe = v.systemStatus === MAV_STATE_CRITICAL;
  const linkUp = Date.now() - v.lastRxAt < 1000;

  // Logs: ArduPilot lists its logs (LOG_ENTRY) but doesn't report how much
  // storage is left, so this shows what's stored rather than a free-space bar.
  const logs = v.logs;
  const logsText = !logs ? '—' : !logs.done ? '…' : logs.count === 0 ? 'No logs' : `${logs.count} log${logs.count > 1 ? 's' : ''} · ${fmtBytes(logs.bytes)}`;

  return (
    <footer className="statusbar">
      {connected && (
        <>
          <span className="sb-group" title={`CPU load ${Math.round(load)}%`}>
            <span className="sb-stat-icon"><Icon name="cpu" size={14} /></span>
            <span className={`sb-cpu sb-cpu--${loadClass}`}><span style={{ width: `${Math.min(100, load)}%` }} /></span>
            <span className="sr-only">CPU load {Math.round(load)}%</span>
          </span>
          <Sep />
          <ul className="sb-sensors" aria-label="Sensors">
            {sensor('gyro', 'Gyroscope')}
            {sensor('accel', 'Accelerometer')}
            {sensor('mag', 'Compass')}
            {sensor('baro', 'Barometer')}
            {sensor('gps', 'GPS', gpsRule)}
            {sensor('rangefinder', 'Rangefinder')}
          </ul>
          <Sep />
          <span
            className="sb-group"
            title={hasBattery ? `Battery: ${volts.toFixed(2)} V, ${cells}S estimated from voltage (4.30 V max, 3.50 V warning per cell)` : 'No battery voltage'}
          >
            <span className={`sb-battery sb-battery--${battState}`} aria-hidden="true"><span style={{ width: `${battWidth}%` }} /></span>
            <span className="sb-value">{volts.toFixed(2)}V{hasBattery ? ` (${cells}S)` : ''}</span>
          </span>
          <Sep />
          <span className="sb-group sb-icons">
            <span className={v.armed ? 'sb-on' : 'sb-off'} title={v.armed ? 'Armed' : 'Disarmed'}><Icon name="armed" size={16} /><span className="sr-only">{v.armed ? 'Armed' : 'Disarmed'}</span></span>
            <span className={failsafe ? 'sb-on' : 'sb-off'} title={failsafe ? 'Failsafe active' : 'No failsafe'}><Icon name="failsafe" size={16} /><span className="sr-only">{failsafe ? 'Failsafe active' : 'No failsafe'}</span></span>
            <span className={linkUp ? 'sb-on' : 'sb-off'} title={linkUp ? 'Receiving data from the FC' : 'No data from the FC in the last second'}><Icon name="link" size={16} /><span className="sr-only">{linkUp ? 'Link up' : 'Link down'}</span></span>
          </span>
          <Sep />
          <span className="sb-group" title="Logs stored on the flight controller (ArduPilot doesn't report free space)">
            <span className="sb-stat-icon"><Icon name="logs" size={16} /></span>
            <span className="sb-value">{logsText}</span>
          </span>
        </>
      )}

      <span className="sb-right">
        {v.rebooting && <span className="warn">REBOOTING</span>}
        {connected && firmware && (
          <><Sep /><span className="sb-group"><Icon name="cpu" size={16} /><span>{firmware}</span></span></>
        )}
        {connected && v.isVirtual && (
          <><Sep /><span className="sb-group"><Icon name="cpu" size={16} /><span>Virtual Mode</span></span></>
        )}
        <Sep />
        <span className="sb-group" title="ArduBench version"><Icon name="app" size={16} /><span>{pkg.version}</span></span>
      </span>
    </footer>
  );
}
