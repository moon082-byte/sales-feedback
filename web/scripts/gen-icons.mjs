// favicon.svg 와 같은 모양의 PWA 아이콘 PNG를 의존성 없이 생성
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BLUE = [0x31, 0x82, 0xf6];
const WHITE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function inRoundRect(x, y, rx, ry, w, h, r) {
  if (x < rx || x >= rx + w || y < ry || y >= ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function makeIcon(size, maskable) {
  const s = size / 64;
  // maskable 은 안전영역(가운데 80%) 안에 들어가도록 막대를 축소
  const k = maskable ? 0.7 : 1;
  const off = (64 - 64 * k) / 2;
  const bars = [
    [15, 34, 8, 15],
    [28, 24, 8, 25],
    [41, 15, 8, 34],
  ].map(([x, y, w, h]) => [(off + x * k) * s, (off + y * k) * s, w * k * s, h * k * s]);

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      const inBg = maskable || inRoundRect(px, py, 0, 0, size, size, 14 * s);
      const inBar = bars.some(([bx, by, bw, bh]) => inRoundRect(px, py, bx, by, bw, bh, 3 * s * k));
      const color = inBar ? WHITE : BLUE;
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = color[0];
      raw[i + 1] = color[1];
      raw[i + 2] = color[2];
      raw[i + 3] = inBg ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../public/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('icon-192.png', dir), makeIcon(192, false));
writeFileSync(new URL('icon-512.png', dir), makeIcon(512, false));
writeFileSync(new URL('icon-maskable-512.png', dir), makeIcon(512, true));
console.log('icons written');
