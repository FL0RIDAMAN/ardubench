// Bench test: for every supported frame, does each motor slider spin the
// motor the diagram says it will, the way the diagram says it should?
//
// Runs on two virtual quads, all frames in parallel:
//   - the app's virtual quad: a correctly built QUAD X, and
//   - a mis-soldered quad (outputs 2 and 4 swapped, front-left motor backwards).
// For each quad and frame: set the frame, write, reboot; run the Motor order
// dialog's math on what "the bench" shows, write, reboot; run the Motor
// direction dialog's math (flip every motor seen spinning the wrong way),
// write, reboot; then every slider must spin its own arm the right way.
// On the correct quad's own frame, both tools must change nothing.
import { Vehicle } from '../src/vehicle.js';
import { VirtualLink, CORRECT_WIRING } from '../src/link/VirtualLink.js';
import { getLayout, SUPPORTED_FRAME_TYPES } from '../src/frames.js';
import { orderChanges, reversedMotors, maskWith } from '../src/wizards.js';

const MISWIRED = {
  1: { pos: 'FR', dir: 'CCW' }, 2: { pos: 'RR', dir: 'CW' }, 3: { pos: 'FL', dir: 'CCW' }, 4: { pos: 'RL', dir: 'CCW' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const logs = {};
const check = (ok, msg, key) => { (logs[key] ||= []).push((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };
const paramsOf = (v) => Object.fromEntries([...v.params].map(([k, p]) => [k, p.value]));

// Spin one motor the way a slider does (by test sequence) and report what the bench shows.
async function spin(v, m) {
  await v.motorTest(m.testSeq, 8, 1);
  await sleep(250);
  const seen = v.physical.length === 1 ? { ...v.physical[0] } : null;
  await v.motorStop(m.testSeq);
  await sleep(150);
  return seen;
}

async function reboot(v) {
  await v.reboot();
  for (let i = 0; i < 80 && (v.rebooting || !v.paramsLoaded); i++) await sleep(100);
  if (v.rebooting || !v.paramsLoaded) throw new Error('FC did not come back after reboot');
}

async function writeAll(v, changes) {
  for (const [name, value] of Object.entries(changes)) await v.setParam(name, value);
  if (Object.keys(changes).length) await reboot(v);
}

async function bench(quad, wiring, frameType) {
  const key = `${quad} / FRAME_TYPE ${frameType}`;
  const ok = (cond, msg) => check(cond, `${key}: ${msg}`, key);
  const v = new Vehicle();
  await v.connect(new VirtualLink({ wiring }));
  await writeAll(v, frameType === 1 ? {} : { FRAME_TYPE: frameType });
  const layout = getLayout(1, frameType);

  // Motor order: spin each motor, note the arm it's really on.
  const picks = {};
  for (const m of layout.motors) {
    const seen = await spin(v, m);
    picks[m.num] = seen && seen.pos;
  }
  const order = orderChanges(layout, paramsOf(v), picks);
  ok(!order.error, `motor order: ${order.error || JSON.stringify(order.changes)}`);
  await writeAll(v, order.changes || {});

  // Motor direction: flip every motor spinning the wrong way.
  const reversed = reversedMotors(layout, paramsOf(v));
  for (const m of layout.motors) {
    const seen = await spin(v, m);
    if (seen && seen.dir !== m.dir) reversed[m.num] = !reversed[m.num];
  }
  const mask = maskWith(layout, paramsOf(v), reversed);
  const dirChange = mask !== v.param('SERVO_BLH_RVMASK');
  ok(true, `motor direction: SERVO_BLH_RVMASK ${v.param('SERVO_BLH_RVMASK')} -> ${mask}`);
  await writeAll(v, dirChange ? { SERVO_BLH_RVMASK: mask } : {});

  if (quad === 'correct quad' && frameType === 1) {
    ok(Object.keys(order.changes || {}).length === 0 && !dirChange, 'built for this frame, so neither tool changes anything');
  }

  // Every slider spins its own arm, the right way.
  for (const m of layout.motors) {
    const seen = await spin(v, m);
    ok(!!seen && seen.pos === m.pos && seen.dir === m.dir,
      `after Motor order + Motor direction, motor ${m.num} slider spins ${m.pos} ${m.dir} (bench: ${seen ? seen.pos + ' ' + seen.dir : 'nothing'})`);
  }
  await v.disconnect();
  return key;
}

const runs = [];
for (const [quad, wiring] of [['correct quad', CORRECT_WIRING], ['mis-soldered quad', MISWIRED]]) {
  for (const t of SUPPORTED_FRAME_TYPES) runs.push(bench(quad, wiring, t));
}
const keys = await Promise.all(runs);
for (const k of keys) console.log(logs[k].join('\n'));

console.log(fail ? `FAILED ${fail}` : 'OK: bench (both quads, every frame, every slider)');
process.exit(fail ? 1 : 0);
