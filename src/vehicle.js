// The app's model of the connected flight controller.
//
// It owns the connection (USB or Virtual), turns incoming MAVLink messages
// into state (parameters, telemetry, messages), and offers simple async
// functions like setParam() and motorTest() that the screens call.
// Screens subscribe with vehicle.subscribe(fn) and re-render on changes.

import { encode, MavParser } from './mavlink/codec.js';

const MAV_CMD_DO_MOTOR_TEST = 209;
const MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN = 246;
const MAV_CMD_SET_MESSAGE_INTERVAL = 511;
const MOTOR_TEST_THROTTLE_PERCENT = 0;
const ESC_TELEMETRY_1_TO_4_ID = 11030;
const SYS_STATUS_ID = 1;
const GPS_RAW_INT_ID = 24;
export const MAV_STATE_CRITICAL = 5; // ArduCopter reports this while any failsafe is active

// SYS_STATUS sensor bits (MAV_SYS_STATUS_SENSOR) used by the status bar.
export const SENSOR = { gyro: 1, accel: 2, mag: 4, baro: 8, gps: 32, rangefinder: 256 };

export const ACK_RESULT = {
  0: 'accepted', 1: 'temporarily rejected', 2: 'denied', 3: 'unsupported', 4: 'failed', 5: 'in progress', 6: 'cancelled',
};

// Parameters whose new value only takes effect after a reboot. From
// ArduPilot's @RebootRequired tags, plus SERIALn_BAUD (ports are only opened
// at boot, AP_SerialManager::init) and AHRS_ORIENTATION (its description says
// "This option takes affect on next boot").
export function needsReboot(name) {
  return /^(FRAME_|MOT_PWM_TYPE|SERVO_BLH_|SERVO\d+_FUNCTION|SERIAL\d+_(PROTOCOL|BAUD|OPTIONS)|BRD_SER\d+_RTSCTS|INS_HNTCH_ENABLE|COMPASS_PRIO\d_ID|COMPASS_ENABLE|AHRS_ORIENTATION|CUST_ROT)/.test(name);
}

