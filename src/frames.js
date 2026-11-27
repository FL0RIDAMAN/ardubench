// Motor layouts for the frames this version supports.
//
// ArduPilot and Betaflight number the motors differently, so the layout
// depends on FRAME_TYPE. Positions are listed clockwise from front-right,
// which is also ArduPilot's motor-test order (A, B, C, D).

export const POSITIONS = [
  { key: 'FR', name: 'front-right', x: 220, y: 70 },
  { key: 'RR', name: 'rear-right', x: 220, y: 210 },
  { key: 'RL', name: 'rear-left', x: 80, y: 210 },
  { key: 'FL', name: 'front-left', x: 80, y: 70 },
];

// Betaflight's own Quad X numbering, by position (used for the "BF" labels).
const BF_NUMBER = { FR: 2, RR: 1, RL: 3, FL: 4 };

// Props-in spin direction, by position (same for ArduPilot X and Betaflight X).
const PROPS_IN = { FR: 'CCW', RR: 'CW', RL: 'CCW', FL: 'CW' };

// FRAME_TYPE -> which ArduPilot motor number sits at each position.
const FRAMES = {
  1: { name: 'QUAD X', motorAt: { FR: 1, RR: 4, RL: 2, FL: 3 }, reversed: false },
  12: { name: 'QUAD X · Betaflight order', motorAt: { FR: 2, RR: 1, RL: 3, FL: 4 }, reversed: false },
  18: { name: 'QUAD X · Betaflight order, reversed', motorAt: { FR: 2, RR: 1, RL: 3, FL: 4 }, reversed: true },
};

export const SUPPORTED_FRAME_TYPES = [1, 12, 18];

const LETTERS = ['A', 'B', 'C', 'D'];

// Returns the layout for a FRAME_CLASS / FRAME_TYPE pair, or null if this
// version doesn't support it yet.
export function getLayout(frameClass, frameType) {
  if (frameClass !== 1) return null; // 1 = quad
  const f = FRAMES[frameType];
  if (!f) return null;
  const motors = POSITIONS.map((pos, i) => {
    let dir = PROPS_IN[pos.key];
    if (f.reversed) dir = dir === 'CW' ? 'CCW' : 'CW';
    return {
      num: f.motorAt[pos.key], // ArduPilot motor number
      bf: BF_NUMBER[pos.key],
      pos: pos.key,
      posName: pos.name,
      x: pos.x,
      y: pos.y,
      dir,
      testSeq: i + 1, // ArduPilot motor-test sequence number (1 = A)
      letter: LETTERS[i],
    };
  }).sort((a, b) => a.num - b.num);
  return { name: f.name, frameType, motors };
}

export function frameName(frameClass, frameType) {
  if (frameClass === 1 && FRAMES[frameType]) return FRAMES[frameType].name;
  return `FRAME_CLASS ${frameClass} · FRAME_TYPE ${frameType}`;
}

// SERVOn_FUNCTION values: 33 = Motor1 ... 36 = Motor4.
export const MOTOR_FUNCTION_BASE = 32;
