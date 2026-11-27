import { useEffect, useRef, useState } from 'react';
import { useVehicle } from '../useVehicle.js';
import { getLayout, frameName, SUPPORTED_FRAME_TYPES, MOTOR_FUNCTION_BASE, POSITIONS } from '../frames.js';
import { orderChanges, directionMask, outputForMotor } from '../wizards.js';
import { PWM_TYPES } from '../help.js';
import { Panel, Toggle, Tag, Help } from '../components.jsx';

const MAX_TEST_PCT = 15; // hard cap for the sliders
const WIZARD_PCT = 8; // throttle the wizards spin at
const SLIDER_IDLE_MS = 5000; // a slider left alone this long goes back to 0
const WIZARD_SPIN_MS = 6000; // each wizard step spins this long ("Spin again" restarts it)
const COLORS = { 1: '#5B9BF0', 2: '#5CC45C', 3: '#FFBB00', 4: '#E5322D' };

function NumField({ value, onCommit, step = 1, suffix, width = 90, label }) {
  const [text, setText] = useState(String(value ?? ''));
  useEffect(() => setText(String(value ?? '')), [value]);
  const commit = () => {
    const x = Number(text);
    if (text !== '' && Number.isFinite(x) && x !== value) onCommit(x);
    else setText(String(value ?? ''));
  };
  return (
    <span className="numfield" style={{ width }}>
      <input
        aria-label={label}
        type="number"
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  );
}

function Row({ kind = 'bf', label, qual, param, note, help, up, changed, children }) {
  return (
    <div className="row">
      <div className="row-ctl">{children}</div>
      <div className="row-text">
        <div className="row-label"><Tag kind={kind} /><span>{label}</span>{qual && <span className="qual">{qual}</span>}{changed && <span className="dot" title="Not written yet" />}</div>
        <div className="row-param">ArduPilot: {param}{note && <span> · {note}</span>}</div>
      </div>
      <Help id={help} up={up} />
    </div>
  );
}

