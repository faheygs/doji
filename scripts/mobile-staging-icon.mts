// Deterministic code-native test-app artwork. Never modifies the production icons.
import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

function crc(bytes: Uint8Array): number {
  let result = 0xffffffff;
  for (const byte of bytes) {
    result ^= byte;
    for (let bit = 0; bit < 8; bit++) result = (result >>> 1) ^ (result & 1 ? 0xedb88320 : 0);
  }
  return (result ^ 0xffffffff) >>> 0;
}
function chunk(type: string, bytes: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), bytes]);
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  checksum.writeUInt32BE(crc(body));
  return Buffer.concat([length, body, checksum]);
}
export function stagingIcon(): Buffer {
  const width = 1024,
    stride = width * 3 + 1;
  const pixels = Buffer.alloc(width * stride);
  const glyphs = [
    '11111/10000/10000/11111/00001/00001/11111',
    '11111/00100/00100/00100/00100/00100/00100',
    '11111/10000/10000/10111/10001/10001/11111',
  ].map((g) => g.split('/'));
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) {
      const column = Math.floor((x - 240) / 32),
        row = Math.floor((y - 400) / 32);
      const letter = Math.floor(column / 6),
        cell = column % 6;
      const marked =
        column >= 0 &&
        row >= 0 &&
        row < 7 &&
        letter < 3 &&
        cell < 5 &&
        glyphs[letter]?.[row]?.[cell] === '1';
      const color = marked
        ? [255, 255, 255]
        : y >= 760 && y < 824
          ? [249, 115, 22]
          : [124, 58, 237];
      const offset = y * stride + 1 + x * 3;
      pixels[offset] = color[0]!;
      pixels[offset + 1] = color[1]!;
      pixels[offset + 2] = color[2]!;
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(width, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = new URL('../assets/icon-staging.png', import.meta.url);
  if (process.argv[2] === '--write') writeFileSync(target, stagingIcon());
  else if (process.argv.length > 2) throw Error('Use --write or no arguments');
  assert.deepEqual(readFileSync(target), stagingIcon());
  console.log('Staging icon matches its deterministic source.');
}
