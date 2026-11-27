// End-to-end test of the Ports, Compass and Accel & Level plumbing: the app's
// Vehicle talking real MAVLink bytes to the Virtual FC.
import { Vehicle, CMD, MSG_ID, ACCEL_POS } from '../src/vehicle.js';
import { VirtualLink } from '../src/link/VirtualLink.js';
import { parseUarts, portNumbers, portWarnings, columnOf, baudRate, P } from '../src/ports.js';
import { decodeDevId, compassRows, priorityAfterMove } from '../src/compass.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };
const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(50); } return false; };

// ---- pure helpers -----------------------------------------------------------
check(baudRate(57) === 57600 && baudRate(115) === 115200 && baudRate(100) === 100000 && baudRate(921) === 921600 && baudRate(0) === 57600 && baudRate(2500000) === 2500000, 'map_baudrate cases');
check(columnOf(2) === 'msp' && columnOf(23) === 'rx' && columnOf(5) === 'sensor' && columnOf(4) === 'telemetry' && columnOf(37) === 'peripheral' && columnOf(-1) === null && columnOf(6) === 'other', 'columnOf');
const uarts = parseUarts('UARTV1\nSERIAL0 OTG1  TX=1 RX=2\nSERIAL1 UART7 TX=1\nIOMCU   UART8 TX=3\n');
check(uarts[0] === 'OTG1' && uarts[1] === 'UART7' && Object.keys(uarts).length === 2, 'parseUarts: ' + JSON.stringify(uarts));
{
  const vals = { SERIAL1_PROTOCOL: 23, SERIAL2_PROTOCOL: 23, SERIAL3_PROTOCOL: 5, SERIAL3_OPTIONS: 1 << 10, SERIAL4_PROTOCOL: 37, VTX_ENABLE: 0, OSD_TYPE: 5 };
  const w = portWarnings([1, 2, 3, 4], (n) => vals[n]);
  check(w.some((x) => x.level === 'error' && /Multiple SERIAL ports configured for RC input/.test(x.text)), 'warning: two Serial Rx ports');
  check(w.some((x) => x.level === 'error' && /bit 10/.test(x.text)), 'warning: OPTIONS bit 10');
  check(w.some((x) => /VTX_ENABLE/.test(x.text)), 'warning: SmartAudio without VTX_ENABLE');
  check(w.some((x) => /MSP DisplayPort uart not available/.test(x.text)), 'warning: OSD_TYPE 5 without a DisplayPort port');
  check(portWarnings([1, 2], (n) => ({ SERIAL1_PROTOCOL: 23, SERIAL2_PROTOCOL: 2 })[n]).length === 0, 'no warnings for a normal setup');
}
// Compass device ids, decoded like Mission Planner / ArduPilot's decode_devid.py.
{
  const d = decodeDevId(855297);
  check(d.busType === 'I2C' && d.bus === 0 && d.address === 0x0d && d.devType === 'QMC5883L', 'DEV_ID 855297 = QMC5883L on I2C bus 0 at 0x0D: ' + JSON.stringify(d));
  const c = decodeDevId(97539); // DroneCAN node 125, sensor 0 -> devtype 1
  check(c.busType === 'DroneCAN' && c.address === 125, 'DroneCAN DEV_ID: address is the node id: ' + JSON.stringify(c));
  const params = { COMPASS_DEV_ID: 855297, COMPASS_DEV_ID2: 658953, COMPASS_DEV_ID3: 0, COMPASS_PRIO1_ID: 658953, COMPASS_PRIO2_ID: 855297, COMPASS_PRIO3_ID: 12345 };
  const rows = compassRows((n) => params[n]);
  check(rows.length === 3 && rows[0].id === 658953 && rows[1].id === 855297 && rows[2].missing, 'compass rows: priority order, a PRIO id with no DEV_ID is Missing');
  check(rows[0].storage === 1 && rows[1].storage === 0, 'compass rows know their storage slot');
  const moved = priorityAfterMove(rows.filter((r) => !r.missing), 1, -1);
  check(moved.COMPASS_PRIO1_ID === 855297 && moved.COMPASS_PRIO2_ID === 658953 && moved.COMPASS_PRIO3_ID === 0, 'moving a compass up rewrites PRIO1..3 like Mission Planner: ' + JSON.stringify(moved));
}