export default function Motors({ stage, value, pending }) {
  const v = useVehicle();
  const params = Object.fromEntries([...v.params].map(([k, p]) => [k, p.value]));
  // Tests always use the configuration the FC is running, not unsaved edits.
  const layout = getLayout(params.FRAME_CLASS, params.FRAME_TYPE);

  const [propsOff, setPropsOff] = useState(false);
  const [bfNums, setBfNums] = useState(false);
  const [sel, setSel] = useState(null);
  const [slider, setSlider] = useState({ motor: null, value: 0 });
  const [master, setMaster] = useState(0);
  const [wizard, setWizard] = useState(null);
  const [testError, setTestError] = useState('');
  const lastInput = useRef(0);
  const running = useRef(null); // seq currently being sent

  const canSpin = !!(propsOff && v.connected && !v.armed && !v.rebooting && layout);
  const wizardMotor = wizard && !wizard.done ? wizard.steps[wizard.i] : null;

  // ---- motor test loop -------------------------------------------------
  // ArduPilot's motor test runs for a timeout and stops on its own. We
  // re-send a short (1 s) test twice a second while a motor should spin, so
  // if the app freezes or the cable comes out, the motor stops within a second.
  const stateRef = useRef();
  stateRef.current = { canSpin, slider, wizard, wizardMotor, layout };
  useEffect(() => {
    const t = setInterval(() => {
      const s = stateRef.current;
      let want = null; // { seq, pct }
      if (s.canSpin && s.wizardMotor && Date.now() - s.wizard.started < WIZARD_SPIN_MS) {
        want = { seq: s.wizardMotor.testSeq, pct: WIZARD_PCT };
      } else if (s.canSpin && !s.wizard && s.slider.value > 0 && s.slider.motor != null) {
        if (Date.now() - lastInput.current > SLIDER_IDLE_MS) {
          setSlider({ motor: null, value: 0 });
        } else {
          const m = s.layout.motors.find((x) => x.num === s.slider.motor);
          want = { seq: m.testSeq, pct: s.slider.value };
        }
      }
      if (want) {
        running.current = want.seq;
        v.motorTest(want.seq, want.pct, 1).then(() => setTestError(''), (e) => setTestError(e.message));
      } else if (running.current != null) {
        v.motorStop(running.current);
        running.current = null;
      }
    }, 500);
    return () => {
      clearInterval(t);
      if (running.current != null) v.motorStop(running.current);
    };
  }, [v]);

  useEffect(() => { if (!canSpin) { setSlider({ motor: null, value: 0 }); setMaster(0); } }, [canSpin]);

  function moveSlider(motor, val) {
    lastInput.current = Date.now();
    setSlider({ motor: val > 0 ? motor : null, value: val });
  }

  function runMaster() {
    if (!canSpin || master <= 0) return;
    // motor count 4 = ArduPilot runs A, B, C, D one after another.
    v.command(209, [1, 0, master, 2, 4, 0]).then(() => setTestError(''), (e) => setTestError(e.message));
  }

  function stopAll() {
    setSlider({ motor: null, value: 0 });
    setMaster(0);
    if (wizard && !wizard.done) setWizard({ ...wizard, started: 0 });
    v.motorStop(running.current || 1);
  }

  // ---- wizards -----------------------------------------------------------
  const structuralPending = Object.keys(pending).some((n) => /^(FRAME_|SERVO\d+_FUNCTION|SERVO_BLH_RVMASK)/.test(n));
  const wizardBlocked = !layout ? 'This frame isn’t supported by the wizards yet.'
    : structuralPending ? 'Write your changes first.'
      : v.rebootNeeded ? 'Reboot the FC first so the last changes take effect.'
        : !canSpin ? 'Confirm the props are off (below) to use the wizards.' : '';

  function startDirection() {
    const steps = [...layout.motors].sort((a, b) => a.testSeq - b.testSeq);
    setWizard({ type: 'dir', steps, i: 0, answers: {}, started: Date.now() });
  }
  function startOrder() {
    setWizard({ type: 'order', steps: [...layout.motors], i: 0, picks: {}, started: Date.now() });
  }

  function finishDirection(answers) {
    const mask = directionMask(layout, params, answers);
    const flipped = layout.motors.filter((m) => answers[m.num] === false).map((m) => m.num);
    if (mask !== params.SERVO_BLH_RVMASK) stage('SERVO_BLH_RVMASK', mask, `Reverse motor ${flipped.join(', ')}`);
    setWizard({ type: 'dir', done: true, flipped });
  }

  function finishOrder(picks) {
    const res = orderChanges(layout, params, picks);
    if (res.error) { setWizard({ type: 'order', done: true, error: res.error }); return; }
    const posName = Object.fromEntries(layout.motors.map((m) => [m.num, m.posName]));
    for (const [name, fn] of Object.entries(res.changes)) {
      const out = name.match(/\d+/)[0];
      const motor = fn - MOTOR_FUNCTION_BASE;
      stage(name, fn, `Output ${out} drives the ${posName[motor]} motor (Motor ${motor})`);
    }
    setWizard({ type: 'order', done: true, count: Object.keys(res.changes).length });
  }

  function answerDirection(ok) {
    const answers = { ...wizard.answers, [wizardMotor.num]: ok };
    if (wizard.i + 1 >= wizard.steps.length) finishDirection(answers);
    else setWizard({ ...wizard, answers, i: wizard.i + 1, started: Date.now() });
  }

  function clickMotorAt(posKey, motorNum) {
    if (wizard && wizard.type === 'order' && !wizard.done) {
      const picks = { ...wizard.picks, [wizardMotor.num]: posKey };
      if (wizard.i + 1 >= wizard.steps.length) finishOrder(picks);
      else setWizard({ ...wizard, picks, i: wizard.i + 1, started: Date.now() });
      return;
    }
    setSel(motorNum);
  }

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
  const physical = v.physical;
  const pickedPositions = wizard && wizard.type === 'order' && !wizard.done ? Object.values(wizard.picks) : [];

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

            {layout ? (
              <div className="quad" aria-label="Frame diagram">
                <svg width="300" height="280" viewBox="0 0 300 280" aria-hidden="true">
                  <line x1="80" y1="70" x2="220" y2="210" stroke="#BDBDBD" strokeWidth="22" strokeLinecap="round" />
                  <line x1="220" y1="70" x2="80" y2="210" stroke="#BDBDBD" strokeWidth="22" strokeLinecap="round" />
                  <path d="M150 112 l-16 22 h10 v30 h12 v-30 h10 z" fill="#E5322D" />
                </svg>
                {layout.motors.map((m) => {
                  const spinning = physical && physical.pos === m.pos;
                  const active = sel === m.num || (wizardMotor && wizard.type === 'dir' && wizardMotor.num === m.num);
                  const picked = pickedPositions.includes(m.pos);
                  return (
                    <button
                      key={m.pos}
                      type="button"
                      className={`motor-btn ${active ? 'active' : ''} ${picked ? 'picked' : ''} ${wizard && wizard.type === 'order' && !wizard.done ? 'pickable' : ''}`}
                      style={{ left: m.x - 34, top: m.y - 34 }}
                      onClick={() => clickMotorAt(m.pos, m.num)}
                      aria-label={wizard && wizard.type === 'order' && !wizard.done ? `The ${m.posName} motor is spinning` : `Motor ${m.num}, ${m.posName}, ${m.dir}`}
                    >
                      <span className="motor-num">{m.num}</span>
                      {bfNums && <span className="motor-bf">BF {m.bf}</span>}
                      <span className="motor-letter">{m.letter} · {m.dir}</span>
                      <span className={`arc ${m.dir === 'CW' ? 'cw' : 'ccw'}`} />
                      {spinning && <span className={`spin ${physical.dir === 'CW' ? 'cw' : 'ccw'}`} />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="note">This frame isn’t drawn yet. This version supports Quad X frames (FRAME_TYPE 1, 12, 18).</p>
            )}
            <p className="center muted small">ArduPilot numbers motors differently than Betaflight. Letters are the test order (A → D).</p>
            <div className="btns">
              <button type="button" className="btn-yellow" onClick={startDirection} disabled={!!wizardBlocked || !!wizard}>Motor direction</button>
              <button type="button" className="btn-yellow" onClick={startOrder} disabled={!!wizardBlocked || !!wizard}>Motor order</button>
              {wizardBlocked && !wizard && <span className="muted small">{wizardBlocked}</span>}
            </div>
          </Panel>

          {wizard && (
            <Panel title={wizard.type === 'dir' ? 'Motor direction' : 'Motor order'} tone="wizard">
              {wizard.done ? (
                <>
                  {wizard.error ? <p className="big">{wizard.error}</p>
                    : wizard.type === 'dir' ? (
                      <p className="big">{wizard.flipped.length ? `Motor ${wizard.flipped.join(', ')} will be reversed.` : 'All motors spin the right way.'}</p>
                    ) : (
                      <p className="big">{wizard.count ? `${wizard.count} outputs will be remapped.` : 'All motors are in the right place.'}</p>
                    )}
                  {!wizard.error && (wizard.count || (wizard.flipped && wizard.flipped.length)) ? (
                    <p>Click <b>Write to FC</b> at the bottom, then <b>Reboot FC</b>. Run the wizard again afterwards to confirm.{wizard.type === 'order' && ' Then run Motor direction.'}</p>
                  ) : null}
                  <div className="btns"><button type="button" className="btn-grey" onClick={() => setWizard(null)}>Close</button></div>
                </>
              ) : (
                <>
                  <div className="wiz-step">Step {wizard.i + 1} of {wizard.steps.length}</div>
                  {wizard.type === 'dir' ? (
                    <>
                      <p className="big">Motor {wizardMotor.num} ({wizardMotor.posName}) should spin <span className="hl">{wizardMotor.dir === 'CW' ? 'clockwise' : 'counter-clockwise'}</span>.</p>
                      <p>It’s spinning at {WIZARD_PCT}%. Look down from above, or hold a strip of tape to the bell.</p>
                    </>
                  ) : (
                    <>
                      <p className="big">Which motor is spinning? <span className="hl">Click it on the diagram.</span></p>
                      <p>ArduPilot is spinning motor {wizardMotor.num} at {WIZARD_PCT}%.</p>
                    </>
                  )}
                  {v.isVirtual && (
                    <p className="virtual-note">Virtual bench: {physical ? `the ${POSITIONS.find((p) => p.key === physical.pos).name} motor is spinning ${physical.dir === 'CW' ? 'clockwise' : 'counter-clockwise'}.` : 'nothing is spinning. Click Spin again.'}</p>
                  )}
                  <div className="btns">
                    {wizard.type === 'dir' && <>
                      <button type="button" className="btn-yellow" onClick={() => answerDirection(true)}>Correct</button>
                      <button type="button" className="btn-grey" onClick={() => answerDirection(false)}>Wrong way, reverse it</button>
                    </>}
                    <button type="button" className="btn-grey" onClick={() => setWizard({ ...wizard, started: Date.now() })}>Spin again</button>
                    <button type="button" className="btn-grey" onClick={() => setWizard(null)}>Cancel</button>
                  </div>
                </>
              )}
            </Panel>
          )}

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
              <NumField label="Motor poles" value={value('SERVO_BLH_POLES')} onCommit={(x) => stage('SERVO_BLH_POLES', Math.round(x), 'Motor poles')} />
            </Row>
            <Row label="Motor Idle (%)" qual="on the ground, armed" param={`MOT_SPIN_ARM ${value('MOT_SPIN_ARM')?.toFixed(3)}`} note={spinArm > spinMin ? '⚠ higher than the in-flight idle' : 'fraction, not percent'} help="arm" up changed={pending.MOT_SPIN_ARM}>
              <NumField label="Motor idle on the ground, percent" value={spinArm} step={0.5} suffix="%" onCommit={(x) => stage('MOT_SPIN_ARM', Math.round(x * 10) / 1000, 'Idle on the ground')} />
            </Row>
            <Row label="Motor Idle (%)" qual="in flight" param={`MOT_SPIN_MIN ${value('MOT_SPIN_MIN')?.toFixed(3)}`} note="must be ≥ MOT_SPIN_ARM" help="min" up changed={pending.MOT_SPIN_MIN}>
              <NumField label="Motor idle in flight, percent" value={spinMin} step={0.5} suffix="%" onCommit={(x) => stage('MOT_SPIN_MIN', Math.round(x * 10) / 1000, 'Idle in flight')} />
            </Row>
            <Row kind="ap" label="Motor spin max" param={`MOT_SPIN_MAX ${value('MOT_SPIN_MAX')?.toFixed(3)}`} note="no Betaflight equivalent" help="max" up changed={pending.MOT_SPIN_MAX}>
              <NumField label="Motor spin max, percent" value={pct('MOT_SPIN_MAX')} step={0.5} suffix="%" onCommit={(x) => stage('MOT_SPIN_MAX', Math.round(x * 10) / 1000, 'Spin max')} />
            </Row>
          </Panel>
        </div>

        {/* ---------------- right column ---------------- */}
        <div className="col">
          <RpmGraph v={v} layout={layout} params={params} />

          {layout && (
            <div className="sliders">
              {layout.motors.map((m) => {
                const e = telem(m);
                const val = slider.motor === m.num ? slider.value : 0;
                return (
                  <div key={m.num} className="slider-col">
                    <button type="button" className="slider-head" onClick={() => setSel(m.num)}>{m.num}{bfNums && <small> BF {m.bf}</small>}</button>
                    <div className={`valbox ${sel === m.num ? 'sel' : ''} ${val > 0 ? 'live' : ''}`}>{val}%</div>
                    <div className="stats">RPM: {e ? e.rpm : '—'}<br />Amps: {e ? e.current.toFixed(2) : '—'}<br />Temp: {e ? e.temp + '°C' : '—'}</div>
                    <input
                      className="vslider"
                      type="range" min="0" max={MAX_TEST_PCT} step="1"
                      value={val}
                      disabled={!canSpin || !!wizard}
                      aria-label={`Motor ${m.num} throttle`}
                      onChange={(ev) => moveSlider(m.num, Number(ev.target.value))}
                    />
                    <div className="slider-val">{val}%</div>
                  </div>
                );
              })}
              <div className="slider-col">
                <div className="slider-head"><Help id="master" up /></div>
                <div className="valbox">{master}%</div>
                <div className="stats"><button type="button" className="btn-yellow small" onClick={runMaster} disabled={!canSpin || !master || !!wizard}>Run A→D</button></div>
                <input className="vslider" type="range" min="0" max={MAX_TEST_PCT} step="1" value={master} disabled={!canSpin || !!wizard} aria-label="Master throttle" onChange={(e) => setMaster(Number(e.target.value))} />
                <div className="slider-val"><b>Master</b></div>
              </div>
            </div>
          )}

          <section className="notice" aria-label="Motor test notice">
            <div className="notice-title">Motor Test Mode / Arming Notice:</div>
            <div className="notice-warn">WARNING: Remove all propellers before testing motors.</div>
            <ul>
              <li>Throttle is capped at {MAX_TEST_PCT}%.</li>
              <li>ArduPilot spins one motor at a time.</li>
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
