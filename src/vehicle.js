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

// Parameters whose new value only takes effect after a reboot.
export function needsReboot(name) {
  return /^(FRAME_|MOT_PWM_TYPE|SERVO_BLH_|SERVO\d+_FUNCTION|SERIAL\d+_PROTOCOL|INS_HNTCH_ENABLE)/.test(name);
}

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
    if (result !== 0) throw new Error(`Command ${cmd} ${ACK_RESULT[result] || 'failed'}`);
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
    this.rebootNeeded = false;
    this.esc = [];
    this.emit();
  }
}

export const vehicle = new Vehicle();
