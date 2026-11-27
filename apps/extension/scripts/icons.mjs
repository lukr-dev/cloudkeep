import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function ribbon(x, y) {
  return x >= 0.28 && x <= 0.72 && y >= 0.18 && y <= 0.84 - Math.min(x - 0.28, 0.72 - x) * 0.7;
}
function png(size, saved) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  // Supersampling keeps the notch readable at toolbar sizes.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rgba = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const mark = ribbon((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
          const color = saved
            ? mark
              ? [255, 255, 255, 255]
              : [31, 122, 90, 255]
            : mark
              ? [107, 114, 128, 255]
              : [0, 0, 0, 0];
          for (let c = 0; c < 4; c++) rgba[c] += color[c] / 16;
        }
      }
      // Store unpremultiplied color for partially covered transparent pixels.
      if (!saved && rgba[3]) {
        rgba[0] = 107;
        rgba[1] = 114;
        rgba[2] = 128;
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 4; c++) rows[offset + c] = Math.round(rgba[c]);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
assert(ribbon(0.5, 0.3));
assert(!ribbon(0.5, 0.85));
for (const size of [16, 32, 48, 128]) {
  for (const saved of [false, true]) {
    writeFileSync(
      new URL(`../public/icons/${saved ? "" : "neutral-"}${size}.png`, import.meta.url),
      png(size, saved),
    );
  }
}
