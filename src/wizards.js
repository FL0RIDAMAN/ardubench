// The math behind the Motor order and Motor direction wizards.
// Kept separate from the screens so it can be tested on its own.

import { MOTOR_FUNCTION_BASE } from './frames.js';

// Which output (1-based) is assigned to ArduPilot motor number m.
export function outputForMotor(params, m, maxOutputs = 16) {
  for (let o = 1; o <= maxOutputs; o++) {
    if (params['SERVO' + o + '_FUNCTION'] === MOTOR_FUNCTION_BASE + m) return o;
  }
  return null;
}

// Order wizard.
// picks: { motorNumber: positionKey } — for each motor we spun, where the
// user saw a motor move. Returns the SERVOn_FUNCTION changes that make each
// output drive the motor number that belongs at its physical position.
export function orderChanges(layout, params, picks) {
  const motorAtPos = Object.fromEntries(layout.motors.map((m) => [m.pos, m.num]));
  const usedPositions = new Set();
  const changes = {};
  for (const m of layout.motors) {
    const pos = picks[m.num];
    if (!pos) return { error: `No answer for motor ${m.num}.` };
    if (usedPositions.has(pos)) return { error: 'The same arm was picked twice. Run the wizard again.' };
    usedPositions.add(pos);
    const out = outputForMotor(params, m.num);
    if (!out) return { error: `No output is set to Motor${m.num}.` };
    const want = MOTOR_FUNCTION_BASE + motorAtPos[pos];
    const name = 'SERVO' + out + '_FUNCTION';
    if (params[name] !== want) changes[name] = want;
  }
  return { changes };
}

// Direction wizard.
// answers: { motorNumber: true if it spun the right way, false if not }.
// Returns the new SERVO_BLH_RVMASK: one bit per output, set = reversed.
export function directionMask(layout, params, answers) {
  let mask = params.SERVO_BLH_RVMASK || 0;
  for (const m of layout.motors) {
    if (answers[m.num] === false) {
      const out = outputForMotor(params, m.num);
      if (out) mask ^= 1 << (out - 1);
    }
  }
  return mask;
}

// Motor direction dialog.
// Which motors are reversed now: { motorNumber: true/false }, read from the
// SERVO_BLH_RVMASK bit of the output each motor is on.
export function reversedMotors(layout, params) {
  const mask = params.SERVO_BLH_RVMASK || 0;
  const out = {};
  for (const m of layout.motors) {
    const o = outputForMotor(params, m.num);
    out[m.num] = !!o && ((mask >> (o - 1)) & 1) === 1;
  }
  return out;
}

// The SERVO_BLH_RVMASK that reverses exactly the motors marked true in
// `reversed` ({ motorNumber: true/false }). Bits of non-motor outputs are kept.
export function maskWith(layout, params, reversed) {
  let mask = params.SERVO_BLH_RVMASK || 0;
  for (const m of layout.motors) {
    const o = outputForMotor(params, m.num);
    if (!o || reversed[m.num] === undefined) continue;
    if (reversed[m.num]) mask |= 1 << (o - 1);
    else mask &= ~(1 << (o - 1));
  }
  return mask;
}
