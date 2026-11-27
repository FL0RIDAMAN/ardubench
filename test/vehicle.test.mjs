// End-to-end test: the app's Vehicle talking real MAVLink bytes to the Virtual FC.
import { Vehicle } from '../src/vehicle.js';
import { VirtualLink } from '../src/link/VirtualLink.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };

const v = new Vehicle();
const link = new VirtualLink();
await v.connect(link);
check(v.connected, 'connected and got heartbeat');
check(v.paramsLoaded && v.param('FRAME_TYPE') === 1, `loaded ${v.params.size} params`);
check(Math.abs(v.param('MOT_SPIN_ARM') - 0.1) < 1e-6, 'float param decoded');

await v.setParam('MOT_SPIN_ARM', 0.12);
check(Math.abs(v.param('MOT_SPIN_ARM') - 0.12) < 1e-6, 'setParam echoed');

await v.motorTest(4, 8, 1.5); // D = front-left = motor 3 on Quad X
await sleep(400);
check(v.physical && v.physical.pos === 'FL', 'motor test D spins the front-left motor: ' + JSON.stringify(v.physical));
check(v.esc[2] && v.esc[2].rpm > 3500, 'ESC telemetry shows RPM on output 3: ' + (v.esc[2] && v.esc[2].rpm));
await sleep(1500);
check(!v.physical, 'motor stopped after timeout');

await v.motorTest(2, 8, 1); // B = rear-right = motor 4 -> output 4, but output 4 is wired to RL
await sleep(300);
check(v.physical && v.physical.pos === 'RL', 'miswired virtual quad: motor 4 actually at RL');

// Fix order + direction, reboot, recheck
await v.setParam('SERVO2_FUNCTION', 36);
await v.setParam('SERVO4_FUNCTION', 34);
await v.setParam('SERVO_BLH_RVMASK', 4);
check(v.rebootNeeded, 'reboot flagged');
await v.reboot();
for (let i = 0; i < 60 && (v.rebooting || !v.paramsLoaded); i++) await sleep(100);
check(!v.rebooting && v.paramsLoaded, 'came back after reboot and reloaded params');
await v.motorTest(2, 8, 1); await sleep(300);
check(v.physical && v.physical.pos === 'RR' && v.physical.dir === 'CW', 'after fix, motor 4 at RR spinning CW');
await sleep(1100);
await v.motorTest(4, 8, 1); await sleep(300);
check(v.physical && v.physical.pos === 'FL' && v.physical.dir === 'CW', 'after fix, motor 3 at FL spinning CW');
check(v.messages.some((m) => /motor test/.test(m.text)), 'status text received');
await v.disconnect();
console.log(fail ? `FAILED ${fail}` : 'OK: vehicle + virtual FC');
process.exit(fail ? 1 : 0);
