import { readFileSync, writeFileSync } from 'node:fs';
import { encode, MavParser } from '../src/mavlink/codec.js';
const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url)));
let fail = 0;
const hex = (u8) => Buffer.from(u8).toString('hex');
const close = (a, b) => typeof a === 'number' ? Math.abs(a - b) < 1e-5 : JSON.stringify(a) === JSON.stringify(b);
const mine = [];
for (const c of cases) {
  const out = hex(encode(c.name, c.fields));
  mine.push({ name: c.name, hex: out });
  if (out !== c.hex) { fail++; console.log('ENCODE MISMATCH', c.name, '\n mine', out, '\n py  ', c.hex); }
  let got = null;
  const p = new MavParser((m) => (got = m));
  // feed in awkward chunks to exercise buffering
  const bytes = Buffer.from(c.hex, 'hex');
  for (let i = 0; i < bytes.length; i += 3) p.push(new Uint8Array(bytes.subarray(i, i + 3)));
  if (!got || got._name !== c.name) { fail++; console.log('DECODE FAILED', c.name); continue; }
  for (const [k, v] of Object.entries(c.fields)) if (!close(got[k], v)) { fail++; console.log('FIELD', c.name, k, got[k], v); }
}
// garbage + two packets back to back
const n = []; const p2 = new MavParser((m) => n.push(m._name));
p2.push(new Uint8Array([1, 2, 0xfd, 9, 9, ...Buffer.from(cases[0].hex, 'hex'), ...Buffer.from(cases[1].hex, 'hex')]));
if (n.join() !== 'PARAM_SET,COMMAND_LONG') { fail++; console.log('RESYNC', n); }
writeFileSync(new URL('./mine.json', import.meta.url), JSON.stringify(mine));
console.log(fail ? `FAILED ${fail}` : `OK: ${cases.length} messages match pymavlink byte-for-byte`);
process.exit(fail ? 1 : 0);
