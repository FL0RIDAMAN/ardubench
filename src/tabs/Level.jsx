// Accel & Level tab. Board Alignment, Calibrate and the trims follow
// Betaflight Configurator 2026.6.2's Sensors tab (SensorsTab.vue); the
// 6-position "Calibrate Accel" and "Calibrate Level" copy Mission Planner's
// accelerometer page (ConfigAccelerometerCalibration.cs). ArduPilot behaviour
// is from GCS_Common.cpp, AP_InertialSensor.cpp and AP_AccelCal.cpp (master).
import { useEffect, useRef, useState } from 'react';
import { useVehicle } from '../useVehicle.js';
import { useRates } from '../useRates.js';
import { CMD, MSG_ID, ACCEL_POS, ACK_RESULT } from '../vehicle.js';
import { Panel, Row, Tag, Help, NumberInput } from '../components.jsx';
import { ROTATIONS, rotationLabel } from '../compass.js';

const deg = (r) => (r * 180) / Math.PI;
// One decimal, without "-0.0".
const one = (x) => (Math.abs(x) < 0.05 ? 0 : x).toFixed(1);
const rad = (d) => (d * Math.PI) / 180;
// AHRS_TRIM_X/Y @Range: ±0.1745 rad (10°).
const TRIM_MAX_DEG = 10;
// What ArduPilot asks for (AP_AccelCal.cpp "Place vehicle %s and press any key.").
const POS_TEXT = {
  [ACCEL_POS.LEVEL]: 'level', [ACCEL_POS.LEFT]: 'on its LEFT side', [ACCEL_POS.RIGHT]: 'on its RIGHT side',
  [ACCEL_POS.NOSEDOWN]: 'nose DOWN', [ACCEL_POS.NOSEUP]: 'nose UP', [ACCEL_POS.BACK]: 'on its BACK',
};
// PREFLIGHT_CALIBRATION param5: 1 full (6-position), 2 level (trim), 4 simple.
const CAL = { FULL: 1, LEVEL: 2, SIMPLE: 4 };
// Calibrations block the FC for a while (gyro calibration first, up to ~30 s).
const CAL_TIMEOUT_MS = 40000;

