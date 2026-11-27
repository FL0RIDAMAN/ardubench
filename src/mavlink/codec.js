// A small MAVLink v2 encoder/decoder.
//
// MAVLink is the language ArduPilot speaks over USB and telemetry radios.
// Every message is a "packet": a header (who sent it, which message it is),
// a payload (the actual fields), and a 2-byte checksum so corrupted packets
// can be thrown away. This file turns JS objects into packets and back.
//
// Only the messages listed in defs.js are supported. Add more by editing
// scripts/gen_defs.py and re-running it.

import { MESSAGES } from './defs.js';

const STX_V2 = 0xfd;
const STX_V1 = 0xfe;

const SIZES = {
  char: 1, int8_t: 1, uint8_t: 1, uint8_t_mavlink_version: 1,
  int16_t: 2, uint16_t: 2,
  int32_t: 4, uint32_t: 4, float: 4,
  int64_t: 8, uint64_t: 8, double: 8,
};

// Look up a message definition by numeric id.
const BY_ID = {};
for (const [name, def] of Object.entries(MESSAGES)) BY_ID[def.id] = { name, ...def };

// X.25 CRC used by MAVLink.
export function crcAccumulate(byte, crc) {
  let tmp = byte ^ (crc & 0xff);
  tmp = (tmp ^ (tmp << 4)) & 0xff;
  return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

export function crc(bytes, start, end, crcExtra) {
  let c = 0xffff;
  for (let i = start; i < end; i++) c = crcAccumulate(bytes[i], c);
  return crcAccumulate(crcExtra, c);
}

function payloadLength(def) {
  return def.fields.reduce((n, [, t, len]) => n + SIZES[t] * (len || 1), 0);
}

function writeField(view, offset, type, value) {
  switch (type) {
    case 'char': case 'uint8_t': view.setUint8(offset, value); break;
    case 'int8_t': view.setInt8(offset, value); break;
    case 'uint16_t': view.setUint16(offset, value, true); break;
    case 'int16_t': view.setInt16(offset, value, true); break;
    case 'uint32_t': view.setUint32(offset, value >>> 0, true); break;
    case 'int32_t': view.setInt32(offset, value, true); break;
    case 'float': view.setFloat32(offset, value, true); break;
    case 'double': view.setFloat64(offset, value, true); break;
    case 'uint64_t': view.setBigUint64(offset, BigInt(value), true); break;
    case 'int64_t': view.setBigInt64(offset, BigInt(value), true); break;
    default: throw new Error('Unknown type ' + type);
  }
}

function readField(view, offset, type) {
  switch (type) {
    case 'char': case 'uint8_t': return view.getUint8(offset);
    case 'int8_t': return view.getInt8(offset);
    case 'uint16_t': return view.getUint16(offset, true);
    case 'int16_t': return view.getInt16(offset, true);
    case 'uint32_t': return view.getUint32(offset, true);
    case 'int32_t': return view.getInt32(offset, true);
    case 'float': return view.getFloat32(offset, true);
    case 'double': return view.getFloat64(offset, true);
    case 'uint64_t': return view.getBigUint64(offset, true);
    case 'int64_t': return view.getBigInt64(offset, true);
    default: throw new Error('Unknown type ' + type);
  }
}

// Build a MAVLink v2 packet.
// name: e.g. 'PARAM_SET'; fields: { param_id: 'MOT_SPIN_ARM', ... }
export function encode(name, fields, { seq = 0, sysid = 255, compid = 190 } = {}) {
  const def = MESSAGES[name];
  if (!def) throw new Error('Unknown message ' + name);
  const full = new Uint8Array(payloadLength(def));
  const view = new DataView(full.buffer);
  let off = 0;
  for (const [fname, type, len] of def.fields) {
    const v = fields[fname];
    if (type === 'char' && len) {
      const s = String(v ?? '');
      for (let i = 0; i < len; i++) view.setUint8(off + i, i < s.length ? s.charCodeAt(i) & 0xff : 0);
      off += len;
    } else if (len) {
      for (let i = 0; i < len; i++) writeField(view, off + i * SIZES[type], type, (v && v[i]) || 0);
      off += SIZES[type] * len;
    } else {
      writeField(view, off, type, v ?? 0);
      off += SIZES[type];
    }
  }
  // MAVLink 2 drops trailing zero bytes from the payload (at least 1 byte stays).
  let plen = full.length;
  while (plen > 1 && full[plen - 1] === 0) plen--;

  const pkt = new Uint8Array(10 + plen + 2);
  pkt[0] = STX_V2;
  pkt[1] = plen;
  pkt[2] = 0; // incompat flags (no signing)
  pkt[3] = 0; // compat flags
  pkt[4] = seq & 0xff;
  pkt[5] = sysid;
  pkt[6] = compid;
  pkt[7] = def.id & 0xff;
  pkt[8] = (def.id >> 8) & 0xff;
  pkt[9] = (def.id >> 16) & 0xff;
  pkt.set(full.subarray(0, plen), 10);
  const c = crc(pkt, 1, 10 + plen, def.crcExtra);
  pkt[10 + plen] = c & 0xff;
  pkt[11 + plen] = c >> 8;
  return pkt;
}

// Turn a payload back into an object.
function decodePayload(def, payload) {
  const full = new Uint8Array(payloadLength(def)); // zero-filled: restores truncated bytes
  full.set(payload.subarray(0, Math.min(payload.length, full.length)));
  const view = new DataView(full.buffer);
  const out = {};
  let off = 0;
  for (const [fname, type, len] of def.fields) {
    if (type === 'char' && len) {
      let s = '';
      for (let i = 0; i < len; i++) {
        const b = full[off + i];
        if (b === 0) break;
        s += String.fromCharCode(b);
      }
      out[fname] = s;
      off += len;
    } else if (len) {
      out[fname] = [];
      for (let i = 0; i < len; i++) out[fname].push(readField(view, off + i * SIZES[type], type));
      off += SIZES[type] * len;
    } else {
      out[fname] = readField(view, off, type);
      off += SIZES[type];
    }
  }
  return out;
}

// A streaming parser: feed it bytes as they arrive from USB (they come in
// random-sized chunks), and it calls onMessage for every complete, valid packet.
export class MavParser {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.buf = new Uint8Array(0);
    this.stats = { good: 0, badCrc: 0, unknown: 0 };
  }

  push(chunk) {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    this.drain();
  }

  drain() {
    let i = 0;
    const b = this.buf;
    while (i < b.length) {
      if (b[i] !== STX_V2 && b[i] !== STX_V1) { i++; continue; }
      const v2 = b[i] === STX_V2;
      const hdr = v2 ? 10 : 6;
      if (i + hdr > b.length) break; // wait for more bytes
      const plen = b[i + 1];
      const signed = v2 && (b[i + 2] & 0x01);
      const total = hdr + plen + 2 + (signed ? 13 : 0);
      if (i + total > b.length) break;
      const msgid = v2 ? b[i + 7] | (b[i + 8] << 8) | (b[i + 9] << 16) : b[i + 5];
      const def = BY_ID[msgid];
      // A message we don't decode. We can't check its CRC without its
      // definition, so step forward one byte; the real next packet is found
      // when its CRC checks out.
      if (!def) { this.stats.unknown++; i++; continue; }
      const c = crc(b, i + 1, i + hdr + plen, def.crcExtra);
      const got = b[i + hdr + plen] | (b[i + hdr + plen + 1] << 8);
      if (c !== got) { this.stats.badCrc++; i++; continue; } // not a real packet start; resync
      this.stats.good++;
      const payload = b.subarray(i + hdr, i + hdr + plen);
      const msg = decodePayload(def, payload);
      msg._name = def.name;
      msg._sysid = v2 ? b[i + 5] : b[i + 3];
      msg._compid = v2 ? b[i + 6] : b[i + 4];
      this.onMessage(msg);
      i += total;
    }
    this.buf = b.slice(i);
  }
}

export { MESSAGES };
