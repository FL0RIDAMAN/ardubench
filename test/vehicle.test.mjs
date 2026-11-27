// End-to-end test: the app's Vehicle talking real MAVLink bytes to the Virtual FC.
import { Vehicle } from '../src/vehicle.js';
import { VirtualLink } from '../src/link/VirtualLink.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };

// A mis-soldered quad (tests only; the app's virtual quad is built correctly):
// the motors on outputs 2 and 4 are swapped, and the front-left one spins backwards.
const MISWIRED = {
  1: { pos: 'FR', dir: 'CCW' }, 2: { pos: 'RR', dir: 'CW' }, 3: { pos: 'FL', dir: 'CCW' }, 4: { pos: 'RL', dir: 'CCW' },
};
const v = new Vehicle();
const link = new VirtualLink({ wiring: MISWIRED });
await v.connect(link);
check(v.connected, 'connected and got heartbeat');
check(v.paramsLoaded && v.param('FRAME_TYPE') === 1, `loaded ${v.params.size} params`);
await sleep(1200);
// Status bar data (SYS_STATUS, GPS_RAW_INT, LOG_ENTRY), as the virtual FC reports it.
check(v.load === 12, 'CPU load from SYS_STATUS (per mille -> %): ' + v.load);
check(v.sensors.present === (1 | 2 | 4 | 8 | 32) && v.sensors.health === v.sensors.present, 'sensors present and healthy: gyro, accel, compass, baro, GPS');
check(v.battery && Math.abs(v.battery.voltage - 16.4) < 1e-6 && v.battery.current === null, 'battery 16.4 V, no current reading');
check(v.gps && v.gps.fix === 3 && v.gps.sats === 12, 'GPS 3D fix, 12 satellites');
check(v.logs && v.logs.done && v.logs.count === 3 && v.logs.bytes === 1887436 + 6501171 + 3565158, 'log list: 3 logs, sizes summed');
check(v.systemStatus === 3 && Date.now() - v.lastRxAt < 1000, 'standby (no failsafe), link up');
check(Math.abs(v.param('MOT_SPIN_ARM') - 0.1) < 1e-6, 'float param decoded');

await v.setParam('MOT_SPIN_ARM', 0.12);
check(Math.abs(v.param('MOT_SPIN_ARM') - 0.12) < 1e-6, 'setParam echoed');

await v.motorTest(4, 8, 1.5); // D = front-left = motor 3 on Quad X
await sleep(400);
check(v.physical.length === 1 && v.physical[0].pos === 'FL', 'motor test D spins the front-left motor: ' + JSON.stringify(v.physical));
check(v.esc[2] && v.esc[2].rpm > 3500, 'ESC telemetry shows RPM on output 3: ' + (v.esc[2] && v.esc[2].rpm));
await sleep(1500);
check(v.physical.length === 0, 'motor stopped after timeout');

await v.motorTest(2, 8, 1); // B = rear-right = motor 4 -> output 4, but output 4 is wired to RL
await sleep(300);
check(v.physical.length === 1 && v.physical[0].pos === 'RL', 'mis-soldered quad: motor 4 actually at RL');

// Fix order + direction, reboot, recheck
await v.setParam('SERVO2_FUNCTION', 36);
await v.setParam('SERVO4_FUNCTION', 34);
await v.setParam('SERVO_BLH_RVMASK', 4);
check(v.rebootNeeded, 'reboot flagged');
await v.reboot();
for (let i = 0; i < 60 && (v.rebooting || !v.paramsLoaded); i++) await sleep(100);
check(!v.rebooting && v.paramsLoaded, 'came back after reboot and reloaded params');
await v.motorTest(2, 8, 1); await sleep(300);
check(v.physical.length === 1 && v.physical[0].pos === 'RR' && v.physical[0].dir === 'CW', 'after fix, motor 4 at RR spinning CW');
await sleep(1100);
await v.motorTest(4, 8, 1); await sleep(300);
check(v.physical.length === 1 && v.physical[0].pos === 'FL' && v.physical[0].dir === 'CW', 'after fix, motor 3 at FL spinning CW');
check(v.messages.some((m) => /motor test/.test(m.text)), 'status text received');

// Several motors at once, like Mission Planner's "Test all motors": each
// command sets one motor and the others keep their last value.
await sleep(1100);
await Promise.all([1, 2, 3, 4].map((seq) => v.motorTest(seq, 8, 1)));
await sleep(300);
check(v.physical.length === 4, 'four motor tests sent together spin all four: ' + v.physical.map((p) => p.pos).join(','));
await v.motorTest(2, 0, 1); await sleep(300);
check(v.physical.length === 3 && !v.physical.some((p) => p.pos === 'RR'), 'setting one motor to 0% stops just that motor');
await v.motorStop(1); await sleep(300);
check(v.physical.length === 0, 'stop (timeout 0) stops every motor');
await v.disconnect();
console.log(fail ? `FAILED ${fail}` : 'OK: vehicle + virtual FC');
process.exit(fail ? 1 : 0);