// ---- against the Virtual FC -------------------------------------------------
const v = new Vehicle();
await v.connect(new VirtualLink());
check(v.paramsLoaded, `connected, ${v.params.size} params`);
const pv = (n) => v.param(n);
check(portNumbers(Object.fromEntries([...v.params].map(([k, x]) => [k, x.value]))).join() === '0,1,2,3,4,5,6', 'virtual FC has SERIAL0..6');
check(portWarnings([0, 1, 2, 3, 4, 5, 6], pv).length === 0, 'virtual FC port setup has no warnings: ' + JSON.stringify(portWarnings([0, 1, 2, 3, 4, 5, 6], pv)));

// MAVFTP @SYS/uarts.txt (several chunks? no, it's small; also test a missing file)
const text = await v.ftpRead('@SYS/uarts.txt');
const names = parseUarts(text);
check(text.startsWith('UARTV1\n') && names[0] === 'OTG1' && names[1] === 'UART7' && names[6] === 'UART4', 'MAVFTP read @SYS/uarts.txt: ' + JSON.stringify(names));
let missing = null;
try { await v.ftpRead('@SYS/nope.txt'); } catch (e) { missing = e; }
check(missing && /FTP error 2/.test(missing.message), 'MAVFTP missing file -> error (FailErrno): ' + (missing && missing.message));
check(parseUarts(await v.ftpRead('@SYS/uarts.txt'))[3] === 'UART2', 'MAVFTP works again after an error (session closed)');

// Live data only arrives once asked for.
await sleep(400);
check(v.attitude === null && v.mag.length === 0, 'no ATTITUDE / compass data until requested');
await Promise.all([v.setRate(MSG_ID.ATTITUDE, 10), v.setRate(MSG_ID.VFR_HUD, 5), v.setRate(MSG_ID.RAW_IMU, 5), v.setRate(MSG_ID.SCALED_IMU2, 5)]);
await waitFor(() => v.attitude && v.heading !== null && v.mag[0] && v.mag[1], 2000);
check(v.attitude && Math.abs(v.attitude.roll * 180 / Math.PI - 0.4) < 0.1, 'ATTITUDE roll ~0.4 deg before trim: ' + (v.attitude && (v.attitude.roll * 180 / Math.PI).toFixed(2)));
check(v.heading === 87, 'VFR_HUD heading 87: ' + v.heading);
const field = v.mag[0] && Math.hypot(v.mag[0].x, v.mag[0].y, v.mag[0].z);
check(field > 185 && field < 875, 'compass field inside 185..875 mGauss: ' + Math.round(field));

// ---- compass calibration (like Mission Planner's onboard calibration) ----
check(await v.commandResult(CMD.DO_START_MAG_CAL, [0, 1, 1, 0, 0]) === 0, 'DO_START_MAG_CAL accepted');
await Promise.all([v.setRate(MSG_ID.MAG_CAL_PROGRESS, 10), v.setRate(MSG_ID.MAG_CAL_REPORT, 10)]);
await waitFor(() => v.magCal[0] && v.magCal[0].progress && v.magCal[0].progress.completion_pct > 10, 4000);
check(v.magCal[0] && v.magCal[0].progress.cal_status === 2 && v.magCal[1] && v.magCal[1].progress, 'progress for both compasses, step one');
await waitFor(() => v.magCal[0]?.report && v.magCal[1]?.report, 20000);
const r0 = v.magCal[0]?.report, r1 = v.magCal[1]?.report;
check(r0 && r0.cal_status === 4 && r0.autosaved === 1 && r1 && r1.cal_status === 4, 'both compasses report SUCCESS, autosaved');
await v.readParams(['COMPASS_OFS_X', 'COMPASS_OFS2_Y']);
check(Math.abs(v.param('COMPASS_OFS_X') - r0.ofs_x) < 0.01 && Math.abs(v.param('COMPASS_OFS2_Y') - r1.ofs_y) < 0.01, 'offsets saved to the matching storage slots');
check(await v.commandResult(CMD.DO_ACCEPT_MAG_CAL, [0, 0, 1]) === 0, 'accept: ACCEPTED');
await sleep(400);
const after = { ...v.magCal[0] };
await sleep(400);
check(v.magCal[0].t === after.t, 'after accept the FC stops sending reports');
check(await v.commandResult(CMD.DO_CANCEL_MAG_CAL, [0, 0, 1]) === 0, 'cancel: always ACCEPTED');
// Not using a compass leaves it out (COMPASS_USEn is by priority slot).
await v.setParam('COMPASS_USE2', 0);
v.magCal = {};
check(await v.commandResult(CMD.DO_START_MAG_CAL, [0, 1, 1, 0, 0]) === 0, 'start again with compass 2 not used');
await sleep(800);
check(v.magCal[0] && !v.magCal[1], 'only compass 1 calibrates');
check(await v.commandResult(CMD.DO_ACCEPT_MAG_CAL, [0, 0, 1]) === 4, 'accept while still running: FAILED');
await v.setParam('COMPASS_USE2', 1);
v.magCal = {};
check(await v.commandResult(CMD.DO_START_MAG_CAL, [0, 1, 1, 0, 0]) === 0, 'start again');
await sleep(800);
await v.commandResult(CMD.DO_CANCEL_MAG_CAL, [0, 0, 1]);
const cancelledAt = v.magCal[0]?.t;
await sleep(500);
check(v.magCal[0]?.t === cancelledAt, 'after cancel the FC stops sending progress');
check(await v.commandResult(CMD.DO_ACCEPT_MAG_CAL, [0, 0, 1]) === 0, 'accept after cancel: ACCEPTED (nothing running, like ArduPilot)');
await v.setParam('COMPASS_USE2', 1);
await Promise.all([v.setRate(MSG_ID.MAG_CAL_PROGRESS, 0), v.setRate(MSG_ID.MAG_CAL_REPORT, 0)]);