export default function Level({ stage, value, pending }) {
  const v = useVehicle();
  const [busy, setBusy] = useState(null); // 'level' | 'simple' | null
  const [result, setResult] = useState(null); // { ok, text }
  const [wizard, setWizard] = useState(!!v.accelCalSession);
  useRates(v, { [MSG_ID.ATTITUDE]: 10 });

  const pendingCount = Object.keys(pending).length;
  const blocked = !v.connected ? 'Connect first.'
    : v.armed ? 'Disarm the FC first.'
      : v.rebooting ? 'The FC is rebooting.'
        : pendingCount ? 'Write your changes first.' : '';

  // ArduPilot treats an accelerometer whose offsets are exactly 0 as not
  // calibrated (AP_InertialSensor::accel_calibrated_ok_all).
  const imus = ['', '2', '3'].filter((s) => s === '' || v.param(`INS_ACC${s}_ID`));
  const uncalibrated = imus.some((s) => ['X', 'Y', 'Z'].every((a) => (v.param(`INS_ACC${s}OFFS_${a}`) ?? 1) === 0));

  async function runCal(kind, label) {
    setResult(null);
    setBusy(label);
    const since = Date.now();
    try {
      const r = await v.commandResult(CMD.PREFLIGHT_CALIBRATION, [0, 0, 0, 0, kind, 0, 0], CAL_TIMEOUT_MS);
      const said = v.messages.filter((m) => m.t >= since).map((m) => m.text);
      if (r === 0) {
        await v.readParams(['AHRS_TRIM_X', 'AHRS_TRIM_Y', ...imus.flatMap((s) => ['X', 'Y', 'Z'].flatMap((a) => [`INS_ACC${s}OFFS_${a}`, `INS_ACC${s}SCAL_${a}`]))]);
        setResult({ ok: true, text: `${label} done.${said.length ? ' The FC said: ' + said.join(' ') : ''}` });
      } else {
        const hint = r === 1 ? ' ArduPilot refuses another accelerometer calibration within 5 s of the last one; wait a moment and try again.' : '';
        setResult({ ok: false, text: `${label}: the FC answered “${ACK_RESULT[r] || r}”.${hint}${said.length ? ' It said: ' + said.join(' ') : ''}` });
      }
    } catch (e) {
      setResult({ ok: false, text: `${label}: ${e.message}` });
    }
    setBusy(null);
  }

  const trimDeg = (name) => (value(name) === undefined ? undefined : Number(deg(value(name)).toFixed(2)));
  const orient = value('AHRS_ORIENTATION');
  const att = v.attitude && Date.now() - v.attitude.t < 2000 ? v.attitude : null;

  return (
    <div className="level">
      <div className="page-head">
        <h1 className="page-title">Accel &amp; Level</h1>
        <a className="wiki" href="https://ardupilot.org/copter/docs/common-accelerometer-calibration.html" target="_blank" rel="noreferrer">WIKI</a>
      </div>

      <div className="cols">
        <div className="col">
          <Panel title="Board Alignment">
            <Row label="Board Alignment" param={`AHRS_ORIENTATION ${orient} (${ROTATIONS.find(([n]) => n === orient)?.[1] ?? '?'})`} note="reboot, then Calibrate Level again" help="boardAlign" changed={pending.AHRS_ORIENTATION}>
              <select className="wide" aria-label="Board alignment" value={orient} onChange={(e) => stage('AHRS_ORIENTATION', Number(e.target.value), 'Board alignment (then re-level)')}>
                {ROTATIONS.map(([n]) => <option key={n} value={n}>{rotationLabel(n)}</option>)}
              </select>
            </Row>
            {(orient === 101 || orient === 102) && (
              <p className="muted small">Custom rotation: set CUST_ROT_ENABLE to 1 and the angles in CUST_ROT{orient - 100}_ROLL, _PITCH and _YAW in the Parameters tab (reboot needed).</p>
            )}
            {orient === 100 && <p className="muted small">Custom 4.1 and older uses AHRS_CUSTOM_ROLL/PIT/YAW, on ArduPilot 4.1 and older only.</p>}
          </Panel>

          <Panel title="Accelerometer">
            {uncalibrated && (
              <p className="warn-line">Accelerometer has not been calibrated. Please calibrate before flying. (ArduPilot won’t arm: “3D Accel calibration needed”.)</p>
            )}

            <div className="cal-block">
              <div className="row-label"><Tag kind="ap" /><b>Calibrate Accel</b><span className="muted small">6 positions · recommended</span><Help id="accelFull" /></div>
              <p className="small">The FC asks for six positions in turn: level, on each side, nose down, nose up and on its back. The ArduPilot wiki says this calibration is mandatory. Reboot afterwards.</p>
              <button type="button" className="btn-yellow" onClick={() => { setResult(null); setWizard(true); }} disabled={!!blocked || !!busy}>Calibrate Accel</button>
            </div>

            <div className="cal-block">
              <div className="row-label"><Tag kind="ap" /><b>Calibrate Level</b><Help id="accelLevel" /></div>
              <p className="small">Sit the quad in its level flying attitude and keep it still. This sets the trims below (up to 10° of roll and pitch, not yaw) and applies at once.</p>
              <button type="button" className="btn-yellow" onClick={() => runCal(CAL.LEVEL, 'Calibrate Level')} disabled={!!blocked || !!busy}>{busy === 'Calibrate Level' ? 'Calibrating…' : 'Calibrate Level'}</button>
            </div>

            <div className="cal-block">
              <div className="row-label"><Tag /><b>Calibrate</b><span className="muted small">ArduPilot’s Simple Accel Cal</span><Help id="accelSimple" /></div>
              <p className="small">Place the craft on a level surface before calibrating. One level position, like Betaflight. It only finds the main offsets and sets the trims to 0; the wiki keeps it for vehicles too big to turn over.</p>
              <button type="button" className="btn-grey" onClick={() => runCal(CAL.SIMPLE, 'Calibrate')} disabled={!!blocked || !!busy}>{busy === 'Calibrate' ? 'Calibrating…' : 'Calibrate'}</button>
            </div>
            {blocked && <p className="muted small">{blocked}</p>}
            {busy && <p className="muted small">Keep the quad still. The FC calibrates the gyros first and doesn’t send live data until it’s done.</p>}
            {result && <p className={result.ok ? 'ok-line' : 'warn-line'} role="status">{result.text}</p>}

            <Row label="Accelerometer Roll Trim" param={`AHRS_TRIM_X ${value('AHRS_TRIM_X') !== undefined ? Number(value('AHRS_TRIM_X').toFixed(4)) : '—'}`} note="radians, shown in degrees" help="trimRoll" up changed={pending.AHRS_TRIM_X}>
              <NumberInput label="Accelerometer roll trim, degrees" step={0.1} min={-TRIM_MAX_DEG} max={TRIM_MAX_DEG} suffix="°" value={trimDeg('AHRS_TRIM_X')} onCommit={(x) => stage('AHRS_TRIM_X', rad(x), 'Roll trim')} />
            </Row>
            <Row label="Accelerometer Pitch Trim" param={`AHRS_TRIM_Y ${value('AHRS_TRIM_Y') !== undefined ? Number(value('AHRS_TRIM_Y').toFixed(4)) : '—'}`} note="radians, shown in degrees" help="trimPitch" up changed={pending.AHRS_TRIM_Y}>
              <NumberInput label="Accelerometer pitch trim, degrees" step={0.1} min={-TRIM_MAX_DEG} max={TRIM_MAX_DEG} suffix="°" value={trimDeg('AHRS_TRIM_Y')} onCommit={(x) => stage('AHRS_TRIM_Y', rad(x), 'Pitch trim')} />
            </Row>
          </Panel>
        </div>

        <div className="col">
          <Panel title="Attitude">
            <p className="small">What the FC measures (ATTITUDE). Tilt the quad: each picture should tilt the same way. If one tilts the wrong way, Board Alignment is wrong. <Help id="attitude" /></p>
            <div className="attitude-views">
              <figure>
                <DroneView view="rear" angle={att ? deg(att.roll) : 0} dim={!att} />
                <figcaption>Roll {att ? `${one(deg(att.roll))}°` : '—'}<br /><span className="muted small">seen from behind</span></figcaption>
              </figure>
              <figure>
                <DroneView view="side" angle={att ? -deg(att.pitch) : 0} dim={!att} />
                <figcaption>Pitch {att ? `${one(deg(att.pitch))}°` : '—'}<br /><span className="muted small">seen from the right, nose right</span></figcaption>
              </figure>
            </div>
            {!att && <p className="muted small center">No ATTITUDE from the FC yet.</p>}
          </Panel>
        </div>
      </div>

      {wizard && <AccelWizard v={v} imus={imus} onClose={() => setWizard(false)} />}
    </div>
  );
}

