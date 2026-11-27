// "Motor direction": Betaflight Configurator's Motor direction dialog, for ArduPilot.
//
// Same layout as Betaflight (src/components/dialogs/EscDshotDirectionDialog.vue):
// safety switch, then two ways in:
//   Wizard:       start / spin all motors at once, click the number of any
//                 motor spinning the wrong way to flip it, stop.
//   Individually: press and hold a motor to spin it, then pick Normal or Reverse.
//
// One ArduPilot difference (from ArduPilot's source, see README): direction is
// the FC parameter SERVO_BLH_RVMASK, which ArduPilot sends to the ESCs only at
// startup (AP_BLHeli::init), so a change takes effect after Save and reboot
// instead of the moment you click. Betaflight sends it to the ESC directly.
import { useEffect, useRef, useState } from 'react';
import { QuadDiagram, VirtualDrone, capture } from './QuadDiagram.jsx';
import { useSpin } from './useSpin.js';
import { reversedMotors, maskWith, outputForMotor } from '../wizards.js';
import { Toggle } from '../components.jsx';

const SPIN_PCT = 8;

export default function MotorDirectionDialog({ v, layout, params, onClose }) {
  const ref = useRef(null);
  const [agreed, setAgreed] = useState(false);
  const [mode, setMode] = useState(null); // null (start screen) | 'wizard' | 'individual'
  const [reversed, setReversed] = useState(() => reversedMotors(layout, params));
  const [wizardOn, setWizardOn] = useState(false); // wizard: all motors spinning
  const [selected, setSelected] = useState(null); // individually: motor number, or 'all'
  const [held, setHeld] = useState(null); // individually: motor number (or 'all') held down
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const motors = [...layout.motors].sort((a, b) => a.num - b.num);
  const isDshot = params.MOT_PWM_TYPE >= 4 && params.MOT_PWM_TYPE <= 7;
  const start = reversedMotors(layout, params);
  const newMask = maskWith(layout, params, reversed);
  const oldMask = params.SERVO_BLH_RVMASK || 0;
  const changed = motors.filter((m) => reversed[m.num] !== start[m.num]);

  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  useEffect(() => { if (!v.connected) onClose(); }, [v.connected, onClose]);

  // Wizard: every motor at once. Individually: the one held down.
  const spinning = mode === 'wizard' && wizardOn ? motors.map((m) => m.num)
    : mode === 'individual' && held === 'all' ? motors.map((m) => m.num)
      : mode === 'individual' && held ? [held] : [];
  const kick = useSpin(v, () => (spinning.length
    ? motors.map((m) => ({ seq: m.testSeq, pct: spinning.includes(m.num) ? SPIN_PCT : 0 }))
    : null), setError);
  const spinKey = spinning.join(',');
  useEffect(() => { kick(); }, [spinKey, kick]);

  function toggle(num) { setReversed((r) => ({ ...r, [num]: !r[num] })); }

  async function save() {
    setSaving(true);
    setWizardOn(false);
    setHeld(null);
    try {
      if (newMask !== oldMask) {
        await v.setParam('SERVO_BLH_RVMASK', newMask);
        await v.reboot();
      }
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const footer = (
    <>
      <h4 className="dialog-hint">Changes to write</h4>
      <ul className="dialog-changes">
        {newMask === oldMask ? <li>None yet. Nothing will be written.</li> : (
          <li>
            <span className="mono">SERVO_BLH_RVMASK {oldMask} → {newMask}</span>:{' '}
            {changed.map((m) => `motor ${m.num} (output ${outputForMotor(params, m.num)}) ${reversed[m.num] ? 'reversed' : 'back to normal'}`).join(', ')}
          </li>
        )}
      </ul>
      <div className="dialog-info">Direction changes take effect after <b>Save and reboot</b> (ArduPilot applies them at startup).</div>
      {error && <p className="notice-warn">Motor test: {error}</p>}
      <div className="btns">
        <button type="button" className="btn-yellow" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : changed.length ? 'Save and reboot' : 'Save'}
        </button>
        <span className="spacer" />
        <button type="button" className="btn-grey" onClick={onClose} disabled={saving}>Close</button>
      </div>
    </>
  );

  return (
    <dialog ref={ref} className="bf-dialog" aria-labelledby="dir-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <h3 id="dir-title">Motor Direction - <i className="neg">Warning: Ensure props are removed!</i></h3>

      {!isDshot ? (
        <>
          <p className="notice-warn">Feature works with DSHOT ESCs only. Set the ESC/Motor protocol to DSHOT on the Motors tab, then Write and Reboot.</p>
          <div className="btns"><button type="button" className="btn-grey" onClick={onClose}>Close</button></div>
        </>
      ) : !mode ? (
        <>
          <div className="dialog-safety">
            <b>Safety notice</b><br />
            <b className="neg"><i>Remove all propellers to prevent injury!</i></b><br />
            The motors will <b>spin up</b> immediately when selected!
          </div>
          <label className="notice-toggle">
            <Toggle label="I understand the risks, all propellers are removed" checked={agreed} onChange={setAgreed} />
            <span><b>I understand the risks</b>, all propellers are removed.</span>
          </label>
          <div className="dialog-info">
            <b>Information notice</b><br />
            To change the motor directions, the battery must be plugged in and the ESC protocol must be DSHOT.
            ArduPilot reverses motors with <span className="mono">SERVO_BLH_RVMASK</span>; not all DShot ESCs support it. Check your ESC firmware.
          </div>
          {agreed && (
            <div className="dialog-start">
              <div>
                <button type="button" className="btn-yellow" onClick={() => setMode('wizard')}>Wizard</button>
                <p className="small muted">Spins all motors, then lets you choose which to reverse.</p>
              </div>
              <div>
                <button type="button" className="btn-yellow" onClick={() => setMode('individual')}>Individually</button>
                <p className="small muted">Set motor spin direction by selecting and spinning each motor individually.</p>
              </div>
            </div>
          )}
          <div className="btns right-end"><button type="button" className="btn-grey" onClick={onClose}>Close</button></div>
        </>
      ) : (
        <>
          {v.isVirtual && <VirtualDrone motors={layout.motors} physical={v.physical} />}
          <QuadDiagram
            motors={layout.motors}
            spinning={spinning}
            classFor={(m) => (spinning.includes(m.num) ? 'active' : '')}
            labelFor={(m) => `Motor ${m.num}, ${m.posName}, should spin ${m.dir}`}
          />

          {mode === 'wizard' && (
            <>
              {!wizardOn ? (
                <div className="btns center-row"><button type="button" className="btn-yellow" onClick={() => setWizardOn(true)}>Start / spin motors</button></div>
              ) : (
                <>
                  <h4 className="dialog-hint">Click on motor numbers individually to change spin direction</h4>
                  <h4 className="dialog-hint muted">Verify all motors are spinning the way the arrows point. A click is saved with <b>Save and reboot</b>; until then the motor keeps spinning the old way (ArduPilot applies direction at startup).</h4>
                </>
              )}
              <div className="motor-choice">
                {motors.map((m) => (
                  <button
                    key={m.num}
                    type="button"
                    className={`choice ${reversed[m.num] ? 'on' : ''} ${spinning.includes(m.num) ? 'live' : ''}`}
                    aria-pressed={!!reversed[m.num]}
                    onClick={() => toggle(m.num)}
                  >
                    {m.num}<small>{reversed[m.num] ? 'Reversed' : 'Normal'}</small>
                  </button>
                ))}
              </div>
              {wizardOn && <div className="btns center-row"><button type="button" className="btn-red" onClick={() => setWizardOn(false)}>Stop motors</button></div>}
            </>
          )}

          {mode === 'individual' && (
            <>
              <h4 className={`dialog-hint ${held ? 'neg' : ''}`}>{held ? 'Release button to stop' : 'Select a motor (press and hold to spin it)'}</h4>
              <h4 className="dialog-hint muted">Motors will spin when selected!</h4>
              <div className="motor-choice">
                {[...motors.map((m) => m.num), 'all'].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`choice ${selected === n ? 'on' : ''} ${held === n ? 'live' : ''}`}
                    onPointerDown={(e) => { capture(e); setSelected(n); setHeld(n); }}
                    onPointerUp={() => setHeld(null)}
                    onPointerCancel={() => setHeld(null)}
                    onLostPointerCapture={() => setHeld(null)}
                    onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { setSelected(n); setHeld(n); } }}
                    onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') setHeld(null); }}
                    onBlur={() => setHeld(null)}
                  >
                    {n === 'all' ? 'All' : n}<small>{n === 'all' ? 'motors' : reversed[n] ? 'Reversed' : 'Normal'}</small>
                  </button>
                ))}
              </div>
              {selected && (() => {
                const nums = selected === 'all' ? motors.map((m) => m.num) : [selected];
                const allRev = nums.every((n) => reversed[n]);
                const allNorm = nums.every((n) => !reversed[n]);
                const setAll = (rev) => setReversed((r) => ({ ...r, ...Object.fromEntries(nums.map((n) => [n, rev])) }));
                return (
                  <>
                    <h4 className="dialog-hint">Change direction of {selected === 'all' ? 'all motors' : `motor ${selected}`}</h4>
                    <div className="motor-choice">
                      <button type="button" className={`choice ${allNorm ? 'on' : ''}`} aria-pressed={allNorm} onClick={() => setAll(false)}>Normal</button>
                      <button type="button" className={`choice ${allRev ? 'on' : ''}`} aria-pressed={allRev} onClick={() => setAll(true)}>Reverse</button>
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {footer}
        </>
      )}
    </dialog>
  );
}