// MAVLink command and message ids used by the calibration screens
// (mavlink common.xml / ardupilotmega.xml).
export const CMD = {
  PREFLIGHT_CALIBRATION: 241,
  DO_START_MAG_CAL: 42424, DO_ACCEPT_MAG_CAL: 42425, DO_CANCEL_MAG_CAL: 42426,
  ACCELCAL_VEHICLE_POS: 42429,
};
export const MSG_ID = { RAW_IMU: 27, ATTITUDE: 30, VFR_HUD: 74, SCALED_IMU2: 116, SCALED_IMU3: 129, MAG_CAL_PROGRESS: 191, MAG_CAL_REPORT: 192 };
// ACCELCAL_VEHICLE_POS values (ardupilotmega.xml).
export const ACCEL_POS = { LEVEL: 1, LEFT: 2, RIGHT: 3, NOSEDOWN: 4, NOSEUP: 5, BACK: 6, SUCCESS: 16777215, FAILED: 16777216 };
const FTP = { TERMINATE: 1, RESET: 2, OPEN_RO: 4, READ: 5, ACK: 128, NAK: 129, ERR_EOF: 6 };

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export class Vehicle {
  constructor() {
    this.listeners = new Set();
    this.reset();
  }

  reset() {
    this.link = null;
    this.parser = null;
    this.connected = false;
    this.linkName = null;
    this.isVirtual = false;
    this.connectedAt = 0;
    this.lastHeartbeat = 0;
    this.target = { sys: 1, comp: 1 };
    this.heartbeat = null;
    this.armed = false;
    this.params = new Map(); // name -> { value, type, index }
    this.paramCount = 0;
    this.paramsLoaded = false;
    this.esc = []; // per output (index 0 = output 1): { rpm, current, voltage, temp, t }
    this.rpmHistory = []; // [{ t, rpm: [..] }]
    this.messages = []; // { t, severity, text }
    this.battery = null;
    this.systemStatus = 0; // HEARTBEAT system_status (MAV_STATE)
    this.load = null; // CPU load, percent (SYS_STATUS.load is per mille)
    this.sensors = { present: 0, health: 0 }; // SYS_STATUS bitmasks
    this.gps = null; // { fix, sats } from GPS_RAW_INT
    this.logs = null; // { count, bytes, done } from LOG_ENTRY replies
    this.lastRxAt = 0; // when the last bytes arrived from the FC
    this.attitude = null; // { roll, pitch, yaw } radians, from ATTITUDE
    this.heading = null; // degrees, from VFR_HUD
    this.mag = []; // field per priority slot (0 = RAW_IMU, 1 = SCALED_IMU2, 2 = SCALED_IMU3): { x, y, z } mGauss
    this.magCal = {}; // compass_id -> { progress: MAG_CAL_PROGRESS, report: MAG_CAL_REPORT, t }
    this.accelCalPos = null; // { pos, t }: last MAV_CMD_ACCELCAL_VEHICLE_POS the FC sent us
    // Calibrations this app started (kept here so they survive switching tabs):
    this.magCalSession = null; // { started, saved } compass calibration
    this.accelCalSession = null; // { started } 6-position accelerometer calibration
    this.ftpWaiters = new Map(); // reply seq -> resolve
    this.ftpSeq = 0;
    this.ftpBusy = Promise.resolve();
    this.physical = []; // virtual mode only: what you'd see on the bench, [{ pos, dir }] per spinning arm
    this.seq = 0;
    this.stats = { rx: 0, tx: 0 };
    this.pendingParams = new Map(); // name -> resolve
    this.pendingAcks = new Map(); // command -> [resolve, ...] in send order (several can be in flight)
    this.rebootNeeded = false;
    this.rebooting = false;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    // Batch updates: many messages arrive per frame.
    if (this.emitQueued) return;
    this.emitQueued = true;
    const run = () => { this.emitQueued = false; this.listeners.forEach((fn) => fn()); };
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(run); else setTimeout(run, 0);
  }

  // ---- connection -------------------------------------------------------

  async connect(link) {
    this.reset();
    this.link = link;
    this.linkName = link.name;
    this.isVirtual = !!link.isVirtual;
    this.parser = new MavParser((m) => this.handle(m));
    link.onData = (bytes) => { this.stats.rx += bytes.length; this.lastRxAt = Date.now(); this.parser.push(bytes); };
    link.onClose = () => this.disconnect(true);
    if (link.isVirtual) link.onPhysical = (p) => { this.physical = p; this.emit(); };
    await link.open();
    this.connectedAt = Date.now();
    this.hbTimer = setInterval(() => this.sendHeartbeat(), 1000);
    this.sendHeartbeat();
    this.emit();

    // Wait for the FC's first heartbeat so we know its system id.
    for (let i = 0; i < 50 && !this.heartbeat; i++) await sleep(100);
    if (!this.heartbeat) {
      await this.disconnect();
      throw new Error('No heartbeat from the flight controller. Is it an ArduPilot board, and is the right port selected?');
    }
    this.connected = true;
    this.emit();
    await this.startStreams();
    await this.loadParams();
    this.requestLogList();
  }

  async disconnect(lost = false) {
    clearInterval(this.hbTimer);
    const link = this.link;
    if (link && !lost) await link.close();
    const wasConnected = this.connected;
    const wasRebooting = this.rebooting;
    this.reset();
    if (lost && wasRebooting) {
      // Over USB the port disappears while the board restarts.
      this.messages.push({ t: Date.now(), severity: 5, text: 'Flight controller is rebooting. Click Connect again when it is back.' });
    } else if (lost && wasConnected) {
      this.messages.push({ t: Date.now(), severity: 3, text: 'Connection lost' });
    }
    this.emit();
  }

  send(name, fields) {
    if (!this.link) return;
    const pkt = encode(name, fields, { seq: this.seq++ & 0xff });
    this.stats.tx += pkt.length;
    this.link.write(pkt);
  }

  sendHeartbeat() {
    // type 6 = GCS, autopilot 8 = INVALID (we're a ground station, not an autopilot)
    this.send('HEARTBEAT', { type: 6, autopilot: 8, base_mode: 0, custom_mode: 0, system_status: 4, mavlink_version: 3 });
  }

  async startStreams() {
    // Ask for ESC telemetry at 10 Hz, and the status bar's SYS_STATUS and
    // GPS_RAW_INT at 2 Hz. Not every firmware accepts each; that's fine.
    for (const [id, us] of [[ESC_TELEMETRY_1_TO_4_ID, 100000], [SYS_STATUS_ID, 500000], [GPS_RAW_INT_ID, 500000]]) {
      try { await this.command(MAV_CMD_SET_MESSAGE_INTERVAL, [id, us]); } catch {}
    }
  }

  // Ask the FC which logs it holds (LOG_ENTRY replies). ArduPilot only answers
  // while disarmed, and listing doesn't pause logging (AP_Logger_MAVLinkLogTransfer.cpp).
  requestLogList() {
    if (this.armed || !this.connected) return;
    this.logs = { count: null, bytes: 0, done: false, seen: new Map() };
    this.send('LOG_REQUEST_LIST', { target_system: this.target.sys, target_component: this.target.comp, start: 0, end: 0xffff });
    this.emit();
  }

  // ---- incoming messages ------------------------------------------------

  handle(m) {
    switch (m._name) {
      case 'HEARTBEAT':
        if (m.autopilot === 8) return; // another ground station
        if (!this.heartbeat) this.target = { sys: m._sysid, comp: m._compid };
        if (this.rebooting) {
          this.rebooting = false;
          this.messages.push({ t: Date.now(), severity: 6, text: 'Flight controller is back after reboot' });
          this.startStreams();
          this.loadParams({ keepOld: true }).then(() => this.requestLogList(), () => {});
        }
        this.heartbeat = m;
        this.lastHeartbeat = Date.now();
        this.armed = !!(m.base_mode & 0x80);
        this.systemStatus = m.system_status;
        break;
      case 'SYS_STATUS':
        // 65535 mV means the FC has no voltage reading.
        this.battery = m.voltage_battery === 0xffff ? null : { voltage: m.voltage_battery / 1000, current: m.current_battery === -1 ? null : m.current_battery / 100 };
        this.load = m.load / 10;
        this.sensors = { present: m.onboard_control_sensors_present, health: m.onboard_control_sensors_health };
        break;
      case 'GPS_RAW_INT':
        this.gps = { fix: m.fix_type, sats: m.satellites_visible };
        break;
      case 'ATTITUDE':
        this.attitude = { roll: m.roll, pitch: m.pitch, yaw: m.yaw, t: Date.now() };
        break;
      case 'VFR_HUD':
        this.heading = m.heading;
        break;
      // ArduPilot sends the priority-1/2/3 compass fields in mGauss here (GCS_Common.cpp).
      case 'RAW_IMU':
        this.mag[0] = { x: m.xmag, y: m.ymag, z: m.zmag, t: Date.now() };
        break;
      case 'SCALED_IMU2':
        this.mag[1] = { x: m.xmag, y: m.ymag, z: m.zmag, t: Date.now() };
        break;
      case 'SCALED_IMU3':
        this.mag[2] = { x: m.xmag, y: m.ymag, z: m.zmag, t: Date.now() };
        break;
      case 'MAG_CAL_PROGRESS':
        this.magCal[m.compass_id] = { ...(this.magCal[m.compass_id] || {}), progress: m, t: Date.now() };
        break;
      case 'MAG_CAL_REPORT':
        this.magCal[m.compass_id] = { ...(this.magCal[m.compass_id] || {}), report: m, t: Date.now() };
        break;
      case 'COMMAND_LONG':
        // The FC asks for the next accelerometer calibration position this way
        // (GCS_MAVLINK::send_accelcal_vehicle_position, about once a second).
        if (m.command === CMD.ACCELCAL_VEHICLE_POS) this.accelCalPos = { pos: Math.round(m.param1), t: Date.now() };
        break;
      case 'FILE_TRANSFER_PROTOCOL': {
        const seq = m.payload[0] | (m.payload[1] << 8);
        const waiter = this.ftpWaiters.get(seq);
        if (waiter) { this.ftpWaiters.delete(seq); waiter(m.payload); }
        return; // no screen change
      }
      case 'LOG_ENTRY': {
        if (!this.logs) this.logs = { count: null, bytes: 0, done: false, seen: new Map() };
        this.logs.count = m.num_logs;
        if (m.num_logs > 0 && m.id > 0) this.logs.seen.set(m.id, m.size);
        this.logs.bytes = [...this.logs.seen.values()].reduce((a, b) => a + b, 0);
        this.logs.done = m.num_logs === 0 || this.logs.seen.size >= m.num_logs;
        break;
      }
      case 'PARAM_VALUE': {
        this.params.set(m.param_id, { value: m.param_value, type: m.param_type, index: m.param_index });
        this.paramCount = m.param_count;
        if (this.freshParams) this.freshParams.add(m.param_index);
        if ((this.freshParams ? this.freshParams.size : this.params.size) >= this.paramCount) this.paramsLoaded = true;
        const waiter = this.pendingParams.get(m.param_id);
        if (waiter) { this.pendingParams.delete(m.param_id); waiter(m.param_value); }
        break;
      }
      case 'COMMAND_ACK': {
        const waiters = this.pendingAcks.get(m.command);
        if (waiters && waiters.length) waiters.shift()(m.result);
        break;
      }
      case 'STATUSTEXT':
        this.messages.push({ t: Date.now(), severity: m.severity, text: m.text });
        if (this.messages.length > 50) this.messages.shift();
        break;
      case 'ESC_TELEMETRY_1_TO_4': {
        const now = Date.now();
        for (let i = 0; i < 4; i++) {
          this.esc[i] = { rpm: m.rpm[i], current: m.current[i] / 100, voltage: m.voltage[i] / 100, temp: m.temperature[i], t: now };
        }
        this.rpmHistory.push({ t: now, rpm: m.rpm.slice(0, 4) });
        while (this.rpmHistory.length && now - this.rpmHistory[0].t > 10000) this.rpmHistory.shift();
        break;
      }
      default:
        break;
    }
    this.emit();
  }

  // ---- parameters -------------------------------------------------------

  // keepOld: after a reboot, keep showing the old values while fresh ones arrive.
  async loadParams({ keepOld = false } = {}) {
    if (!keepOld) this.params = new Map();
    const fresh = new Set();
    this.freshParams = fresh;
    this.paramsLoaded = false;
    this.paramCount = 0;
    this.emit();
    this.send('PARAM_REQUEST_LIST', { target_system: this.target.sys, target_component: this.target.comp });
    // Params stream in. When they stop arriving, re-request any that were missed.
    let last = -1;
    for (let tries = 0; tries < 120 && !this.paramsLoaded; tries++) {
      await sleep(250);
      if (!this.link) return;
      if (fresh.size === last && this.paramCount > 0) {
        const have = fresh;
        let asked = 0;
        for (let i = 0; i < this.paramCount && asked < 20; i++) {
          if (!have.has(i)) {
            this.send('PARAM_REQUEST_READ', { target_system: this.target.sys, target_component: this.target.comp, param_id: '', param_index: i });
            asked++;
          }
        }
      }
      last = fresh.size;
    }
    this.emit();
  }

  param(name) {
    const p = this.params.get(name);
    return p ? p.value : undefined;
  }

  // Write one parameter and wait for the FC to echo it back.
  async setParam(name, value) {
    const known = this.params.get(name);
    const type = known ? known.type : 9;
    for (let attempt = 0; attempt < 3; attempt++) {
      const echoed = new Promise((resolve) => this.pendingParams.set(name, resolve));
      this.send('PARAM_SET', { target_system: this.target.sys, target_component: this.target.comp, param_id: name, param_value: value, param_type: type });
      const got = await Promise.race([echoed, sleep(1500).then(() => undefined)]);
      if (got !== undefined) {
        if (Math.abs(got - value) > 1e-4) throw new Error(`${name}: FC kept ${got} instead of ${value}`);
        if (needsReboot(name)) this.rebootNeeded = true;
        this.emit();
        return got;
      }
    }
    this.pendingParams.delete(name);
    throw new Error(`${name}: no reply from the flight controller`);
  }

  // ---- commands ---------------------------------------------------------

  // Like command(), but returns the MAV_RESULT number instead of throwing when
  // the FC refuses (e.g. 1 = temporarily rejected). Throws only on no reply.
  async commandResult(cmd, params = [], timeoutMs = 1500) {
    try {
      return await this.command(cmd, params, timeoutMs);
    } catch (e) {
      if (e.result !== undefined) return e.result;
      throw e;
    }
  }

  // Ask the FC to send a message at `hz`. hz 0 hands the message back to the
  // FC's own rate (MAV_CMD_SET_MESSAGE_INTERVAL interval 0 = "reset to default
  // rate", GCS_Common.cpp set_message_interval), so a screen that's closed
  // doesn't leave a user's SRn_ stream settings overridden.
  setRate(msgId, hz) {
    return this.command(MAV_CMD_SET_MESSAGE_INTERVAL, [msgId, hz > 0 ? Math.round(1e6 / hz) : 0]).catch(() => {});
  }

  // Re-read some parameters from the FC (e.g. offsets a calibration just saved).
  async readParams(names) {
    await Promise.all(names.map(async (name) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const got = new Promise((resolve) => this.pendingParams.set(name, resolve));
        this.send('PARAM_REQUEST_READ', { target_system: this.target.sys, target_component: this.target.comp, param_id: name, param_index: -1 });
        if (await Promise.race([got, sleep(1000).then(() => undefined)]) !== undefined) return;
      }
      this.pendingParams.delete(name);
    }));
    this.emit();
  }

  // A calibration saved something that only takes effect after a reboot.
  markRebootNeeded() {
    this.rebootNeeded = true;
    this.emit();
  }

  // ---- MAVFTP (read-only) ------------------------------------------------
  // Reads a whole file, e.g. '@SYS/uarts.txt', the way ArduPilot's GCS_FTP
  // serves it: OpenFileRO, ReadFile by offset until NAK EOF, TerminateSession.
  // ArduPilot keeps one open file at a time, so the session is always closed.
  ftpRead(path) {
    const run = async () => {
      await this.ftpRequest(FTP.TERMINATE).catch(() => {});
      const open = await this.ftpRequest(FTP.OPEN_RO, { data: new TextEncoder().encode(path) });
      if (open[3] !== FTP.ACK) throw new Error(`${path}: FTP error ${open[12]}`);
      const chunks = [];
      try {
        for (let offset = 0; offset < 1e6;) {
          const r = await this.ftpRequest(FTP.READ, { offset, size: 239 });
          if (r[3] === FTP.NAK) { if (r[12] === FTP.ERR_EOF) break; throw new Error(`${path}: FTP read error ${r[12]}`); }
          const n = r[4];
          if (n === 0) break;
          chunks.push(r.slice(12, 12 + n));
          offset += n;
        }
      } finally {
        await this.ftpRequest(FTP.TERMINATE).catch(() => {});
      }
      const all = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
      let o = 0;
      for (const c of chunks) { all.set(c, o); o += c.length; }
      return new TextDecoder().decode(all);
    };
    const p = this.ftpBusy.then(run, run);
    this.ftpBusy = p.catch(() => {});
    return p;
  }

  // One MAVFTP request; resolves with the reply payload (Uint8Array-like, 251 bytes).
  // Payload: [0..1] seq, [2] session, [3] opcode, [4] size, [8..11] offset, [12..] data.
  async ftpRequest(opcode, { offset = 0, size, data } = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const seq = this.ftpSeq;
      const payload = new Array(251).fill(0);
      payload[0] = seq & 0xff; payload[1] = (seq >> 8) & 0xff;
      payload[3] = opcode;
      payload[4] = data ? data.length : (size || 0);
      payload[8] = offset & 0xff; payload[9] = (offset >> 8) & 0xff; payload[10] = (offset >> 16) & 0xff; payload[11] = (offset >>> 24) & 0xff;
      if (data) for (let i = 0; i < data.length && i < 239; i++) payload[12 + i] = data[i];
      const reply = new Promise((resolve) => this.ftpWaiters.set((seq + 1) & 0xffff, resolve));
      this.send('FILE_TRANSFER_PROTOCOL', { target_network: 0, target_system: this.target.sys, target_component: this.target.comp, payload });
      const got = await Promise.race([reply, sleep(1500).then(() => null)]);
      if (got) { this.ftpSeq = (seq + 2) & 0xffff; return got; }
      this.ftpWaiters.delete((seq + 1) & 0xffff); // resend the same seq: ArduPilot replays its last reply
    }
    throw new Error('No MAVFTP reply');
  }

  async command(cmd, params = [], timeoutMs = 1500) {
    const p = [...params, 0, 0, 0, 0, 0, 0, 0].slice(0, 7);
    let resolveAck;
    const acked = new Promise((resolve) => { resolveAck = resolve; });
    if (!this.pendingAcks.has(cmd)) this.pendingAcks.set(cmd, []);
    this.pendingAcks.get(cmd).push(resolveAck);
    this.send('COMMAND_LONG', {
      target_system: this.target.sys, target_component: this.target.comp, command: cmd, confirmation: 0,
      param1: p[0], param2: p[1], param3: p[2], param4: p[3], param5: p[4], param6: p[5], param7: p[6],
    });
    const result = await Promise.race([acked, sleep(timeoutMs).then(() => 'timeout')]);
    if (result === 'timeout') {
      const waiters = this.pendingAcks.get(cmd) || [];
      const i = waiters.indexOf(resolveAck);
      if (i >= 0) waiters.splice(i, 1);
      throw new Error('No reply to command ' + cmd);
    }
    if (result !== 0) {
      const e = new Error(`Command ${cmd} ${ACK_RESULT[result] || 'failed'}`);
      e.result = result;
      throw e;
    }
    return result;
  }

  // Spin one motor. seq is ArduPilot's motor-test sequence (1 = A).
  // Each command sets one motor; during a test the others keep their last value.
  motorTest(seq, throttlePct, timeoutSec) {
    return this.command(MAV_CMD_DO_MOTOR_TEST, [seq, MOTOR_TEST_THROTTLE_PERCENT, throttlePct, timeoutSec, 1, 0]);
  }

  motorStop(seq) {
    return this.command(MAV_CMD_DO_MOTOR_TEST, [seq || 1, MOTOR_TEST_THROTTLE_PERCENT, 0, 0, 1, 0]).catch(() => {});
  }

  async reboot() {
    await this.command(MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN, [1]);
    this.rebooting = true;
    this.magCalSession = null; // a reboot ends any calibration
    this.accelCalSession = null;
    this.magCal = {};
    this.accelCalPos = null;
    this.rebootNeeded = false;
    this.esc = [];
    this.emit();
  }
}

export const vehicle = new Vehicle();
