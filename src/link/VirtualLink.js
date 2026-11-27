// A pretend ArduCopter flight controller that lives inside the app.
//
// It speaks real MAVLink bytes, exactly like a USB connection would, so the
// rest of the app can't tell the difference. Use it to click through the app
// with no hardware, and to demo the wizards.
//
// To make the wizards worth trying, this virtual quad is built with two
// mistakes, the kind that happen on a real bench:
//   - the motors on outputs 2 and 4 are plugged in swapped, and
//   - the front-left motor spins the wrong way.

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
// at, and which way it spins before any reversal. Outputs 2 and 4 are swapped
// (should be RL and RR), and the FL motor is wired backwards.
const WIRING = {
  1: { pos: 'FR', dir: 'CCW' },
  2: { pos: 'RR', dir: 'CW' },
  3: { pos: 'FL', dir: 'CCW' },
  4: { pos: 'RL', dir: 'CCW' },
};

export class VirtualLink {
  constructor() {
    this.name = 'Virtual';
    this.isVirtual = true;
    this.onData = () => {};
    this.onClose = () => {};
    this.onPhysical = () => {}; // what you'd see on the bench (for the UI)
    this.seq = 0;
    this.params = new Map(DEFAULT_PARAMS.map(([n, v, t]) => [n, { value: v, type: t }]));
    this.applied = this.snapshot(); // values the "firmware" is running with
    this.parser = new MavParser((m) => this.handle(m));
    this.test = null; // { output, throttle, until }
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
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  async write(bytes) {
    // Small delay, like a real link.
    setTimeout(() => this.parser.push(bytes), 5);
  }

  send(name, fields) {
    if (Date.now() < this.rebootingUntil) return;
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
    this.send('SYS_STATUS', { voltage_battery: 0, current_battery: -1, battery_remaining: -1, load: 120 });
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
    if (this.test) {
      const i = this.test.output - 1;
      if (i >= 0 && i < 4) {
        rpm[i] = Math.round(this.test.throttle * 522 + (Math.random() - 0.5) * 60);
        cur[i] = Math.round(this.test.throttle * 7.5); // centiamps
        this.temps[i] = Math.min(60, this.temps[i] + 0.02);
      }
    }
    for (let i = 0; i < 4; i++) if (!this.test || this.test.output - 1 !== i) this.temps[i] = Math.max(24, this.temps[i] - 0.01);

    // What a person at the bench would see: which position spins, which way.
    let physical = null;
    if (this.test && WIRING[this.test.output]) {
      const w = WIRING[this.test.output];
      const reversed = (this.applied.SERVO_BLH_RVMASK >> (this.test.output - 1)) & 1;
      physical = { pos: w.pos, dir: reversed ? (w.dir === 'CW' ? 'CCW' : 'CW') : w.dir };
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
        if (throttle <= 0 || timeout <= 0) {
          this.test = null;
        } else {
          if (!this.test || this.test.output !== output) this.text(6, 'starting motor test');
          this.test = { output, throttle, until: Date.now() + timeout * 1000 };
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
