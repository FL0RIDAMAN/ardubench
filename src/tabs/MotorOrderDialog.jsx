// "Motor order": Betaflight Configurator's Reorder motors dialog, for ArduPilot.
//
// Same flow as Betaflight (src/components/dialogs/MotorOutputReorderingDialog.vue):
// safety switch -> Start -> each motor "jerks" in turn (motor 1, 2, 3, 4) and
// you click the arm that's moving -> press and hold an arm to check it ->
// Save (writes and reboots) or Start over. Any key except navigation keys
// stops the motors and goes back to the start; Esc closes.
//
// Betaflight remaps motors with its own reordering table. ArduPilot does it
// with SERVOn_FUNCTION (which output drives Motor 1-4), which needs a reboot.
import { useEffect, useRef, useState } from 'react';
import { QuadDiagram, VirtualDrone } from './QuadDiagram.jsx';
import { useSpin } from './useSpin.js';
import { orderChanges } from '../wizards.js';
import { MOTOR_FUNCTION_BASE } from '../frames.js';
import { Toggle } from '../components.jsx';

const SPIN_PCT = 8;
const JERK_ON_MS = 250; // Betaflight's jerk rhythm: 250 ms on, 500 ms off
const JERK_OFF_MS = 500;
const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Shift', ' ', 'Enter', 'Escape'];