// The 6-position calibration, like Mission Planner's "Calibrate Accel": the FC
// asks for each position (MAV_CMD_ACCELCAL_VEHICLE_POS, about once a second);
// "Done" answers with the same position; after the sixth it reports SUCCESS
// or FAILED. ArduPilot has no command to stop it: only a reboot (or arming) does.
function AccelWizard({ v, imus, onClose }) {
  const ref = useRef(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [sent, setSent] = useState(null); // position we confirmed, until the FC moves on
  const [done, setDone] = useState([]);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);

  const s = v.accelCalSession;
  // Only what the FC sends after it accepted the start counts: a finished
  // calibration keeps reporting SUCCESS / FAILED about once a second until a
  // new one starts (AP_AccelCal::update). 50 ms of slack for packets that
  // arrived in the same read as the ACK.
  const since = s && s.ackedAt ? s.ackedAt - 50 : Infinity;
  const asked = v.accelCalPos && v.accelCalPos.t >= since ? v.accelCalPos.pos : null;
  const msgs = s ? v.messages.filter((m) => m.t >= s.started) : [];
  const newMsgs = msgs.filter((m) => m.t >= since);
  const success = asked === ACCEL_POS.SUCCESS || newMsgs.some((m) => /calibration successful/i.test(m.text));
  const failed = asked === ACCEL_POS.FAILED || newMsgs.some((m) => /calibration failed|calibration cancelled/i.test(m.text));
  const finished = success || failed;
  const pos = asked >= 1 && asked <= 6 ? asked : null;

  useEffect(() => {
    if (!s || !finished || s.finished) return;
    s.finished = true;
    if (success) {
      v.markRebootNeeded(); // pre-arm "Accels calibrated requires reboot"
      v.readParams(['AHRS_TRIM_X', 'AHRS_TRIM_Y', ...imus.flatMap((x) => ['X', 'Y', 'Z'].flatMap((a) => [`INS_ACC${x}OFFS_${a}`, `INS_ACC${x}SCAL_${a}`]))]);
    }
  });
  // The FC moved on to the next position: the last one is done.
  useEffect(() => {
    if (sent !== null && asked !== sent) { setDone((d) => [...new Set([...d, sent])]); setSent(null); }
  }, [asked, sent]);

  async function start() {
    setError('');
    setStarting(true);
    setDone([]);
    v.accelCalSession = { started: Date.now() };
    v.emit();
    try {
      const r = await v.commandResult(CMD.PREFLIGHT_CALIBRATION, [0, 0, 0, 0, 1, 0, 0], CAL_TIMEOUT_MS);
      if (r === 0 && v.accelCalSession) v.accelCalSession.ackedAt = Date.now();
      if (r !== 0) {
        v.accelCalSession = null;
        setError(`The FC didn’t start the calibration (${ACK_RESULT[r] || r}).`);
      }
    } catch (e) {
      v.accelCalSession = null;
      setError(e.message);
    }
    v.emit();
    setStarting(false);
  }

  async function confirm() {
    setError('');
    const p = pos;
    setSent(p);
    try {
      const r = await v.commandResult(CMD.ACCELCAL_VEHICLE_POS, [p]);
      if (r !== 0) { setSent(null); setError(`The FC didn’t take that position (${ACK_RESULT[r] || r}). Wait for it to ask again, then press Done.`); }
    } catch (e) {
      setSent(null);
      setError(e.message);
    }
  }

  function close() {
    if (s && finished) v.accelCalSession = null;
    v.emit();
    onClose();
  }

  const runningNotDone = s && !finished;
  return (
    <dialog ref={ref} className="bf-dialog" aria-label="Calibrate Accel" onCancel={(e) => { e.preventDefault(); close(); }}>
      <h3>Calibrate Accel</h3>
      {!s && (
        <>
          <p className="dialog-info">
            The FC will ask for six positions. For each one, set the quad down in that position on a table or in a jig (don’t hold it),
            let it settle, then press Done and keep it still. Being still matters more than the exact angle; level matters most.
          </p>
          <p className="dialog-info">Set Board Alignment first if the FC isn’t mounted arrow-forward. Props off.</p>
        </>
      )}
      {s && (
        <div className="pose-steps" aria-label="Positions">
          {[1, 2, 3, 4, 5, 6].map((p) => (
            <div key={p} className={`pose-step ${pos === p ? 'on' : ''} ${done.includes(p) || success ? 'done' : ''}`}>
              <PoseIcon pos={p} small />
              <span>{POS_TEXT[p].replace(/^on its /, '')}</span>
            </div>
          ))}
        </div>
      )}
      {s && !finished && (pos ? (
        <div className="pose-now">
          <PoseIcon pos={pos} />
          <p className="dialog-hint">Place the vehicle {POS_TEXT[pos]}{pos === sent ? ' and keep it still…' : ', then press Done.'}</p>
          <p className="muted small center">{pos === ACCEL_POS.NOSEDOWN || pos === ACCEL_POS.NOSEUP ? 'Seen from the right side, nose to the right.' : 'Seen from behind.'}</p>
        </div>
      ) : (
        <p className="dialog-hint muted">{starting ? 'Calibrating the gyros. Keep the quad still…' : 'Waiting for the FC…'}</p>
      ))}
      {success && <p className="ok-line">Calibration successful. Reboot the FC to use it (ArduPilot won’t arm until you do). Then Calibrate Level once the quad is ready to fly.</p>}
      {failed && <p className="warn-line">Calibration failed. Keep the quad still in each position and try again.</p>}
      {error && <p className="warn-line" role="alert">{error}</p>}
      {msgs.length > 0 && (
        <div className="log" aria-label="Messages from the flight controller">
          {msgs.slice(-4).map((m, i) => <div key={i} className={/fail/i.test(m.text) ? 'bad' : ''}>{m.text}</div>)}
        </div>
      )}
      {runningNotDone && <p className="muted small">ArduPilot has no command to stop this calibration. Closing this leaves the FC waiting; Reboot FC stops it.</p>}
      <div className="btns right-end">
        {runningNotDone && <button type="button" className="btn-grey" onClick={() => { v.reboot().catch((e) => setError(e.message)); close(); }}>Reboot FC</button>}
        <span className="spacer" />
        <button type="button" className="btn-grey" onClick={close}>Close</button>
        {!s && <button type="button" className="btn-yellow" onClick={start} disabled={starting}>Start</button>}
        {s && !finished && <button type="button" className="btn-yellow" onClick={confirm} disabled={!pos || sent === pos}>Done</button>}
        {s && finished && <button type="button" className="btn-yellow" onClick={() => { v.accelCalSession = null; setDone([]); v.emit(); }}>Calibrate again</button>}
      </div>
    </dialog>
  );
}