// ---- level (trim), simple and 6-position accelerometer calibrations ----
check(await v.commandResult(CMD.PREFLIGHT_CALIBRATION, [0, 0, 0, 0, 2, 0, 0], 30000) === 0, 'Calibrate Level accepted');
check(v.messages.some((m) => m.text === 'Trim OK: roll=0.40 pitch=-0.30 yaw=0.00'), 'Trim OK text');
await v.readParams(['AHRS_TRIM_X', 'AHRS_TRIM_Y']);
check(Math.abs(v.param('AHRS_TRIM_X') * 180 / Math.PI - 0.4) < 0.01, 'AHRS_TRIM_X saved (rad)');
await sleep(300);
check(Math.abs(v.attitude.roll * 180 / Math.PI) < 0.1, 'attitude reads level after trimming (trim applies live)');
check(await v.commandResult(CMD.PREFLIGHT_CALIBRATION, [0, 0, 0, 0, 4, 0, 0], 30000) === 1, 'simple cal within 5 s of the last: TEMPORARILY_REJECTED');
await sleep(5000);
check(await v.commandResult(CMD.PREFLIGHT_CALIBRATION, [0, 0, 0, 0, 4, 0, 0], 30000) === 0, 'simple accel cal accepted');
await v.readParams(['INS_ACCOFFS_Z', 'AHRS_TRIM_X']);
check(Math.abs(v.param('INS_ACCOFFS_Z') - 0.231) < 1e-4 && v.param('AHRS_TRIM_X') === 0, 'simple cal saved offsets and zeroed the trims');

await sleep(5000);
check(await v.commandResult(CMD.PREFLIGHT_CALIBRATION, [0, 0, 0, 0, 1, 0, 0], 30000) === 0, '6-position calibration started');
await waitFor(() => v.accelCalPos && v.accelCalPos.pos === ACCEL_POS.LEVEL, 3000);
check(v.accelCalPos?.pos === ACCEL_POS.LEVEL, 'FC asks for LEVEL');
check(v.messages.some((m) => m.text === 'Place vehicle level and press any key.'), '"Place vehicle level" text');
check(await v.commandResult(CMD.ACCELCAL_VEHICLE_POS, [ACCEL_POS.LEFT]) === 4, 'confirming the wrong position: FAILED');
for (const pos of [1, 2, 3, 4, 5, 6]) {
  await waitFor(() => v.accelCalPos && v.accelCalPos.pos === pos, 3000);
  check(await v.commandResult(CMD.ACCELCAL_VEHICLE_POS, [pos]) === 0, `position ${pos} confirmed`);
}
await waitFor(() => v.messages.some((m) => m.text === 'Calibration successful'), 3000);
check(v.messages.some((m) => m.text === 'Calibration successful'), '"Calibration successful"');
check(!v.messages.some((m) => /Place vehicle on its LEFT/.test(m.text)), 'no more "Place vehicle" texts after the GCS answered (like ArduPilot)');
await waitFor(() => v.accelCalPos?.pos === ACCEL_POS.SUCCESS, 2500);
check(v.accelCalPos?.pos === ACCEL_POS.SUCCESS, 'FC keeps reporting SUCCESS');

await v.disconnect();
if (fail) { console.log(`FAILED: ${fail}`); process.exit(1); }
console.log('OK: setup (ports, compass, accel)');
process.exit(0);
