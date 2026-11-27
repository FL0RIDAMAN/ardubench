// Compass data for the Compass tab. From ArduPilot's source (master):
//   libraries/AP_Compass/AP_Compass.cpp (parameters), AP_Compass_Backend.h
//   (DevTypes), libraries/AP_HAL/Device.h (bus types and the device id layout),
//   AP_Compass_Calibration.cpp / CompassCalibrator.cpp (calibration).
// The table copies Mission Planner's compass page (ConfigHWCompass2.cs).

// Rotation names shared by COMPASS_ORIENTn and AHRS_ORIENTATION (@Values).
// 41 doesn't exist; 100 is the old pre-4.2 custom rotation.
export const ROTATIONS = [
  [0, 'None'], [1, 'Yaw45'], [2, 'Yaw90'], [3, 'Yaw135'], [4, 'Yaw180'], [5, 'Yaw225'], [6, 'Yaw270'], [7, 'Yaw315'],
  [8, 'Roll180'], [9, 'Yaw45Roll180'], [10, 'Yaw90Roll180'], [11, 'Yaw135Roll180'], [12, 'Pitch180'], [13, 'Yaw225Roll180'],
  [14, 'Yaw270Roll180'], [15, 'Yaw315Roll180'], [16, 'Roll90'], [17, 'Yaw45Roll90'], [18, 'Yaw90Roll90'], [19, 'Yaw135Roll90'],
  [20, 'Roll270'], [21, 'Yaw45Roll270'], [22, 'Yaw90Roll270'], [23, 'Yaw135Roll270'], [24, 'Pitch90'], [25, 'Pitch270'],
  [26, 'Yaw90Pitch180'], [27, 'Yaw270Pitch180'], [28, 'Pitch90Roll90'], [29, 'Pitch90Roll180'], [30, 'Pitch90Roll270'],
  [31, 'Pitch180Roll90'], [32, 'Pitch180Roll270'], [33, 'Pitch270Roll90'], [34, 'Pitch270Roll180'], [35, 'Pitch270Roll270'],
  [36, 'Yaw90Pitch180Roll90'], [37, 'Yaw270Roll90'], [38, 'Yaw293Pitch68Roll180'], [39, 'Pitch315'], [40, 'Pitch315Roll90'],
  [42, 'Roll45'], [43, 'Roll315'], [100, 'Custom 4.1 and older'], [101, 'Custom 1'], [102, 'Custom 2'],
];

// "Yaw90Roll180" -> "Yaw 90° Roll 180°" (rotations applied in that order).
export function rotationLabel(value) {
  const r = ROTATIONS.find(([n]) => n === value);
  if (!r) return `Unknown (${value})`;
  if (value === 0) return 'None (default)';
  if (value >= 100) return r[1];
  return r[1].replace(/(Yaw|Pitch|Roll)(\d+)/g, '$1 $2° ').trim();
}

// AP_HAL::Device::BusType. UAVCAN is DroneCAN.
const BUS_TYPES = { 0: 'Unknown', 1: 'I2C', 2: 'SPI', 3: 'DroneCAN', 4: 'SITL', 5: 'MSP', 6: 'Serial', 7: 'WSPI' };

// AP_Compass_Backend::DevTypes. 0x19 (LIS2MDL) was retired; same sensor as IIS2MDC.
const DEV_TYPES = {
  0x01: 'HMC5883_OLD', 0x02: 'LSM303D', 0x04: 'AK8963', 0x05: 'BMM150', 0x06: 'LSM9DS1', 0x07: 'HMC5883',
  0x08: 'LIS3MDL', 0x09: 'AK09916', 0x0a: 'IST8310', 0x0b: 'ICM20948', 0x0c: 'MMC3416', 0x0d: 'QMC5883L',
  0x0e: 'MAG3110', 0x0f: 'SITL', 0x10: 'IST8308', 0x11: 'RM3100', 0x12: 'RM3100_2', 0x13: 'MMC5983', 0x14: 'AK09918',
  0x15: 'AK09915', 0x16: 'QMC5883P', 0x17: 'BMM350', 0x18: 'IIS2MDC', 0x19: 'LIS2MDL', 0x1a: 'AF9838', 0x1b: 'AK09940A',
};

