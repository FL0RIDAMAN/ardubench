// Serial port data for the Ports tab. Everything here comes from ArduPilot's
// source (master), libraries/AP_SerialManager/AP_SerialManager.cpp unless noted:
//   SERIALn_PROTOCOL @Values, SERIALn_BAUD @Values and map_baudrate(),
//   SERIALn_OPTIONS @Bitmask. Protocol, options and (in practice) baud changes
//   take effect after a reboot (ports are opened once, in init()).
// The columns copy Betaflight Configurator 2026.6.2's Ports tab
// (src/components/tabs/PortsTab.vue). ArduPilot allows one protocol per port,
// so choosing something in one column clears the others on that row.

// SERIALn_PROTOCOL value -> ArduPilot's name (@Values, SERIAL1_PROTOCOL).
export const PROTOCOL_NAMES = {
  '-1': 'None', 1: 'MAVLink1', 2: 'MAVLink2', 3: 'Frsky D', 4: 'Frsky SPort', 5: 'GPS',
  7: 'Alexmos Gimbal Serial', 8: 'Gimbal', 9: 'Rangefinder', 10: 'FrSky SPort Passthrough (OpenTX)',
  11: 'Lidar360', 13: 'Beacon', 14: 'Volz servo out', 15: 'SBus servo out', 16: 'ESC Telemetry',
  17: 'Devo Telemetry', 18: 'OpticalFlow', 19: 'RobotisServo', 20: 'NMEA Output', 21: 'WindVane',
  22: 'SLCAN', 23: 'RCIN', 24: 'EFI Serial', 25: 'LTM', 26: 'RunCam', 27: 'HottTelem',
  28: 'Scripting', 29: 'Crossfire VTX', 30: 'Generator', 31: 'Winch', 32: 'MSP', 33: 'DJI FPV',
  34: 'AirSpeed', 35: 'ADSB', 36: 'AHRS', 37: 'SmartAudio', 38: 'FETtecOneWire', 39: 'Torqeedo',
  40: 'AIS', 41: 'CoDevESC', 42: 'DisplayPort', 43: 'MAVLink High Latency', 44: 'IRC Tramp',
  45: 'DDS XRCE', 46: 'IMUDATA', 48: 'PPP', 49: 'i-BUS Telemetry', 50: 'IOMCU',
};

export const P = { NONE: -1, MAVLINK1: 1, MAVLINK2: 2, GPS: 5, ESC_TELEM: 16, RCIN: 23, SMARTAUDIO: 37, DISPLAYPORT: 42, TRAMP: 44 };

// The Betaflight columns. `bf` is Betaflight's own label for the equivalent
// function (from Betaflight's locales/en/messages.json, portsFunction_*);
// protocols without one are ArduPilot only. Betaflight sorts each column by
// name; columnItems() does the same.
export const COLUMNS = {
  telemetry: [
    { p: 1, bf: 'MAVLink', label: 'MAVLink1' },
    { p: 3, bf: 'FrSky', label: 'FrSky (Frsky D)' },
    { p: 4, bf: 'SmartPort', label: 'SmartPort (Frsky SPort)' },
    { p: 10, bf: 'SmartPort', label: 'SmartPort Passthrough (OpenTX)' },
    { p: 27, bf: 'HoTT', label: 'HoTT' },
    { p: 25, bf: 'LTM', label: 'LTM' },
    { p: 49, bf: 'iBUS', label: 'iBUS (i-BUS Telemetry)' },
    { p: 32, label: 'MSP (telemetry for OSDs and goggles)' },
    { p: 17, label: 'Devo Telemetry' },
    { p: 20, label: 'NMEA Output' },
    { p: 43, label: 'MAVLink High Latency' },
  ],
  sensor: [
    { p: 5, bf: 'GPS', label: 'GPS' },
    { p: 16, bf: 'ESC', label: 'ESC (ESC Telemetry)' },
    { p: 18, label: 'OpticalFlow' },
    { p: 34, label: 'AirSpeed' },
    { p: 35, label: 'ADSB' },
    { p: 13, label: 'Beacon' },
    { p: 11, label: 'Lidar360' },
    { p: 21, label: 'WindVane' },
    { p: 24, label: 'EFI Serial' },
    { p: 30, label: 'Generator' },
    { p: 36, label: 'AHRS' },
    { p: 40, label: 'AIS' },
    { p: 46, label: 'IMUDATA' },
  ],
  peripheral: [
    { p: 37, bf: 'VTX (TBS SmartAudio)', label: 'VTX (TBS SmartAudio)' },
    { p: 44, bf: 'VTX (IRC Tramp)', label: 'VTX (IRC Tramp)' },
    { p: 42, bf: 'VTX (MSP + Displayport)', label: 'VTX (MSP + Displayport)' },
    { p: 26, bf: 'Camera (RunCam Protocol)', label: 'Camera (RunCam Protocol)' },
    // Betaflight lists its Benewake LIDAR as a peripheral (usePortsRules.js).
    // ArduPilot's protocol 9 is any serial rangefinder; RNGFND1_TYPE picks which.
    { p: 9, bf: 'Benewake LIDAR', label: 'Rangefinder (e.g. Benewake LIDAR)' },
    { p: 33, label: 'DJI FPV (older DJI air units)' },
    { p: 29, label: 'Crossfire VTX' },
    { p: 8, label: 'Gimbal' },
    { p: 7, label: 'Alexmos Gimbal Serial' },
    { p: 28, label: 'Scripting' },
    { p: 14, label: 'Volz servo out' },
    { p: 15, label: 'SBus servo out' },
    { p: 19, label: 'RobotisServo' },
    { p: 38, label: 'FETtecOneWire' },
    { p: 41, label: 'CoDevESC' },
    { p: 22, label: 'SLCAN' },
    { p: 31, label: 'Winch' },
    { p: 39, label: 'Torqeedo' },
    { p: 45, label: 'DDS XRCE' },
    { p: 48, label: 'PPP' },
    { p: 50, label: 'IOMCU' },
  ],
};

