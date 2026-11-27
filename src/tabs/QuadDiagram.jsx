// The top-view quad picture used on the Motors tab and in the Motor order and
// Motor direction dialogs. Each motor is a button; callers decide what
// clicking, pressing and releasing do.

// Spin-direction arrows around each motor, like the ArduPilot docs: two arcs
// (top and bottom) with arrowheads. Drawn clockwise; CSS mirrors them for CCW.
// Angles are in screen degrees, 0 = right, increasing clockwise.
const SPIN_ARROWS = (() => {
  const c = 50;
  const r = 44;
  const f = (n) => n.toFixed(1);
  const at = (deg) => [c + r * Math.cos((deg * Math.PI) / 180), c + r * Math.sin((deg * Math.PI) / 180)];
  return [[200, 320], [20, 140]].map(([from, to]) => {
    const [x1, y1] = at(from);
    const [x2, y2] = at(to);
    const t = (to * Math.PI) / 180;
    const ahead = [-Math.sin(t), Math.cos(t)]; // direction of travel at the arc's end
    const out = [Math.cos(t), Math.sin(t)]; // pointing away from the motor
    const tip = [x2 + ahead[0] * 9, y2 + ahead[1] * 9];
    const a = [x2 + out[0] * 6, y2 + out[1] * 6];
    const b = [x2 - out[0] * 6, y2 - out[1] * 6];
    return {
      arc: `M${f(x1)} ${f(y1)} A${r} ${r} 0 0 1 ${f(x2)} ${f(y2)}`,
      head: [tip, a, b].map((p) => p.map(f).join(',')).join(' '),
    };
  });
})();

// Arrows showing `dir`. While `spinning`, they rotate that way.
export function SpinArrows({ dir, spinning }) {
  const cls = ['spin-arrows', dir === 'CW' ? 'cw' : 'ccw'];
  if (spinning) cls.push('spinning');
  return (
    <svg className={cls.join(' ')} viewBox="0 0 100 100" aria-hidden="true">
      <g className="turn">
        {SPIN_ARROWS.map((s, i) => (
          <g key={i}><path d={s.arc} /><polygon points={s.head} /></g>
        ))}
      </g>
    </svg>
  );
}

// The app's own picture of the quad. It always shows what the FC expects and
// commands, never what the physical drone does: the user compares it with
// the real drone and corrects the drone in the app.
// motors: layout.motors. spinning: motor numbers the app is commanding to spin
// right now; their arrows rotate the way that motor should turn. Optional:
//   classFor(m) extra CSS classes, labelFor(m) aria-label, body(m) custom
//   contents instead of number + letter, onClick(m), onPress(m), onRelease(m)
//   (press/release are for hold-to-spin; they also work with Space/Enter).
// Keep receiving pointer events after the pointer slides off a held button,
// so releasing anywhere stops the motor.
export function capture(e) {
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not a capturable pointer */ }
}

//   arrows={false} hides the spin-direction arrows.
export function QuadDiagram({ motors, spinning = [], bfNums, classFor, labelFor, body, onClick, onPress, onRelease, arrows = true }) {
  const press = (m) => onPress && onPress(m);
  const release = (m) => onRelease && onRelease(m);
  return (
    <div className="quad" aria-label="Frame diagram">
      <svg width="300" height="280" viewBox="0 0 300 280" aria-hidden="true">
        <line x1="80" y1="70" x2="220" y2="210" stroke="#BDBDBD" strokeWidth="22" strokeLinecap="round" />
        <line x1="220" y1="70" x2="80" y2="210" stroke="#BDBDBD" strokeWidth="22" strokeLinecap="round" />
        <path d="M150 112 l-16 22 h10 v30 h12 v-30 h10 z" fill="#E5322D" />
      </svg>
      {motors.map((m) => {
        return (
          <button
            key={m.pos}
            type="button"
            className={`motor-btn ${classFor ? classFor(m) : ''}`}
            style={{ left: m.x - 34, top: m.y - 34 }}
            aria-label={labelFor ? labelFor(m) : `Motor ${m.num}, ${m.posName}, ${m.dir}`}
            onClick={onClick ? () => onClick(m) : undefined}
            onPointerDown={onPress ? (e) => { capture(e); press(m); } : undefined}
            onPointerUp={onRelease ? () => release(m) : undefined}
            onPointerCancel={onRelease ? () => release(m) : undefined}
            onLostPointerCapture={onRelease ? () => release(m) : undefined}
            onKeyDown={onPress ? (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(m); } : undefined}
            onKeyUp={onRelease ? (e) => { if (e.key === ' ' || e.key === 'Enter') release(m); } : undefined}
            onBlur={onRelease ? () => release(m) : undefined}
          >
            {body ? body(m) : (
              <>
                <span className="motor-num">{m.num}</span>
                {bfNums && <span className="motor-bf">BF {m.bf}</span>}
                <span className="motor-letter">{m.letter} · {m.dir}</span>
              </>
            )}
            {arrows && <SpinArrows dir={m.dir} spinning={spinning.includes(m.num)} />}
          </button>
        );
      })}
    </div>
  );
}

// Virtual mode only: a small stand-in for the real drone on the bench, kept
// apart from the app's picture and clearly labeled. It shows what the virtual
// "hardware" really does: which arm spins and which way (which may be wrong,
// e.g. after a frame change, just like a real drone). physical: v.physical.
export function VirtualDrone({ motors, physical }) {
  return (
    <div className="virtual-drone">
      <div className="quad quad-small" aria-label="Virtual drone">
        <svg width="300" height="280" viewBox="0 0 300 280" aria-hidden="true">
          <line x1="80" y1="70" x2="220" y2="210" stroke="#BDBDBD" strokeWidth="22" strokeLinecap="round" />
          <line x1="220" y1="70" x2="80" y2="210" stroke="#BDBDBD" strokeWidth="22" strokeLinecap="round" />
          <path d="M150 112 l-16 22 h10 v30 h12 v-30 h10 z" fill="#E5322D" />
        </svg>
        {motors.map((m) => {
          const real = (physical || []).find((p) => p.pos === m.pos);
          return (
            <span
              key={m.pos}
              role="img"
              data-pos={m.pos}
              aria-label={`${m.posName} motor${real ? `, spinning ${real.dir === 'CW' ? 'clockwise' : 'counter-clockwise'}` : ''}`}
              className={`motor-btn ${real ? 'bench-spinning' : ''}`}
              style={{ left: m.x - 34, top: m.y - 34 }}
            >
              {real && <SpinArrows dir={real.dir} spinning />}
            </span>
          );
        })}
      </div>
      <p className="small muted">Virtual drone: stands in for the real drone on your bench. Compare it with the picture, like you would the real drone.</p>
    </div>
  );
}
