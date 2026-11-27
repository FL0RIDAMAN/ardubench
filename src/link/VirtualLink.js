// A pretend ArduCopter flight controller that lives inside the app.
//
// It speaks real MAVLink bytes, exactly like a USB connection would, so the
// rest of the app can't tell the difference. Use it to click through the app
// with no hardware.
//
// The virtual quad is built correctly for the frame it starts on (QUAD X,
// FRAME_TYPE 1): every motor is on the right output and spins the right way.
// Like a real quad, changing the frame doesn't move any wires, so after a
// frame change you use Motor order and Motor direction, as on a real build.
// Tests can pass a different `wiring` to simulate a mis-soldered quad.

import { encode, MavParser } from '../mavlink/codec.js';
import { getLayout, MOTOR_FUNCTION_BASE } from '../frames.js';

const MAV_TYPE_QUADROTOR = 2;
const MAV_AUTOPILOT_ARDUPILOTMEGA = 3;
const MAV_STATE_STANDBY = 3;
const MAV_CMD_DO_MOTOR_TEST = 209;
const MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN = 246;
const MAV_CMD_SET_MESSAGE_INTERVAL = 511;
const MAV_CMD_REQUEST_MESSAGE = 512;

// [name, value, MAV_PARAM_TYPE]  (9 = REAL32, 2 = INT8, 4 = INT16, 6 = INT32)
const DEFAULT_PARAMS = [
  ['FRAME_CLASS', 1, 2], ['FRAME_TYPE', 1, 2],
  ['MOT_PWM_TYPE', 6, 2], ['MOT_SPIN_ARM', 0.1, 9], ['MOT_SPIN_MIN', 0.15, 9], ['MOT_SPIN_MAX', 0.95, 9],
  ['MOT_PWM_MIN', 1000, 4], ['MOT_PWM_MAX', 2000, 4],
  ['SERVO_BLH_BDMASK', 15, 6], ['SERVO_BLH_RVMASK', 0, 6], ['SERVO_BLH_POLES', 14, 2], ['SERVO_BLH_TRATE', 10, 4],
  ['SERVO_BLH_AUTO', 1, 2],
  ['SERVO1_FUNCTION', 33, 4], ['SERVO2_FUNCTION', 34, 4], ['SERVO3_FUNCTION', 35, 4], ['SERVO4_FUNCTION', 36, 4],
  ['SERVO5_FUNCTION', 0, 4], ['SERVO6_FUNCTION', 0, 4],
  ['SERIAL1_PROTOCOL', 2, 2], ['SERIAL2_PROTOCOL', 23, 2], ['SERIAL3_PROTOCOL', 5, 2], ['SERIAL4_PROTOCOL', 16, 2],
  ['INS_HNTCH_ENABLE', 0, 2], ['INS_HNTCH_MODE', 1, 2],
  ['ARMING_CHECK', 1, 6], ['BRD_SAFETY_DEFLT', 0, 2],
  ['BATT_MONITOR', 4, 2], ['FS_THR_ENABLE', 1, 2],
];

// Hidden "hardware": which physical position each output's motor is mounted
// at, and which way it spins before any reversal. This is a correct QUAD X
// build (ArduPilot's motor table, libraries/AP_Motors/AP_MotorsMatrix.cpp).
export const CORRECT_WIRING = {
  1: { pos: 'FR', dir: 'CCW' },
  2: { pos: 'RL', dir: 'CCW' },
  3: { pos: 'FL', dir: 'CW' },
  4: { pos: 'RR', dir: 'CW' },
};

export class VirtualLink {
  constructor({ wiring = CORRECT_WIRING } = {}) {
    this.wiring = wiring;
    this.name = 'Virtual';
    this.isVirtual = true;
    this.onData = () => {};
    this.onClose = () => {};
    this.onPhysical = () => {}; // what you'd see on the bench (for the UI)
    this.seq = 0;
    this.params = new Map(DEFAULT_PARAMS.map(([n, v, t]) => [n, { value: v, type: t }]));
    this.applied = this.snapshot(); // values the "firmware" is running with
    this.parser = new MavParser((m) => this.handle(m));
    this.test = null; // { until, out: { output number: throttle % } } while a motor test runs
    this.temps = [24, 25, 24, 24];
    this.rebootingUntil = 0;
    this.timers = [];
  }