// A column's choices: Betaflight equivalents (sorted by name, like Betaflight),
// then ArduPilot-only protocols (sorted by name).
export function columnItems(col) {
  const byLabel = (a, b) => a.label.localeCompare(b.label);
  const list = COLUMNS[col] || [];
  return { bf: list.filter((x) => x.bf).sort(byLabel), ap: list.filter((x) => !x.bf).sort(byLabel) };
}

// Which column a protocol value lives in ('msp' = Configuration/MAVLink switch,
// 'rx' = Serial Rx switch). Unknown values (e.g. 6, 12, 47) are shown as "Other".
export function columnOf(protocol) {
  if (protocol === P.MAVLINK2) return 'msp';
  if (protocol === P.RCIN) return 'rx';
  for (const [col, list] of Object.entries(COLUMNS)) if (list.some((x) => x.p === protocol)) return col;
  if (protocol === P.NONE || protocol === 0) return null; // 0 isn't a listed value; treat it like None
  return 'other';
}

// SERIALn_BAUD @Values (code -> label), in order.
export const BAUDS = [
  [1, '1200'], [2, '2400'], [4, '4800'], [9, '9600'], [19, '19200'], [38, '38400'], [57, '57600'],
  [111, '111100'], [115, '115200'], [230, '230400'], [256, '256000'], [460, '460800'], [500, '500000'],
  [921, '921600'], [1500, '1.5MBaud'], [2000, '2MBaud'], [12500000, '12.5MBaud'],
];

// AP_SerialManager::map_baudrate(): the rate a SERIALn_BAUD value means.
export function baudRate(code) {
  let rate = code <= 0 ? 57 : code;
  const table = { 1: 1200, 2: 2400, 4: 4800, 9: 9600, 19: 19200, 38: 38400, 57: 57600, 100: 100000, 111: 111100, 115: 115200, 230: 230400, 256: 256000, 460: 460800, 500: 500000, 921: 921600, 1500: 1500000, 2000: 2000000 };
  if (table[rate]) return table[rate];
  if (rate > 2000) return rate;
  return rate * 1000;
}

// Protocols that ignore SERIALn_BAUD (ArduPilot source):
//   RCIN auto-detects (AP_RCProtocol.cpp cycles 115200 / 100000 inverted / 416666 ...);
//   FrSky D 9600, SPort and Passthrough 57600, AlexMos and Gimbal 115200 (set in
//   AP_SerialManager::init, which also rewrites the BAUD parameter);
//   ESC Telemetry 115200 (AP_BLHeli.cpp begin(115200)).
export const FIXED_BAUD = { 23: 'Auto', 3: '9600', 4: '57600', 10: '57600', 7: '115200', 8: '115200', 16: '115200' };

// SERIALn_OPTIONS @Bitmask. Bits 10 and 12 moved to MAVn_OPTIONS in 4.7 and
// now fail pre-arm if set, so they're shown only to clear them.
export const OPTION_BITS = [
  [0, 'InvertRX'], [1, 'InvertTX'], [2, 'HalfDuplex'], [3, 'SwapTXRX'], [4, 'RX_PullDown'], [5, 'RX_PullUp'],
  [6, 'TX_PullDown'], [7, 'TX_PullUp'], [8, 'RX_NoDMA'], [9, 'TX_NoDMA'], [11, 'DisableFIFO'],
];
export const OPTION_BITS_MOVED = [[10, "Don't forward mavlink to/from (moved to MAVn_OPTIONS)"], [12, 'Ignore Streamrate (moved to MAVn_OPTIONS)']];

// BRD_SERn_RTSCTS @Values (AP_BoardConfig.cpp), shown after the port name like Mission Planner does.
export const RTSCTS = { 1: 'RTS/CTS', 2: 'RTS/CTS Auto', 3: 'RS-485' };

// The ports this FC has: SERIAL0..SERIAL9 whose PROTOCOL parameter exists.
export function portNumbers(params) {
  const out = [];
  for (let n = 0; n <= 9; n++) if (params[`SERIAL${n}_PROTOCOL`] !== undefined) out.push(n);
  return out;
}

