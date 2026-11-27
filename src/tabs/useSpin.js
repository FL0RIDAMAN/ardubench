import { useCallback, useEffect, useRef } from 'react';

// Keeps motors spinning while want() says so. want() returns a list of
// { seq, pct } (one entry per motor; pct 0 = that motor stopped while others
// spin), a single { seq, pct }, or null / [] to stop everything.
//
// Same safety pattern everywhere: short (1 s) ArduPilot motor tests re-sent
// every 0.5 s, so if the app freezes or the cable comes out, every motor
// stops within a second. Several motors can spin at once because during a
// motor test ArduPilot only rewrites the motor in each command; the others
// keep their last value (ArduCopter/motors.cpp, motor_test.cpp; Mission
// Planner's "Test all motors" works the same way).
//
// Returns kick(): call it right after what's wanted changes (a button press
// or release) so the change goes out now instead of on the next tick.
export function useSpin(v, want, onError) {
  const wantRef = useRef(want);
  wantRef.current = want;
  const errRef = useRef(onError);
  errRef.current = onError;
  const running = useRef(false);

  const tick = useCallback(() => {
    const w = wantRef.current();
    const list = !w ? [] : Array.isArray(w) ? w : [w];
    if (list.some((x) => x.pct > 0)) {
      running.current = true;
      for (const x of list) {
        v.motorTest(x.seq, x.pct, 1).then(() => errRef.current && errRef.current(''), (e) => errRef.current && errRef.current(e.message));
      }
    } else if (running.current) {
      v.motorStop(1); // timeout 0 ends the whole test: every motor stops
      running.current = false;
    }
  }, [v]);

  useEffect(() => {
    const t = setInterval(tick, 500);
    return () => {
      clearInterval(t);
      if (running.current) v.motorStop(1);
      running.current = false;
    };
  }, [v, tick]);

  return tick;
}
