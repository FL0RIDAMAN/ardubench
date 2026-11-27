import { useEffect, useRef, useState } from 'react';
import { useVehicle } from '../useVehicle.js';
import { getLayout, frameName, SUPPORTED_FRAME_TYPES } from '../frames.js';
import { outputForMotor } from '../wizards.js';
import { PWM_TYPES } from '../help.js';
import { Panel, Toggle, Tag, Help, NumberInput, Row } from '../components.jsx';
import { QuadDiagram, VirtualDrone } from './QuadDiagram.jsx';
import { useSpin } from './useSpin.js';
import MotorOrderDialog from './MotorOrderDialog.jsx';
import MotorDirectionDialog from './MotorDirectionDialog.jsx';

const MAX_TEST_PCT = 15; // hard cap for the sliders
const SLIDER_IDLE_MS = 5000; // a slider left alone this long goes back to 0
const COLORS = { 1: '#5B9BF0', 2: '#5CC45C', 3: '#FFBB00', 4: '#E5322D' };

export default function Motors({ stage, value, pending }) {
  const v = useVehicle();
  const params = Object.fromEntries([...v.params].map(([k, p]) => [k, p.value]));
  // Tests always use the configuration the FC is running, not unsaved edits.
  const layout = getLayout(params.FRAME_CLASS, params.FRAME_TYPE);
  // The diagram shows the frame as edited (including unsaved changes), so
  // picking a mixer or the reversed toggle redraws it right away.
  const shown = getLayout(value('FRAME_CLASS'), value('FRAME_TYPE'));
  // True while the picture shows an unsaved frame change.
  const framePreview = !!(pending.FRAME_CLASS || pending.FRAME_TYPE);

  const [propsOff, setPropsOff] = useState(false);
  const [bfNums, setBfNums] = useState(false);
  const [sel, setSel] = useState(null);
  const [vals, setVals] = useState({}); // motor number -> slider %, like Betaflight's motor sliders
  const [master, setMaster] = useState(0);
  const [dialog, setDialog] = useState(null); // 'order' | 'direction' | null
  const [testError, setTestError] = useState('');
  const lastInput = useRef(0);

  // Like Betaflight: motor test is off while there are unsaved changes (the
  // screen may not match what the FC is running, e.g. the diagram previewing
  // a new frame), and here also until a reboot applies written changes.
  const pendingCount = Object.keys(pending).length;
  const testHold = pendingCount ? 'Configuration changes have been detected. Motor test is disabled until the settings have been written.'
    : v.rebootNeeded ? 'Motor test is disabled until the FC is rebooted, so the last changes take effect.' : '';
  const canSpin = !!(propsOff && v.connected && !v.armed && !v.rebooting && layout && !testHold);

  // ---- motor test ---------------------------------------------------------
  // Like Betaflight: each motor has its own slider and several can spin at
  // once; the master slider sets them all. ArduPilot's motor test runs for a
  // timeout and stops on its own; useSpin re-sends a short (1 s) test twice a
  // second, so if the app freezes or the cable comes out, motors stop within 1 s.
  useSpin(v, () => {
    if (!canSpin || !Object.values(vals).some((x) => x > 0)) return null;
    return layout.motors.map((m) => ({ seq: m.testSeq, pct: vals[m.num] || 0 }));
  }, setTestError);

  // A slider left alone for SLIDER_IDLE_MS goes back to 0.
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - lastInput.current > SLIDER_IDLE_MS) {
        setVals((x) => (Object.values(x).some((y) => y > 0) ? {} : x));
        setMaster((x) => (x ? 0 : x));
      }
    }, 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { if (!canSpin) { setVals({}); setMaster(0); } }, [canSpin]);

  function moveSlider(motor, val) {
    lastInput.current = Date.now();
    setVals((x) => ({ ...x, [motor]: val }));
  }

  function moveMaster(val) {
    lastInput.current = Date.now();
    setMaster(val);
    setVals(Object.fromEntries(layout.motors.map((m) => [m.num, val])));
  }

  function stopAll() {
    setVals({});
    setMaster(0);
    v.motorStop(1);
  }

  // ---- Motor order / Motor direction (Betaflight's tools) ---------------
  // Betaflight disables both while there are unsaved changes or motor test
  // mode is on, and shows Motor direction only with a DShot protocol.
  const isDshot = params.MOT_PWM_TYPE >= 4 && params.MOT_PWM_TYPE <= 7;
  const toolsBlocked = !v.connected ? 'Connect first.'
    : v.armed ? 'Disarm the FC first.'
      : v.rebooting ? 'The FC is rebooting.'
        : !layout ? 'This frame isn’t supported yet.'
          : pendingCount ? 'Write your changes first.'
            : v.rebootNeeded ? 'Reboot the FC first so the last changes take effect.'
              : propsOff ? 'Turn off motor test (below) to use these.' : '';

  // ---- derived values for the screen ------------------------------------
  const motorMask = layout ? layout.motors.reduce((m, x) => {
    const o = outputForMotor(params, x.num);
    return o ? m | (1 << (o - 1)) : m;
  }, 0) : 0;
  const bd = value('SERVO_BLH_BDMASK') ?? 0;
  const bidirOn = motorMask > 0 && (bd & motorMask) === motorMask;
  const serialPorts = [...v.params.keys()].filter((n) => /^SERIAL\d+_PROTOCOL$/.test(n)).sort();
  const escPort = serialPorts.find((n) => value(n) === 16) || '';
  const pct = (name) => (value(name) === undefined ? undefined : Math.round(value(name) * 1000) / 10);
  const spinArm = pct('MOT_SPIN_ARM');
  const spinMin = pct('MOT_SPIN_MIN');
  const frameType = value('FRAME_TYPE');
  // Motors the app is commanding to spin right now (the picture animates these).
  const commanded = canSpin ? Object.keys(vals).map(Number).filter((n) => vals[n] > 0) : [];

  const telem = (m) => {
    const o = outputForMotor(params, m.num);
    const e = o ? v.esc[o - 1] : null;
    return e && Date.now() - e.t < 2000 ? e : null;
  };

  return (
    <div className="motors">
      <div className="page-head">
        <h1 className="page-title">Motors</h1>
        <a className="wiki" href="https://ardupilot.org/copter/docs/connect-escs-and-motors.html" target="_blank" rel="noreferrer">WIKI</a>
      </div>

      <div className="cols">
        {/* ---------------- left column ---------------- */}
        <div className="col">
          <Panel title="Mixer">
            <div className="field-label"><Tag /> Mixer {pending.FRAME_TYPE && <span className="dot" title="Not written yet" />}</div>
            <div className="mixer-select">
              {params.FRAME_CLASS === 1 && SUPPORTED_FRAME_TYPES.includes(params.FRAME_TYPE) ? (
                <select aria-label="Frame" value={frameType} onChange={(e) => stage('FRAME_TYPE', Number(e.target.value), 'Change frame')}>
                  {SUPPORTED_FRAME_TYPES.map((t) => <option key={t} value={t}>{frameName(1, t)}</option>)}
                </select>
              ) : (
                <span className="select-static">{frameName(params.FRAME_CLASS, params.FRAME_TYPE)}</span>
              )}
              <span className="mono muted">FRAME_CLASS {value('FRAME_CLASS')} · FRAME_TYPE {frameType}</span>
              <Help id="frame" />
            </div>
            <div className="row compact">
              <div className="row-ctl">
                <Toggle
                  label="Motor direction is reversed"
                  checked={frameType === 18}
                  disabled={!(frameType === 12 || frameType === 18)}
                  onChange={(on) => stage('FRAME_TYPE', on ? 18 : 12, on ? 'Props-out (reversed)' : 'Props-in')}
                />
              </div>
              <div className="row-text">
                <div className="row-label"><Tag /><span>Motor direction is reversed</span></div>
                <div className="row-param">ArduPilot: FRAME_TYPE 18 (BetaFlightXReversed){!(frameType === 12 || frameType === 18) && <span> · pick Betaflight order to use</span>}</div>
              </div>
              <Help id="rev" />
            </div>
            <div className="row compact">
              <div className="row-ctl"><Toggle label="Show Betaflight motor numbers" checked={bfNums} onChange={setBfNums} /></div>
              <div className="row-text"><div className="row-label"><span>Show Betaflight motor numbers</span></div></div>
            </div>

            {v.isVirtual && shown && <VirtualDrone motors={shown.motors} physical={v.physical} />}
            {shown ? (
              <QuadDiagram
                motors={shown.motors}
                spinning={commanded}
                bfNums={bfNums}
                classFor={(m) => (sel === m.num ? 'active' : '')}
                onClick={(m) => setSel(m.num)}
              />
            ) : (
              <p className="note">This frame isn’t drawn yet. This version supports Quad X frames (FRAME_TYPE 1, 12, 18).</p>
            )}
            {framePreview && shown && (
              <p className="center small preview-note">Preview of your unsaved frame change. Write to FC and Reboot FC to use it.</p>
            )}
            <p className="center muted small">ArduPilot numbers motors differently than Betaflight. Letters are the test order (A → D).</p>
            <div className="btns">
              {shown && <button type="button" className="btn-yellow" onClick={() => setDialog('order')} disabled={!!toolsBlocked}>Motor order</button>}
              {isDshot && <button type="button" className="btn-yellow" onClick={() => setDialog('direction')} disabled={!!toolsBlocked}>Motor direction</button>}
              {toolsBlocked && <span className="muted small">{toolsBlocked}</span>}
            </div>
            {!isDshot && <p className="muted small">Motor direction needs a DSHOT ESC protocol (below).</p>}
          </Panel>

          <Panel title="ESC/Motor Features">
            <Row label="ESC/Motor protocol" param={`MOT_PWM_TYPE ${value('MOT_PWM_TYPE')}`} help="proto" changed={pending.MOT_PWM_TYPE}>
              <select aria-label="ESC/Motor protocol" value={value('MOT_PWM_TYPE')} onChange={(e) => stage('MOT_PWM_TYPE', Number(e.target.value), 'ESC protocol')}>
                {PWM_TYPES.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
              </select>
            </Row>
            <Row label="Bidirectional DShot" param={`SERVO_BLH_BDMASK ${bd}`} note="bitmask of outputs" help="bidir" changed={pending.SERVO_BLH_BDMASK}>
              <Toggle label="Bidirectional DShot" checked={bidirOn} disabled={!motorMask} onChange={(on) => stage('SERVO_BLH_BDMASK', on ? bd | motorMask : bd & ~motorMask, on ? 'Bidirectional DShot on' : 'Bidirectional DShot off')} />
            </Row>
            <Row label="ESC_SENSOR" param={escPort ? `${escPort} 16` : 'SERIALn_PROTOCOL 16'} note="the UART the ESC telemetry wire is on" help="esc" changed={serialPorts.some((n) => pending[n])}>
              <select aria-label="ESC telemetry port" value={escPort} onChange={(e) => {
                if (escPort) stage(escPort, -1, 'ESC telemetry moved off this port');
                if (e.target.value) stage(e.target.value, 16, 'ESC telemetry on this port');
              }}>
                <option value="">Off</option>
                {serialPorts.map((n) => <option key={n} value={n}>{n.replace('_PROTOCOL', '')}</option>)}
              </select>
            </Row>
            <Row label="Motor poles" param={`SERVO_BLH_POLES ${value('SERVO_BLH_POLES')}`} help="poles" changed={pending.SERVO_BLH_POLES}>
              <NumberInput label="Motor poles" min={1} value={value('SERVO_BLH_POLES')} onCommit={(x) => stage('SERVO_BLH_POLES', Math.round(x), 'Motor poles')} />
            </Row>
            <Row label="Motor Idle (%)" qual="on the ground, armed" param={`MOT_SPIN_ARM ${value('MOT_SPIN_ARM')?.toFixed(3)}`} note={spinArm > spinMin ? '⚠ higher than the in-flight idle' : 'fraction, not percent'} help="arm" up changed={pending.MOT_SPIN_ARM}>
              <NumberInput label="Motor idle on the ground, percent" min={0} max={100} value={spinArm} step={0.5} suffix="%" onCommit={(x) => stage('MOT_SPIN_ARM', Math.round(x * 10) / 1000, 'Idle on the ground')} />
            </Row>
            <Row label="Motor Idle (%)" qual="in flight" param={`MOT_SPIN_MIN ${value('MOT_SPIN_MIN')?.toFixed(3)}`} note="must be ≥ MOT_SPIN_ARM" help="min" up changed={pending.MOT_SPIN_MIN}>
              <NumberInput label="Motor idle in flight, percent" min={0} max={100} value={spinMin} step={0.5} suffix="%" onCommit={(x) => stage('MOT_SPIN_MIN', Math.round(x * 10) / 1000, 'Idle in flight')} />
            </Row>
            <Row kind="ap" label="Motor spin max" param={`MOT_SPIN_MAX ${value('MOT_SPIN_MAX')?.toFixed(3)}`} note="no Betaflight equivalent" help="max" up changed={pending.MOT_SPIN_MAX}>
              <NumberInput label="Motor spin max, percent" min={0} max={100} value={pct('MOT_SPIN_MAX')} step={0.5} suffix="%" onCommit={(x) => stage('MOT_SPIN_MAX', Math.round(x * 10) / 1000, 'Spin max')} />
            </Row>
          </Panel>
        </div>

        {/* ---------------- right column ---------------- */}
        <div className="col">
          <RpmGraph v={v} layout={layout} params={params} />

          {testHold && <p className="preview-note">{testHold}</p>}
          {layout && (
            <div className="sliders">
              {layout.motors.map((m) => {
                const e = telem(m);
                const val = vals[m.num] || 0;
                return (
                  <div key={m.num} className="slider-col">
                    <button type="button" className="slider-head" onClick={() => setSel(m.num)}>{m.num}{bfNums && <small> BF {m.bf}</small>}</button>
                    <div
                      className={`valbox ${sel === m.num ? 'sel' : ''}`}
                      style={{ '--fill': `${(100 * val) / MAX_TEST_PCT}%`, '--fill-alpha': ((100 * val) / MAX_TEST_PCT * 0.009 + 0.1).toFixed(2) }}
                    >{val}%</div>
                    <div className="stats">RPM: {e ? e.rpm : '—'}<br />Amps: {e ? e.current.toFixed(2) : '—'}<br />Temp: {e ? e.temp + '°C' : '—'}</div>
                    <input
                      className="vslider"
                      type="range" min="0" max={MAX_TEST_PCT} step="1"
                      value={val}
                      disabled={!canSpin}
                      aria-label={`Motor ${m.num} throttle`}
                      onChange={(ev) => moveSlider(m.num, Number(ev.target.value))}
                    />
                    <div className="slider-val">{val}%</div>
                  </div>
                );
              })}
              <div className="slider-col">
                <div className="slider-head"><Help id="master" up /></div>
                <div className="valbox" style={{ '--fill': `${(100 * master) / MAX_TEST_PCT}%`, '--fill-alpha': ((100 * master) / MAX_TEST_PCT * 0.009 + 0.1).toFixed(2) }}>{master}%</div>
                <div className="stats">All motors</div>
                <input className="vslider master" type="range" min="0" max={MAX_TEST_PCT} step="1" value={master} disabled={!canSpin} aria-label="Master throttle" onChange={(e) => moveMaster(Number(e.target.value))} />
                <div className="slider-val"><b>Master</b></div>
              </div>
            </div>
          )}

          <section className="notice" aria-label="Motor test notice">
            <div className="notice-title">Motor Test Mode / Arming Notice:</div>
            <div className="notice-warn">WARNING: Remove all propellers before testing motors.</div>
            <ul>
              <li>Throttle is capped at {MAX_TEST_PCT}%.</li>
              <li>The master slider spins all motors together.</li>
              <li>A slider left alone for {SLIDER_IDLE_MS / 1000} s goes back to 0, and a motor stops within 1 s if the app or cable drops.</li>
              <li>The FC must be disarmed. Boards with a safety switch may need it pressed first.</li>
            </ul>
            <label className="notice-toggle">
              <Toggle label="I understand the risks and the propellers are removed" checked={propsOff} onChange={setPropsOff} disabled={v.armed} />
              <span><b>I understand the risks</b>, the propellers are removed. Enable motor test.</span>
            </label>
            {v.armed && <p className="notice-warn">The FC is armed. Motor test is disabled.</p>}
            {testError && <p className="notice-warn">Motor test: {testError}</p>}
            <div className="log" aria-label="Messages from the flight controller">
              {v.messages.slice(-5).map((m, i) => <div key={i} className={m.severity <= 3 ? 'bad' : ''}>{m.text}</div>)}
            </div>
          </section>

          <div className="btns right">
            <button type="button" className="btn-red" onClick={stopAll}>Stop motors</button>
          </div>
        </div>
      </div>

      {dialog === 'order' && layout && <MotorOrderDialog v={v} layout={layout} params={params} onClose={() => setDialog(null)} />}
      {dialog === 'direction' && layout && <MotorDirectionDialog v={v} layout={layout} params={params} onClose={() => setDialog(null)} />}
    </div>
  );
}

