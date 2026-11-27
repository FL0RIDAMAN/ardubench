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
const MAV_CMD_PREFLIGHT_CALIBRATION = 241;
const MAV_CMD_DO_START_MAG_CAL = 42424;
const MAV_CMD_DO_ACCEPT_MAG_CAL = 42425;
const MAV_CMD_DO_CANCEL_MAG_CAL = 42426;
const MAV_CMD_ACCELCAL_VEHICLE_POS = 42429;
const ACCEL_POS_SUCCESS = 16777215;
const ACCEL_POS_FAILED = 16777216;
// Messages a GCS can ask for with SET_MESSAGE_INTERVAL. Like ArduCopter, the
// virtual FC sends none of them until asked (stream rates default to 0).
const RATED = { RAW_IMU: 27, ATTITUDE: 30, VFR_HUD: 74, SCALED_IMU2: 116, MAG_CAL_PROGRESS: 191, MAG_CAL_REPORT: 192 };
const POS_TEXT = { 1: 'level', 2: 'on its LEFT side', 3: 'on its RIGHT side', 4: 'nose DOWN', 5: 'nose UP', 6: 'on its BACK' };
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
// Compass device ids (AP_HAL::Device: bus_type 3 bits, bus 5, address 8, devtype 8).
const devId = (busType, bus, address, devtype) => busType | (bus << 3) | (address << 8) | (devtype << 16);
const MAG_EXT = devId(1, 0, 0x0d, 0x0d); // external QMC5883L, I2C bus 0, 0x0D
const MAG_INT = devId(1, 1, 0x0e, 0x0a); // internal IST8310, I2C bus 1, 0x0E
// The bench tilt of the virtual board, before trims (degrees).
const BOARD_TILT = { roll: 0.4, pitch: -0.3 };
// What @SYS/uarts.txt says (layout of a MatekH743: SERIAL_ORDER OTG1 UART7 USART1 USART2 USART3 UART8 UART4).
const UARTS = ['OTG1', 'UART7', 'UART1', 'UART2', 'UART3', 'UART8', 'UART4'];

