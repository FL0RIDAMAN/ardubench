import { getLayout } from '../src/frames.js';
import { orderChanges, directionMask, reversedMotors, maskWith } from '../src/wizards.js';
let fail = 0;
const eq = (a, b, msg) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log((ok ? 'ok   ' : 'FAIL ') + msg, ok ? '' : JSON.stringify(a)); if (!ok) fail++; };
const L = getLayout(1, 1);
eq(L.motors.map((m) => [m.num, m.pos, m.letter, m.dir]), [[1,'FR','A','CCW'],[2,'RL','C','CCW'],[3,'FL','D','CW'],[4,'RR','B','CW']], 'Quad X layout + test letters');
const P = { SERVO1_FUNCTION: 33, SERVO2_FUNCTION: 34, SERVO3_FUNCTION: 35, SERVO4_FUNCTION: 36, SERVO_BLH_RVMASK: 0 };
// virtual quad: motor2 (out2) seen at RR, motor4 (out4) seen at RL
eq(orderChanges(L, P, { 1: 'FR', 2: 'RR', 3: 'FL', 4: 'RL' }), { changes: { SERVO2_FUNCTION: 36, SERVO4_FUNCTION: 34 } }, 'order fix swaps outputs 2 and 4');
eq(orderChanges(L, P, { 1: 'FR', 2: 'RL', 3: 'FL', 4: 'RR' }), { changes: {} }, 'correct wiring: no changes');
eq(orderChanges(L, P, { 1: 'FR', 2: 'FR', 3: 'FL', 4: 'RR' }).error ? 'err' : 'none', 'err', 'duplicate pick rejected');
eq(directionMask(L, P, { 1: true, 2: true, 3: false, 4: true }), 4, 'reverse motor 3 -> bit 2');
eq(directionMask(L, { ...P, SERVO_BLH_RVMASK: 4 }, { 3: false }), 0, 'reversing again clears the bit');
const B = getLayout(1, 12);
eq(B.motors.map((m) => [m.num, m.pos, m.letter]), [[1,'RR','B'],[2,'FR','A'],[3,'RL','C'],[4,'FL','D']], 'BetaFlightX layout');
// Motor direction dialog: read and set reversal per motor, through the output each motor is on.
eq(reversedMotors(L, { ...P, SERVO_BLH_RVMASK: 4 }), { 1: false, 2: false, 3: true, 4: false }, 'bit 2 = motor 3 reversed');
const swapped = { ...P, SERVO2_FUNCTION: 36, SERVO4_FUNCTION: 34, SERVO_BLH_RVMASK: 2 };
eq(reversedMotors(L, swapped), { 1: false, 2: false, 3: false, 4: true }, 'after remap, bit 1 (output 2) = motor 4');
eq(maskWith(L, P, { 1: false, 2: false, 3: true, 4: false }), 4, 'reverse motor 3 -> mask 4');
eq(maskWith(L, swapped, { 4: false, 2: true }), 8, 'set by motor, not output: motor 4 normal, motor 2 (output 4) reversed');
eq(maskWith(L, { ...P, SERVO_BLH_RVMASK: 0x30 }, { 1: true }), 0x31, 'non-motor output bits are kept');
console.log(fail ? `FAILED ${fail}` : 'OK: wizards');
process.exit(fail ? 1 : 0);