export default function MotorOrderDialog({ v, layout, params, onClose }) {
  const ref = useRef(null);
  const [agreed, setAgreed] = useState(false);
  const [stage, setStage] = useState('warning'); // warning | picking | done | saving
  const [picks, setPicks] = useState({}); // motor number -> arm (FR/RR/RL/FL) it was seen spinning on
  const [held, setHeld] = useState(null); // arm held down to check it (done stage)
  const [error, setError] = useState('');

  const motors = [...layout.motors].sort((a, b) => a.num - b.num); // spun in motor-number order, like Betaflight
  const current = stage === 'picking' ? motors.find((m) => !picks[m.num]) : null;
  const pickedArms = Object.values(picks);
  const result = stage === 'done' || stage === 'saving' ? orderChanges(layout, params, picks) : null;

  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  useEffect(() => { if (!v.connected) onClose(); }, [v.connected, onClose]);

  // Jerk the current motor: a short burst, then 0% (the motor stops but the
  // test keeps running), repeat. Every command has a 1 s timeout, so a frozen
  // app still stops the motor within a second.
  const currentSeq = current ? current.testSeq : null;
  useEffect(() => {
    if (currentSeq == null) return undefined;
    let timer;
    const pulse = () => {
      v.motorTest(currentSeq, SPIN_PCT, 1).then(() => setError(''), (e) => setError(e.message));
      timer = setTimeout(() => {
        v.motorTest(currentSeq, 0, 1).catch(() => {});
        timer = setTimeout(pulse, JERK_OFF_MS);
      }, JERK_ON_MS);
    };
    pulse();
    return () => { clearTimeout(timer); v.motorStop(currentSeq); };
  }, [v, currentSeq]);

  // Done: press and hold an arm to spin the motor you said is on it.
  const kick = useSpin(v, () => {
    if (stage !== 'done' || !held) return null;
    const m = motors.find((x) => picks[x.num] === held);
    return m ? { seq: m.testSeq, pct: SPIN_PCT } : null;
  }, setError);
  useEffect(() => { kick(); }, [held, kick]);

  // Emergency stop: any key except navigation stops everything and goes back
  // to the safety screen (Betaflight does the same).
  useEffect(() => {
    if (stage !== 'picking' && stage !== 'done') return undefined;
    const onKey = (e) => {
      if (NAV_KEYS.includes(e.key)) return;
      setHeld(null);
      setPicks({});
      setAgreed(false);
      setStage('warning');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);

  function start() { setPicks({}); setHeld(null); setError(''); setStage('picking'); }

  function pickArm(m) {
    if (!current || pickedArms.includes(m.pos)) return;
    const next = { ...picks, [current.num]: m.pos };
    setPicks(next);
    if (Object.keys(next).length === motors.length) setStage('done');
  }

  async function save() {
    if (!result || result.error) return;
    setStage('saving');
    try {
      for (const [name, value] of Object.entries(result.changes)) await v.setParam(name, value);
      if (Object.keys(result.changes).length) await v.reboot();
      onClose();
    } catch (e) {
      setError(e.message);
      setStage('done');
    }
  }

  const posName = Object.fromEntries(layout.motors.map((m) => [m.pos, m.posName]));
  const motorAt = Object.fromEntries(layout.motors.map((m) => [m.pos, m.num]));

  return (
    <dialog ref={ref} className="bf-dialog" aria-labelledby="order-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <h3 id="order-title">Motor order</h3>

      {stage === 'warning' && (
        <>
          <div className="dialog-safety">
            <b>Safety notice</b><br />
            <b className="neg">Remove all propellers to prevent injury!</b><br />
            The motors will <b>spin up!</b>
          </div>
          <label className="notice-toggle">
            <Toggle label="I understand the risks, the propellers are removed" checked={agreed} onChange={setAgreed} />
            <span><b>I understand the risks</b>, the propellers are removed.</span>
          </label>
          <div className="dialog-info">
            <b>Information notice</b><br />
            Motors will spin up one by one and you will be able to select which motor is spinning.
            The battery should be plugged in and the correct ESC protocol set. This rearranges the
            outputs already set to Motor 1–4. Saving writes <span className="mono">SERVOn_FUNCTION</span> and reboots the FC.
          </div>
          <div className="btns">
            {agreed && <button type="button" className="btn-yellow" onClick={start}>Start</button>}
            <button type="button" className="btn-grey" onClick={onClose}>Cancel</button>
          </div>
        </>
      )}

      {stage !== 'warning' && (
        <>
          {v.isVirtual && (stage === 'picking' || stage === 'done') && (
            <VirtualDrone motors={layout.motors} physical={v.physical} />
          )}
          {/* The picture you click never animates: you're watching the real drone (Betaflight's Reorder motors is the same). */}
          <QuadDiagram
            motors={layout.motors}
            arrows={stage !== 'picking'}
            classFor={(m) => [
              stage === 'picking' && !pickedArms.includes(m.pos) ? 'pickable' : '',
              stage === 'picking' && pickedArms.includes(m.pos) ? 'picked' : '',
              held === m.pos ? 'active' : '',
            ].join(' ')}
            labelFor={(m) => (stage === 'picking'
              ? `${m.posName} arm${pickedArms.includes(m.pos) ? ', already picked' : ''}`
              : `Hold to spin the ${m.posName} motor`)}
            body={(m) => (stage === 'picking'
              ? <span className="motor-num">{pickedArms.includes(m.pos) ? '✓' : ''}</span>
              : <><span className="motor-num">{m.num}</span><span className="motor-letter">{m.letter} · {m.dir}</span></>)}
            onClick={stage === 'picking' ? pickArm : undefined}
            onPress={stage === 'done' ? (m) => setHeld(m.pos) : undefined}
            onRelease={stage === 'done' ? () => setHeld(null) : undefined}
          />

          {stage === 'picking' && current && (
            <h4 className="dialog-hint">Click on the spinning motor… <span className="muted">(motor {current.num} of {motors.length})</span></h4>
          )}

          {(stage === 'done' || stage === 'saving') && result && (
            <>
              <h4 className="dialog-hint">Ready! Check the motors spinning order by pressing and holding each motor in the image.</h4>
              {result.error ? <p className="notice-warn">{result.error}</p> : (
                <ul className="dialog-changes">
                  {Object.keys(result.changes).length === 0 && <li>Every motor is already in the right place. Nothing to change.</li>}
                  {Object.entries(result.changes).map(([name, fn]) => {
                    const motor = fn - MOTOR_FUNCTION_BASE;
                    const arm = Object.keys(motorAt).find((p) => motorAt[p] === motor);
                    return (
                      <li key={name}>
                        <span className="mono">{name} {params[name]} → {fn}</span>: output {name.match(/\d+/)[0]} drives the {posName[arm]} motor (Motor {motor})
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="btns">
                <button type="button" className="btn-yellow" onClick={save} disabled={stage === 'saving' || !!result.error}>
                  {stage === 'saving' ? 'Saving…' : Object.keys(result.changes || {}).length ? 'Save and reboot' : 'Save'}
                </button>
                <button type="button" className="btn-grey" onClick={start} disabled={stage === 'saving'}>Start over</button>
              </div>
            </>
          )}

          {error && <p className="notice-warn">Motor test: {error}</p>}
          <div className="btns right-end">
            <button type="button" className="btn-grey" onClick={onClose} disabled={stage === 'saving'}>Close</button>
          </div>
        </>
      )}
    </dialog>
  );
}