// [name, value, MAV_PARAM_TYPE]  (9 = REAL32, 2 = INT8, 4 = INT16, 6 = INT32)
const DEFAULT_PARAMS = [
  ['FRAME_CLASS', 1, 2], ['FRAME_TYPE', 1, 2],
  ['MOT_PWM_TYPE', 6, 2], ['MOT_SPIN_ARM', 0.1, 9], ['MOT_SPIN_MIN', 0.15, 9], ['MOT_SPIN_MAX', 0.95, 9],
  ['MOT_PWM_MIN', 1000, 4], ['MOT_PWM_MAX', 2000, 4],
  ['SERVO_BLH_BDMASK', 15, 6], ['SERVO_BLH_RVMASK', 0, 6], ['SERVO_BLH_POLES', 14, 2], ['SERVO_BLH_TRATE', 10, 4],
  ['SERVO_BLH_AUTO', 1, 2],
  ['SERVO1_FUNCTION', 33, 4], ['SERVO2_FUNCTION', 34, 4], ['SERVO3_FUNCTION', 35, 4], ['SERVO4_FUNCTION', 36, 4],
  ['SERVO5_FUNCTION', 0, 4], ['SERVO6_FUNCTION', 0, 4],
  ['SERIAL0_PROTOCOL', 2, 2], ['SERIAL0_BAUD', 115, 6], ['SERIAL0_OPTIONS', 0, 4],
  ['SERIAL1_PROTOCOL', 2, 2], ['SERIAL1_BAUD', 57, 6], ['SERIAL1_OPTIONS', 0, 4],
  ['SERIAL2_PROTOCOL', 23, 2], ['SERIAL2_BAUD', 115, 6], ['SERIAL2_OPTIONS', 0, 4],
  ['SERIAL3_PROTOCOL', 5, 2], ['SERIAL3_BAUD', 230, 6], ['SERIAL3_OPTIONS', 0, 4],
  ['SERIAL4_PROTOCOL', 16, 2], ['SERIAL4_BAUD', 115, 6], ['SERIAL4_OPTIONS', 0, 4],
  ['SERIAL5_PROTOCOL', -1, 2], ['SERIAL5_BAUD', 57, 6], ['SERIAL5_OPTIONS', 0, 4],
  ['SERIAL6_PROTOCOL', -1, 2], ['SERIAL6_BAUD', 57, 6], ['SERIAL6_OPTIONS', 0, 4],
  ['VTX_ENABLE', 0, 2], ['OSD_TYPE', 0, 2],
  ['COMPASS_ENABLE', 1, 2], ['COMPASS_DEV_ID', MAG_EXT, 6], ['COMPASS_DEV_ID2', MAG_INT, 6], ['COMPASS_DEV_ID3', 0, 6],
  ['COMPASS_PRIO1_ID', MAG_EXT, 6], ['COMPASS_PRIO2_ID', MAG_INT, 6], ['COMPASS_PRIO3_ID', 0, 6],
  ['COMPASS_USE', 1, 2], ['COMPASS_USE2', 1, 2], ['COMPASS_USE3', 1, 2],
  ['COMPASS_EXTERNAL', 1, 2], ['COMPASS_EXTERN2', 0, 2], ['COMPASS_EXTERN3', 0, 2],
  ['COMPASS_ORIENT', 0, 2], ['COMPASS_ORIENT2', 0, 2], ['COMPASS_ORIENT3', 0, 2],
  ['COMPASS_OFS_X', 0, 9], ['COMPASS_OFS_Y', 0, 9], ['COMPASS_OFS_Z', 0, 9],
  ['COMPASS_OFS2_X', 0, 9], ['COMPASS_OFS2_Y', 0, 9], ['COMPASS_OFS2_Z', 0, 9],
  ['COMPASS_CAL_FIT', 16, 9], ['COMPASS_AUTO_ROT', 2, 2], ['COMPASS_AUTODEC', 1, 2], ['COMPASS_DEC', 0, 9], ['COMPASS_LEARN', 0, 2],
  ['AHRS_ORIENTATION', 0, 2], ['AHRS_TRIM_X', 0, 9], ['AHRS_TRIM_Y', 0, 9],
  ['INS_ACCOFFS_X', 0, 9], ['INS_ACCOFFS_Y', 0, 9], ['INS_ACCOFFS_Z', 0, 9],
  ['INS_ACCSCAL_X', 1, 9], ['INS_ACCSCAL_Y', 1, 9], ['INS_ACCSCAL_Z', 1, 9], ['INS_GYR_CAL', 1, 2],
  ['INS_ACC_ID', 3016466, 6], ['INS_ACC2_ID', 0, 6], ['INS_ACC3_ID', 0, 6], // one IMU
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
    this.rates = {}; // message id -> { ms, next }
    this.magCals = null; // priority slot -> calibrator, while a compass calibration runs
    this.acal = null; // 6-position accel calibration state
    this.acalLast = null; // 'success' | 'failed' once one has finished (keeps being reported)
    this.blockedUntil = 0; // a blocking calibration is running: only HEARTBEAT goes out
    this.lastAccelCal = 0;
    this.ftpFile = null; // the one open MAVFTP file (ArduPilot allows one)
    this.armed = false; // the virtual quad never arms
  }

  setParamValue(name, value) {
    const p = this.params.get(name);
    if (!p) return;
    p.value = p.type === 9 ? Math.fround(value) : Math.round(value);
    this.applied[name] = p.value;
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
    // During gyro, level and simple calibrations ArduPilot blocks and only sends HEARTBEAT.
    if (Date.now() < this.blockedUntil && name !== 'HEARTBEAT') return;
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

    this.tickSetup(now);

    if (this.telemetryOn && now >= (this.nextTelem || 0)) {
      this.nextTelem = now + this.telemetryInterval;
      this.send('ESC_TELEMETRY_1_TO_4', {
        temperature: this.temps.map(Math.round), voltage: [1610, 1610, 1610, 1610],
        current: cur, totalcurrent: [0, 0, 0, 0], rpm, count: [1, 1, 1, 1],
      });
    }
  }

  // ---- Setup tabs: live sensors, compass and accelerometer calibration ----

  due(id, now) {
    const r = this.rates[id];
    if (!r || now < r.next) return false;
    r.next = now + r.ms;
    return true;
  }

  // The virtual quad sits still on the bench, nose at 87 degrees.
  attitude() {
    const trimX = this.applied.AHRS_TRIM_X || 0, trimY = this.applied.AHRS_TRIM_Y || 0;
    const n = () => (Math.random() - 0.5) * 0.0004;
    return { roll: rad(BOARD_TILT.roll) - trimX + n(), pitch: rad(BOARD_TILT.pitch) - trimY + n(), yaw: rad(87) + n() };
  }

  magField(slot) {
    // About 500 mGauss, pointing north, rotated by the 87 degree heading.
    const h = rad(87), f = slot === 0 ? 1 : 0.96;
    return { x: Math.round(Math.cos(h) * 210 * f), y: Math.round(-Math.sin(h) * 210 * f), z: Math.round(455 * f) };
  }

  tickSetup(now) {
    const att = this.attitude();
    if (this.due(RATED.ATTITUDE, now)) this.send('ATTITUDE', { time_boot_ms: now % 4294967295, roll: att.roll, pitch: att.pitch, yaw: att.yaw, rollspeed: 0, pitchspeed: 0, yawspeed: 0 });
    if (this.due(RATED.VFR_HUD, now)) this.send('VFR_HUD', { airspeed: 0, groundspeed: 0, alt: 0, climb: 0, heading: Math.round((deg(att.yaw) + 360) % 360), throttle: 0 });
    if (this.due(RATED.RAW_IMU, now)) {
      const m = this.magField(0);
      this.send('RAW_IMU', { time_usec: now * 1000, xacc: 0, yacc: 0, zacc: -1000, xgyro: 0, ygyro: 0, zgyro: 0, xmag: m.x, ymag: m.y, zmag: m.z, id: 0, temperature: 4100 });
    }
    if (this.due(RATED.SCALED_IMU2, now)) {
      const m = this.magField(1);
      this.send('SCALED_IMU2', { time_boot_ms: now % 4294967295, xacc: 0, yacc: 0, zacc: -1000, xgyro: 0, ygyro: 0, zgyro: 0, xmag: m.x, ymag: m.y, zmag: m.z, temperature: 4100 });
    }

    // Compass calibration (AP_Compass_Calibration.cpp / CompassCalibrator.cpp):
    // status 1 waiting, 2 step one, 3 step two, 4 success. PROGRESS is sent
    // while running, REPORT once finished, until accepted or cancelled.
    if (this.magCals) {
      const sendProgress = this.due(RATED.MAG_CAL_PROGRESS, now);
      const sendReport = this.due(RATED.MAG_CAL_REPORT, now);
      const mask = Object.keys(this.magCals).reduce((a, k) => a | (1 << k), 0);
      for (const [slot, c] of Object.entries(this.magCals)) {
        if (c.stopped) continue; // cancelled or accepted: NOT_STARTED, nothing is sent
        const t = (now - c.started) / 1000;
        if (c.status < 4) {
          c.status = t < 0.3 ? 1 : t < 3 ? 2 : 3;
          c.pct = Math.min(99, Math.round(t < 3 ? (t / 3) * 33.3 : 33.3 + ((t - 3) / 3.5) * 66));
          if (t >= 6.5 + Number(slot) * 0.4) {
            c.status = 4;
            c.pct = 100;
            if (c.autosave) this.saveMagCal(Number(slot), c);
          }
        }
        if (c.status < 4 && sendProgress) {
          const done = Math.floor((c.pct / 100) * 80);
          const completion = Array.from({ length: 10 }, (_, i) => (done >= (i + 1) * 8 ? 255 : done > i * 8 ? (1 << (done - i * 8)) - 1 : 0));
          this.send('MAG_CAL_PROGRESS', { compass_id: Number(slot), cal_mask: mask, cal_status: c.status, attempt: 1, completion_pct: c.pct, completion_mask: completion, direction_x: 0, direction_y: 0, direction_z: 0 });
        }
        if (c.status >= 4 && sendReport) {
          const orient = this.applied[`COMPASS_ORIENT${['', '2', '3'][this.storageSlot(Number(slot))] ?? ''}`] || 0;
          this.send('MAG_CAL_REPORT', {
            compass_id: Number(slot), cal_mask: mask, cal_status: c.status, autosaved: c.saved ? 1 : 0,
            fitness: c.fitness, ofs_x: c.ofs[0], ofs_y: c.ofs[1], ofs_z: c.ofs[2],
            diag_x: 1.01, diag_y: 0.99, diag_z: 1.0, offdiag_x: 0.01, offdiag_y: -0.02, offdiag_z: 0.0,
            orientation_confidence: 6.5, old_orientation: orient, new_orientation: orient, scale_factor: 1.02,
          });
        }
      }
    }

    // 6-position accel calibration (AP_AccelCal.cpp): ask for the position about
    // once a second; once finished, keep reporting SUCCESS or FAILED.
    if (this.acal && this.acal.state === 'waiting' && now - this.acal.lastAsk > 1000) {
      this.acal.lastAsk = now;
      this.send('COMMAND_LONG', { target_system: 0, target_component: 0, command: MAV_CMD_ACCELCAL_VEHICLE_POS, confirmation: 0, param1: this.acal.step, param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0 });
    } else if (!this.acal && this.acalLast && now - (this.acalLastAsk || 0) > 1000) {
      this.acalLastAsk = now;
      this.send('COMMAND_LONG', { target_system: 0, target_component: 0, command: MAV_CMD_ACCELCAL_VEHICLE_POS, confirmation: 0, param1: this.acalLast === 'success' ? ACCEL_POS_SUCCESS : ACCEL_POS_FAILED, param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0 });
    }
  }

  // Priority slot -> the storage slot whose DEV_ID matches that priority's id.
  storageSlot(slot) {
    const id = this.applied[`COMPASS_PRIO${slot + 1}_ID`];
    return ['', '2', '3'].findIndex((s) => this.applied[`COMPASS_DEV_ID${s}`] === id);
  }

  saveMagCal(slot, c) {
    const s = ['', '2', '3'][this.storageSlot(slot)];
    if (s === undefined) return;
    ['X', 'Y', 'Z'].forEach((a, i) => this.setParamValue(`COMPASS_OFS${s}_${a}`, c.ofs[i]));
    c.saved = true;
  }

  startMagCal(m) {
    const mask = Math.round(m.param1);
    if (this.armed) { this.ack(m.command, 4); return; }
    const slots = [0, 1, 2].filter((i) => this.applied[`COMPASS_PRIO${i + 1}_ID`] && this.storageSlot(i) >= 0
      && this.applied[i === 0 ? 'COMPASS_USE' : `COMPASS_USE${i + 1}`] === 1 && (mask === 0 || (mask >> i) & 1));
    if (!slots.length) { this.ack(m.command, 4); return; }
    const now = Date.now() + Math.max(0, m.param4) * 1000;
    this.magCals = {};
    const ofs = [[-35.2, 12.6, 88.1], [20.4, -41.7, 15.9], [5, 5, 5]];
    for (const i of slots) this.magCals[i] = { started: now, status: 1, pct: 0, fitness: i === 0 ? 4.6 : 7.9, ofs: ofs[i], autosave: m.param3 !== 0, saved: false };
    this.ack(m.command, 0);
  }

  accelCal(m) {
    if (this.armed) { this.text(5, 'Disarm to allow calibration'); this.ack(m.command, 4); return; }
    const now = Date.now();
    const busy = now < this.blockedUntil || (this.acal && this.acal.state !== 'done');
    if (Math.round(m.param1) === 1) { // gyro calibration (blocking)
      this.blockedUntil = now + 1500;
      setTimeout(() => { this.blockedUntil = 0; this.ack(m.command, 0); }, 1500);
      return;
    }
    const kind = Math.round(m.param5);
    if (kind === 1) { // full 6-position: gyro cal (blocking), then start
      if (busy) { this.ack(m.command, 1); return; }
      this.blockedUntil = now + 1500;
      setTimeout(() => {
        this.blockedUntil = 0;
        this.ack(m.command, 0);
        this.acal = { state: 'waiting', step: 1, lastAsk: 0, snoop: true };
        this.acalLast = null;
        this.text(2, `Place vehicle ${POS_TEXT[1]} and press any key.`);
      }, 1500);
      return;
    }
    if (kind === 2 || kind === 4) { // level (trim) or simple: TEMPORARILY_REJECTED if busy or within 5 s
      if (busy || now - this.lastAccelCal < 5000) { this.ack(m.command, 1); return; }
      const ms = kind === 2 ? 1500 : 2000;
      this.blockedUntil = now + ms;
      setTimeout(() => {
        this.blockedUntil = 0;
        this.lastAccelCal = Date.now();
        if (kind === 2) {
          // trim = the board's tilt (AP_InertialSensor::calibrate_trim)
          this.setParamValue('AHRS_TRIM_X', rad(BOARD_TILT.roll));
          this.setParamValue('AHRS_TRIM_Y', rad(BOARD_TILT.pitch));
          this.text(6, `Trim OK: roll=${BOARD_TILT.roll.toFixed(2)} pitch=${BOARD_TILT.pitch.toFixed(2)} yaw=0.00`);
        } else {
          // simple: offsets from one level pose, scale 1, trims zeroed
          [['X', 0.112], ['Y', -0.064], ['Z', 0.231]].forEach(([a, v]) => { this.setParamValue(`INS_ACCOFFS_${a}`, v); this.setParamValue(`INS_ACCSCAL_${a}`, 1); });
          this.setParamValue('AHRS_TRIM_X', 0);
          this.setParamValue('AHRS_TRIM_Y', 0);
        }
        this.ack(m.command, 0);
      }, ms);
      return;
    }
    this.ack(m.command, 3);
  }

  accelCalPosition(m) {
    const pos = Math.round(m.param1);
    if (!this.acal || this.acal.state !== 'waiting' || pos !== this.acal.step) { this.ack(m.command, 4); return; }
    this.ack(m.command, 0);
    this.acal.snoop = false; // after the GCS answers, ArduPilot stops sending the "Place vehicle" texts
    this.acal.state = 'collecting';
    setTimeout(() => { // 0.5 s of samples per position
      if (!this.acal) return;
      if (this.acal.step >= 6) {
        [['X', 0.105], ['Y', -0.071], ['Z', 0.244]].forEach(([a, v]) => this.setParamValue(`INS_ACCOFFS_${a}`, v));
        [['X', 1.002], ['Y', 0.998], ['Z', 1.004]].forEach(([a, v]) => this.setParamValue(`INS_ACCSCAL_${a}`, v));
        this.setParamValue('AHRS_TRIM_X', rad(BOARD_TILT.roll));
        this.setParamValue('AHRS_TRIM_Y', rad(BOARD_TILT.pitch));
        this.text(6, `Trim OK: roll=${BOARD_TILT.roll.toFixed(2)} pitch=${BOARD_TILT.pitch.toFixed(2)} yaw=0.00`);
        this.text(2, 'Calibration successful');
        this.acal = null;
        this.acalLast = 'success';
        this.lastAccelCal = Date.now();
        return;
      }
      this.acal.step += 1;
      this.acal.state = 'waiting';
      this.acal.lastAsk = 0;
      if (this.acal.snoop) this.text(2, `Place vehicle ${POS_TEXT[this.acal.step]} and press any key.`);
    }, 500);
  }

  // MAVFTP, read-only, as ArduPilot's GCS_FTP serves it (one open file at a time).
  ftp(m) {
    const req = m.payload;
    const seq = req[0] | (req[1] << 8), op = req[3], size = req[4];
    const offset = req[8] | (req[9] << 8) | (req[10] << 16) | (req[11] << 24);
    const reply = new Array(251).fill(0);
    const nak = (err) => { reply[3] = 129; reply[4] = 1; reply[12] = err; };
    reply[0] = (seq + 1) & 0xff; reply[1] = ((seq + 1) >> 8) & 0xff; reply[2] = req[2]; reply[5] = op;
    if (op === 1 || op === 2) { this.ftpFile = null; reply[3] = 128; }
    else if (op === 4) {
      const path = String.fromCharCode(...req.slice(12, 12 + size)).replace(/\0.*$/, '');
      if (this.ftpFile) nak(1);
      else if (path === '@SYS/uarts.txt') {
        const lines = UARTS.map((u, i) => `SERIAL${i} ${u.padEnd(u.startsWith('OTG') ? 5 : 6)}TX=     ${1000 + i} RX=     ${500 + i} TXBD=     0 RXBD=     0 RXDRP=       0`);
        this.ftpFile = new TextEncoder().encode(`UARTV1\n${lines.join('\n')}\n`);
        reply[3] = 128; reply[4] = 4;
        const n = this.ftpFile.length;
        reply[12] = n & 0xff; reply[13] = (n >> 8) & 0xff; reply[14] = (n >> 16) & 0xff; reply[15] = (n >>> 24) & 0xff;
      } else { nak(2); reply[4] = 2; reply[13] = 2; } // FailErrno, ENOENT (stat failed)
    } else if (op === 5) {
      if (!this.ftpFile) nak(10);
      else if (offset >= this.ftpFile.length) nak(6);
      else {
        const chunk = this.ftpFile.slice(offset, offset + Math.min(239, size));
        reply[3] = 128; reply[4] = chunk.length;
        reply[8] = req[8]; reply[9] = req[9]; reply[10] = req[10]; reply[11] = req[11];
        chunk.forEach((b, i) => { reply[12 + i] = b; });
      }
    } else nak(7);
    this.send('FILE_TRANSFER_PROTOCOL', { target_network: 0, target_system: 255, target_component: 190, payload: reply });
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
        // Most settings here only take effect after a reboot. The spin values,
        // trims and compass use/declination are read live by ArduPilot.
        if (/^(MOT_SPIN|AHRS_TRIM_|COMPASS_(USE|DEC|AUTODEC|CAL_FIT|AUTO_ROT))/.test(m.param_id)) this.applied[m.param_id] = p.value;
        this.sendParam(m.param_id, names.indexOf(m.param_id));
        break;
      }
      case 'COMMAND_LONG':
        this.command(m);
        break;
      case 'FILE_TRANSFER_PROTOCOL':
        this.ftp(m);
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
          this.rates = {};
          this.magCals = null;
          this.acal = null;
          setTimeout(() => this.text(6, 'ArduCopter V4.x (virtual)'), 2700);
        }, 100);
        return;
      case MAV_CMD_SET_MESSAGE_INTERVAL: {
        const id = Math.round(m.param1);
        if (id === 11030) {
          this.telemetryOn = m.param2 > 0;
          this.telemetryInterval = Math.max(50, m.param2 / 1000);
        } else if (Object.values(RATED).includes(id)) {
          if (m.param2 > 0) this.rates[id] = { ms: Math.max(20, m.param2 / 1000), next: 0 };
          else delete this.rates[id];
        }
        this.ack(m.command, 0);
        return;
      }
      case MAV_CMD_PREFLIGHT_CALIBRATION:
        this.accelCal(m);
        return;
      case MAV_CMD_ACCELCAL_VEHICLE_POS:
        this.accelCalPosition(m);
        return;
      case MAV_CMD_DO_START_MAG_CAL:
        this.startMagCal(m);
        return;
      case MAV_CMD_DO_ACCEPT_MAG_CAL: {
        // Compass::_accept_calibration_mask (mask 0 = all): a compass that was
        // saved, or isn't calibrating (NOT_STARTED), is fine; a SUCCESS one is
        // saved now; anything still running or failed makes it FAILED. Every
        // calibrator in the mask is stopped either way.
        let ok = true;
        for (const [slot, c] of Object.entries(this.magCals || {})) {
          if (c.stopped || c.saved) { c.stopped = true; continue; }
          if (c.status === 4) this.saveMagCal(Number(slot), c);
          else ok = false;
          c.stopped = true;
        }
        this.ack(m.command, ok ? 0 : 4);
        return;
      }
      case MAV_CMD_DO_CANCEL_MAG_CAL:
        // Compass::_cancel_calibration: stop() -> NOT_STARTED, not saved. Always ACCEPTED.
        for (const c of Object.values(this.magCals || {})) { c.stopped = true; c.saved = false; c.status = 0; }
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