// The quad as the FC expects it for each calibration position.
// Rear view (from behind: its left is your left) for level, sides and back;
// side view (from its right side, nose to the right) for nose down / up.
// SVG rotation is clockwise: left side down = -90°, nose down = +90°.
const POSE = {
  [ACCEL_POS.LEVEL]: ['rear', 0], [ACCEL_POS.LEFT]: ['rear', -90], [ACCEL_POS.RIGHT]: ['rear', 90],
  [ACCEL_POS.NOSEDOWN]: ['side', 90], [ACCEL_POS.NOSEUP]: ['side', -90], [ACCEL_POS.BACK]: ['rear', 180],
};
function PoseIcon({ pos, small }) {
  const [view, angle] = POSE[pos];
  return <DroneView view={view} angle={angle} small={small} ground />;
}

// A simple drawing of the quad: props on top, a yellow arrow for the top
// (rear view) or the nose (side view). angle = clockwise degrees on screen.
// With a "table" line, each pose sits on it: how far to move the drawing down
// so its lowest point (body, top arrow, prop tip or nose arrow) touches y = 54.
const REST = { rear0: 46, rear180: 15, 'rear-90': 0, rear90: 0, side90: 0, 'side-90': 0 };
function DroneView({ view, angle, small, ground, dim }) {
  const size = small ? 56 : 150;
  const drop = ground ? REST[view + angle] ?? 0 : 0;
  return (
    <svg className={`drone-view ${dim ? 'dim' : ''}`} width={size} height={size} viewBox="-60 -60 120 120" role="img"
      aria-label={view === 'rear' ? 'Quad seen from behind' : 'Quad seen from the right side'}>
      {ground && <line x1="-56" y1="54" x2="56" y2="54" stroke="var(--muted)" strokeWidth="2" strokeDasharray="4 3" />}
      <g transform={`translate(0 ${drop}) rotate(${angle})`}>
        {/* arms and body */}
        <line x1="-40" y1="0" x2="40" y2="0" stroke="var(--text-soft)" strokeWidth="5" strokeLinecap="round" />
        <rect x="-14" y="-7" width="28" height="14" rx="3" fill="var(--valbox)" stroke="var(--text-soft)" strokeWidth="2" />
        {/* motors and props on top */}
        {[-38, 38].map((x) => (
          <g key={x}>
            <rect x={x - 5} y="-10" width="10" height="9" fill="var(--text-soft)" />
            <line x1={x - 18} y1="-13" x2={x + 18} y2="-13" stroke="var(--text-soft)" strokeWidth="3" strokeLinecap="round" />
          </g>
        ))}
        {view === 'rear' ? (
          // arrow pointing out of the top
          <path d="M0 -38 L8 -24 L3 -24 L3 -14 L-3 -14 L-3 -24 L-8 -24 Z" fill="var(--yellow)" />
        ) : (
          // arrow pointing out of the nose (right)
          <path d="M58 0 L44 8 L44 3 L18 3 L18 -3 L44 -3 L44 -8 Z" fill="var(--yellow)" />
        )}
        {!small && <text x={view === 'rear' ? 12 : 30} y={view === 'rear' ? -28 : 18} fontSize="11" fill="var(--yellow-fg)">{view === 'rear' ? 'top' : 'nose'}</text>}
      </g>
    </svg>
  );
}
