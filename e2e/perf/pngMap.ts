/**
 * A generated map picture for the canvas budget check: a square greyscale PNG
 * of blocks and fine diagonal lines, so it is a real 8000 x 8000 image for the
 * browser to decode and put on the graphics card (the cost the budget is about)
 * without committing a megabyte of art or Paizo's. Written by hand with
 * `node:zlib`, so the check needs no image library.
 */

import { crc32, deflateSync } from 'node:zlib';

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** A `size` x `size` greyscale PNG. Blocks of 160 px in varying shades, with 1 px diagonal lines every 40 px. */
export function generateMapPng(size: number): Buffer {
  const stride = size + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    // Filter type 0 (none) leads each row.
    const row = y * stride + 1;
    const blockRow = Math.floor(y / 160);
    for (let x = 0; x < size; x += 1) {
      const shade = 70 + ((Math.floor(x / 160) * 7 + blockRow * 13) % 9) * 10;
      raw[row + x] = (x + y) % 40 === 0 ? 200 : shade;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