function RpmGraph({ v, layout, params }) {
  const W = 460, H = 170, now = Date.now();
  const hist = v.rpmHistory;
  const peak = Math.max(1000, ...hist.flatMap((h) => h.rpm));
  const top = Math.ceil(peak / 1000) * 1000;
  const x = (t) => 40 + ((t - (now - 10000)) / 10000) * (W - 45);
  const y = (r) => 10 + (1 - r / top) * (H - 20);
  const lines = layout ? layout.motors.map((m) => {
    const o = outputForMotor(params, m.num);
    if (!o) return null;
    const pts = hist.map((h) => `${x(h.t).toFixed(1)},${y(h.rpm[o - 1] || 0).toFixed(1)}`).join(' ');
    return { m, pts, last: hist.length ? hist[hist.length - 1].rpm[o - 1] : null };
  }).filter(Boolean) : [];
  return (
    <section className="panel graph" aria-label="RPM graph">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Motor RPM over the last 10 seconds">
        <g stroke="#3A3A3A">
          <line x1="40" y1="10" x2="40" y2={H - 10} /><line x1="40" y1={H - 10} x2={W - 5} y2={H - 10} />
          <line x1="40" y1={H / 2} x2={W - 5} y2={H / 2} /><line x1="40" y1="10" x2={W - 5} y2="10" />
        </g>
        <g fill="#9A9A9A" fontSize="11"><text x="34" y="14" textAnchor="end">{top / 1000}k</text><text x="34" y={H / 2 + 4} textAnchor="end">{top / 2000}k</text><text x="34" y={H - 6} textAnchor="end">0</text></g>
        {lines.map((l) => l.pts && <polyline key={l.m.num} points={l.pts} fill="none" stroke={COLORS[l.m.num]} strokeWidth="2" />)}
      </svg>
      <div className="legend">
        <div className="legend-head"><span className="chip">RPM</span><span className="muted small">last 10 s</span></div>
        {lines.map((l) => (
          <div key={l.m.num} className="legend-row"><span>M{l.m.num}</span><span className="legend-val" style={{ background: COLORS[l.m.num] }}>{l.last ?? '—'}</span></div>
        ))}
        {!hist.length && <p className="muted small">No ESC telemetry yet. Needs Bidirectional DShot or ESC_SENSOR.</p>}
      </div>
    </section>
  );
}