  snapshot() {
    const o = {};
    for (const [k, v] of this.params) o[k] = v.value;
    return o;
  }

  async open() {
    this.timers.push(setInterval(() => this.tick1Hz(), 1000));
    this.timers.push(setInterval(() => this.tickFast(), 100));
    setTimeout(() => this.text(6, 'ArduCopter V4.x (virtual)'), 300);
  }

  async close() {
    this.closed = true; // delayed replies (e.g. "back after reboot") must not reach a closed app
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  async write(bytes) {
    // Small delay, like a real link.
    setTimeout(() => this.parser.push(bytes), 5);
  }

  send(name, fields) {
    if (this.closed || Date.now() < this.rebootingUntil) return;
    const pkt = encode(name, fields, { seq: this.seq++ & 0xff, sysid: 1, compid: 1 });
    this.onData(pkt);
  }

  text(severity, text) {
    this.send('STATUSTEXT', { severity, text });
  }

  tick1Hz() {
    this.send('HEARTBEAT', {
      type: MAV_TYPE_QUADROTOR, autopilot: MAV_AUTOPILOT_ARDUPILOTMEGA,
      base_mode: 0x51, custom_mode: 0, system_status: MAV_STATE_STANDBY, mavlink_version: 3,
    });
    // Gyro, accel, compass, baro and GPS present and healthy (no rangefinder),
    // a 4S pack plugged in, 12% CPU load. GPS has a 3D fix.
    const sensors = 1 | 2 | 4 | 8 | 32;
    this.send('SYS_STATUS', {
      onboard_control_sensors_present: sensors, onboard_control_sensors_enabled: sensors, onboard_control_sensors_health: sensors,
      voltage_battery: 16400, current_battery: -1, battery_remaining: -1, load: 120,
    });
    this.send('GPS_RAW_INT', { time_usec: Date.now() * 1000, fix_type: 3, lat: 0, lon: 0, alt: 0, eph: 90, epv: 120, vel: 0, cog: 0, satellites_visible: 12 });
  }

  // Three flight logs on the "SD card", like ArduPilot's LOG_ENTRY replies.
  listLogs() {
    const logs = [1887436, 6501171, 3565158]; // bytes
    const now = Math.floor(Date.now() / 1000);
    logs.forEach((size, i) => setTimeout(() => this.send('LOG_ENTRY', {
      id: i + 1, num_logs: logs.length, last_log_num: logs.length, time_utc: now - (logs.length - i) * 86400, size,
    }), 10 * (i + 1)));
  }

  // Which output drives ArduPilot motor number m, per the running config.
  outputForMotor(m) {
    for (let o = 1; o <= 6; o++) if (this.applied['SERVO' + o + '_FUNCTION'] === MOTOR_FUNCTION_BASE + m) return o;
    return null;
  }

  tickFast() {
    const now = Date.now();
    if (this.test && now > this.test.until) {
      this.test = null;
      this.text(6, 'finished motor test');
    }
    const rpm = [0, 0, 0, 0], cur = [0, 0, 0, 0];
    // What a person at the bench would see: which arms spin, which way.
    const physical = [];
    for (let i = 0; i < 4; i++) {
      const throttle = this.test ? this.test.out[i + 1] || 0 : 0;
      if (throttle > 0) {
        rpm[i] = Math.round(throttle * 522 + (Math.random() - 0.5) * 60);
        cur[i] = Math.round(throttle * 7.5); // centiamps
        this.temps[i] = Math.min(60, this.temps[i] + 0.02);
        const w = this.wiring[i + 1];
        const reversed = (this.applied.SERVO_BLH_RVMASK >> i) & 1;
        physical.push({ pos: w.pos, dir: reversed ? (w.dir === 'CW' ? 'CCW' : 'CW') : w.dir });
      } else {
        this.temps[i] = Math.max(24, this.temps[i] - 0.01);
      }
    }
    this.onPhysical(physical);

    if (this.telemetryOn && now >= (this.nextTelem || 0)) {
      this.nextTelem = now + this.telemetryInterval;
      this.send('ESC_TELEMETRY_1_TO_4', {
        temperature: this.temps.map(Math.round), voltage: [1610, 1610, 1610, 1610],
        current: cur, totalcurrent: [0, 0, 0, 0], rpm, count: [1, 1, 1, 1],
      });
    }
  }

  sendParam(name, index) {
    const p = this.params.get(name);
    this.send('PARAM_VALUE', {
      param_id: name, param_value: p.value, param_type: p.type,
      param_count: this.params.size, param_index: index,
    });
  }

  ack(command, result) {
    this.send('COMMAND_ACK', { command, result, target_system: 255, target_component: 190 });
  }

  handle(m) {
    if (Date.now() < this.rebootingUntil) return;
    const names = [...this.params.keys()];
    switch (m._name) {
      case 'PARAM_REQUEST_LIST':
        names.forEach((n, i) => setTimeout(() => this.sendParam(n, i), i * 4));
        break;
      case 'PARAM_REQUEST_READ': {
        const name = m.param_index >= 0 ? names[m.param_index] : m.param_id;
        if (this.params.has(name)) this.sendParam(name, names.indexOf(name));
        break;
      }
      case 'PARAM_SET': {
        if (!this.params.has(m.param_id)) { this.text(4, 'Unknown param ' + m.param_id); break; }
        const p = this.params.get(m.param_id);
        p.value = p.type === 9 ? Math.fround(m.param_value) : Math.round(m.param_value);
        // Most settings here only take effect after a reboot; the spin values apply at once.
        if (/^MOT_SPIN/.test(m.param_id)) this.applied[m.param_id] = p.value;
        this.sendParam(m.param_id, names.indexOf(m.param_id));
        break;
      }
      case 'COMMAND_LONG':
        this.command(m);
        break;
      case 'LOG_REQUEST_LIST':
        this.listLogs();
        break;
      default:
        break;
    }
  }

  command(m) {
    switch (m.command) {
      case MAV_CMD_DO_MOTOR_TEST: {
        const seq = Math.round(m.param1);
        const throttle = m.param3;
        const timeout = m.param4;
        const layout = getLayout(this.applied.FRAME_CLASS, this.applied.FRAME_TYPE);
        const motor = layout && layout.motors.find((x) => x.testSeq === seq);
        if (!motor) { this.text(3, 'Motor Test: invalid motor'); this.ack(m.command, 4); return; }
        const output = this.outputForMotor(motor.num);
        // Like ArduCopter's motor_test.cpp + motors.cpp: timeout 0 ends the
        // test (every motor stops). Otherwise it starts the test (all motors
        // at minimum) or updates it: the commanded motor goes to the new
        // throttle and every other motor keeps its last value, so several
        // can spin at once (Mission Planner's "Test all motors" relies on
        // this). 0% = that motor stopped. Each command restarts the timeout.
        if (timeout <= 0) {
          if (this.test) this.text(6, 'finished motor test');
          this.test = null;
        } else {
          if (!this.test) { this.text(6, 'starting motor test'); this.test = { out: {} }; }
          this.test.out[output] = Math.max(0, throttle);
          this.test.until = Date.now() + timeout * 1000;
        }
        this.ack(m.command, 0);
        return;
      }
      case MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN:
        this.ack(m.command, 0);
        this.test = null;
        this.text(6, 'Rebooting...');
        setTimeout(() => {
          this.rebootingUntil = Date.now() + 2500;
          this.applied = this.snapshot();
          this.telemetryOn = false;
          setTimeout(() => this.text(6, 'ArduCopter V4.x (virtual)'), 2700);
        }, 100);
        return;
      case MAV_CMD_SET_MESSAGE_INTERVAL:
        if (Math.round(m.param1) === 11030) {
          this.telemetryOn = m.param2 > 0;
          this.telemetryInterval = Math.max(50, m.param2 / 1000);
        }
        this.ack(m.command, 0);
        return;
      case MAV_CMD_REQUEST_MESSAGE:
        this.ack(m.command, 3); // unsupported here
        return;
      default:
        this.ack(m.command, 3);
    }
  }
}