// A compass device id: bus type (3 bits), bus (5), address (8), device type (8).
// For DroneCAN the address is the node id and the device type is the sensor id + 1.
export function decodeDevId(id) {
  const busType = id & 7, bus = (id >> 3) & 0x1f, address = (id >> 8) & 0xff, devtype = (id >> 16) & 0xff;
  const can = busType === 3;
  return {
    busType: BUS_TYPES[busType] || `bus ${busType}`,
    bus,
    address,
    devType: can ? `sensor ${devtype - 1}` : DEV_TYPES[devtype] || `type 0x${devtype.toString(16)}`,
    name: can ? `DroneCAN node ${address}` : DEV_TYPES[devtype] || `Unknown 0x${devtype.toString(16)}`,
  };
}

// Parameter names by storage slot (DEV_ID, OFS, ORIENT, EXTERNAL...) and by
// priority slot (PRIOn_ID, USEn). ArduPilot reorders the storage slots to match
// the priorities at boot (Compass::_reorder_compass_params), but the app always
// matches them by device id.
const S = ['', '2', '3'];
export const storageParam = {
  devId: (s) => `COMPASS_DEV_ID${S[s]}`,
  orient: (s) => `COMPASS_ORIENT${S[s]}`,
  external: (s) => (s === 0 ? 'COMPASS_EXTERNAL' : `COMPASS_EXTERN${s + 1}`),
  ofs: (s, axis) => `COMPASS_OFS${S[s]}_${axis}`,
};
export const priorityParam = {
  id: (p) => `COMPASS_PRIO${p + 1}_ID`,
  use: (p) => `COMPASS_USE${S[p]}`,
};

// The table rows, like Mission Planner: the priority ids first (in order),
// then every other detected compass (COMPASS_DEV_ID..DEV_ID8). A priority id
// with no matching DEV_ID is a compass that was set up but isn't found now.
// value(name) returns the parameter as edited.
export function compassRows(value) {
  const devIds = [];
  for (let s = 0; s < 3; s++) {
    const id = value(storageParam.devId(s));
    if (id) devIds.push({ id, storage: s });
  }
  for (let s = 4; s <= 8; s++) { // extra compasses ArduPilot found but has no slot for
    const id = value(`COMPASS_DEV_ID${s}`);
    if (id) devIds.push({ id, storage: null, extraParam: `COMPASS_DEV_ID${s}` });
  }
  const rows = [];
  for (let p = 0; p < 3; p++) {
    const id = value(priorityParam.id(p));
    if (!id) continue;
    const d = devIds.find((x) => x.id === id);
    rows.push({ id, priority: p, storage: d ? d.storage : null, missing: !d, ...decodeDevId(id) });
  }
  for (const d of devIds) {
    if (rows.some((r) => r.id === d.id)) continue;
    rows.push({ id: d.id, priority: null, storage: d.storage, missing: false, extraParam: d.extraParam, ...decodeDevId(d.id) });
  }
  return rows;
}

// Moving a row up (-1) or down (+1) rewrites COMPASS_PRIO1..3_ID from the
// first three rows, 0 where there are fewer (Mission Planner's UpdateFirst3).
export function priorityAfterMove(rows, index, dir) {
  const list = rows.slice();
  const j = index + dir;
  if (j >= 0 && j < list.length) [list[index], list[j]] = [list[j], list[index]];
  return priorityFromRows(list);
}
export function priorityFromRows(list) {
  const out = {};
  for (let p = 0; p < 3; p++) out[priorityParam.id(p)] = list[p] ? list[p].id : 0;
  return out;
}

// MAG_CAL_STATUS (mavlink common.xml). 8-10 are newer ArduPilot failure reasons.
export const CAL_STATUS = {
  0: 'Not started', 1: 'Waiting to start', 2: 'Running (step 1)', 3: 'Running (step 2)', 4: 'Success', 5: 'Failed',
  6: 'Failed: bad orientation', 7: 'Failed: bad radius', 8: 'Failed: offsets too high', 9: 'Failed: scaling', 10: 'Failed: residuals too high',
};

// COMPASS_CAL_FIT @Values and COMPASS_AUTO_ROT @Values.
export const CAL_FIT = [[4, 'Very Strict'], [8, 'Strict'], [16, 'Default'], [32, 'Relaxed']];
export const AUTO_ROT = [[0, 'Disabled'], [1, 'Check only'], [2, 'Check and fix'], [3, 'Check and fix, incl. 45° rotations']];
export const EXTERNAL = { 0: 'Internal', 1: 'External', 2: 'Forced external' };

// ArduPilot's pre-arm "Check mag field" limits (AP_Arming.cpp: min 185, max 875 mGauss).
export const FIELD_MIN = 185;
export const FIELD_MAX = 875;