// Parse ArduPilot's @SYS/uarts.txt (ChibiOS Util::uart_info): "UARTV1" then
// lines like "SERIAL1 UART7 TX=..." or "SERIAL0 OTG1  TX=...". Returns { n: 'UART7' }.
export function parseUarts(text) {
  const names = {};
  if (!text) return names;
  for (const line of text.split('\n')) {
    const m = line.match(/^SERIAL(\d+)\s+(\S+)/);
    if (m) names[Number(m[1])] = m[2];
  }
  return names;
}

// Problems with a set of port protocols that ArduPilot reports or silently
// works around. Each is from ArduPilot's source:
//   RCIN on 2+ ports: pre-arm "Multiple SERIAL ports configured for RC input" (AP_Arming.cpp)
//   OPTIONS bit 10/12: pre-arm failure (AP_SerialManager::pre_arm_checks)
//   ESC Telemetry: only the first port is used, and only if SERVO_BLH_TRATE > 0 (AP_BLHeli.cpp)
//   GPS: at most 2 GPS receivers (AP_GPS_config.h GPS_MAX_RECEIVERS)
//   SmartAudio / Tramp: first port only, and only with VTX_ENABLE = 1 (AP_SmartAudio.cpp, AP_Tramp.cpp)
//   DisplayPort with OSD_TYPE not 5 does nothing for the OSD; OSD_TYPE 5 without a
//     DisplayPort port gives "MSP DisplayPort uart not available" (AP_OSD_MSP_DisplayPort.cpp)
//   MAVLink: 5 MAVLink channels on boards with <= 1 MB flash, 8 on bigger ones (GCS_MAVLink.h)
// value(name) returns the parameter as edited (unsaved changes included).
export function portWarnings(nums, value) {
  const proto = (n) => value(`SERIAL${n}_PROTOCOL`);
  const using = (p) => nums.filter((n) => proto(n) === p);
  const list = (ns) => ns.map((n) => `SERIAL${n}`).join(', ');
  const w = [];
  const rc = using(P.RCIN);
  if (rc.length > 1) w.push({ level: 'error', text: `Serial Rx is on ${list(rc)}. ArduPilot won't arm: “Multiple SERIAL ports configured for RC input”. Pick one.` });
  for (const n of nums) {
    const o = value(`SERIAL${n}_OPTIONS`) || 0;
    if (o & (1 << 10)) w.push({ level: 'error', text: `SERIAL${n}_OPTIONS bit 10 is set. ArduPilot won't arm until it's cleared (it moved to MAVn_OPTIONS bit 1).` });
    if (o & (1 << 12)) w.push({ level: 'error', text: `SERIAL${n}_OPTIONS bit 12 is set. ArduPilot won't arm until it's cleared (it moved to MAVn_OPTIONS bit 2).` });
  }
  const esc = using(P.ESC_TELEM);
  if (esc.length > 1) w.push({ level: 'warn', text: `ESC telemetry is on ${list(esc)}. ArduPilot only reads the first (SERIAL${esc[0]}).` });
  if (esc.length && value('SERVO_BLH_TRATE') !== undefined && value('SERVO_BLH_TRATE') <= 0) {
    w.push({ level: 'warn', text: 'ESC telemetry is on, but SERVO_BLH_TRATE is 0, so ArduPilot won’t read it.' });
  }
  const gps = using(P.GPS);
  if (gps.length > 2) w.push({ level: 'warn', text: `GPS is on ${list(gps)}. ArduPilot uses at most 2 GPS receivers.` });
  for (const [p, name] of [[P.SMARTAUDIO, 'SmartAudio'], [P.TRAMP, 'IRC Tramp']]) {
    const ports = using(p);
    if (ports.length > 1) w.push({ level: 'warn', text: `${name} is on ${list(ports)}. ArduPilot only uses the first (SERIAL${ports[0]}).` });
    if (ports.length && value('VTX_ENABLE') !== undefined && value('VTX_ENABLE') !== 1) {
      w.push({ level: 'warn', text: `${name} needs VTX_ENABLE = 1 (it’s ${value('VTX_ENABLE')}).` });
    }
  }
  const dp = using(P.DISPLAYPORT);
  const osd = value('OSD_TYPE');
  if (dp.length && osd !== undefined && osd !== 5) w.push({ level: 'warn', text: `DisplayPort is on ${list(dp)}, but OSD_TYPE is ${osd}. Set OSD_TYPE to 5 (MSP_DISPLAYPORT) for an HD OSD.` });
  if (!dp.length && osd === 5) w.push({ level: 'warn', text: 'OSD_TYPE is 5 (MSP_DISPLAYPORT) but no port is set to VTX (MSP + Displayport). ArduPilot reports “MSP DisplayPort uart not available”.' });
  const mav = nums.filter((n) => proto(n) === P.MAVLINK1 || proto(n) === P.MAVLINK2 || proto(n) === 43);
  if (mav.length > 5) w.push({ level: 'warn', text: `MAVLink is on ${mav.length} ports (including USB). Boards with 1 MB of flash or less only have 5 MAVLink channels; larger boards have 8.` });
  return w;
}
