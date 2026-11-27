// Generates the extension icons and the Chrome Web Store promo tile. No dependencies: run `node tools/make-assets.js` from extension/.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- minimal PNG writer ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4); // filter byte stays 0
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// --- tiny shape toolkit (signed distances) ---
const sdRound = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};
const distSeg = (x, y, ax, ay, bx, by) => {
  const abx = bx - ax, aby = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby)));
  return Math.hypot(x - (ax + t * abx), y - (ay + t * aby));
};
// a check mark inside a square of side `s` whose top-left corner is (ox, oy)
const onCheck = (x, y, ox, oy, s) => {
  const p = [[0.26, 0.53], [0.43, 0.7], [0.76, 0.33]].map(([u, v]) => [ox + u * s, oy + v * s]);
  const d = Math.min(distSeg(x, y, ...p[0], ...p[1]), distSeg(x, y, ...p[1], ...p[2]));
  return d <= 0.065 * s;
};

// render with 4x4 supersampling; shade(x, y) -> [r, g, b, a(0..1)]
function render(w, h, shade) {
  const out = Buffer.alloc(w * h * 4);
  const n = 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const [pr, pg, pb, pa] = shade(x + (i + 0.5) / n, y + (j + 0.5) / n);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = Math.round((a / (n * n)) * 255);
    }
  }
  return out;
}

const INDIGO = [79, 70, 229];
const VIOLET = [124, 58, 237];
const WHITE = [255, 255, 255];

// icon: indigo rounded square with a white check mark
const icon = (s) => render(s, s, (x, y) => {
  if (sdRound(x, y, s / 2, s / 2, s / 2, s / 2, 0.22 * s) > 0) return [0, 0, 0, 0];
  return [...(onCheck(x, y, 0, 0, s) ? WHITE : INDIGO), 1];
});

// promo tile: indigo-to-violet gradient with a white card and an indigo check mark
const tile = (w, h) => render(w, h, (x, y) => {
  const t = y / h;
  const bg = INDIGO.map((c, k) => c + (VIOLET[k] - c) * t);
  const card = 150, ox = (w - card) / 2, oy = (h - card) / 2;
  if (sdRound(x, y, w / 2, h / 2, card / 2, card / 2, 0.22 * card) <= 0) return [...(onCheck(x, y, ox, oy, card) ? INDIGO : WHITE), 1];
  return [...bg, 1];
});

const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
fs.mkdirSync(path.join(root, 'store'), { recursive: true });
for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(root, 'icons', `icon${s}.png`), png(s, s, icon(s)));
fs.writeFileSync(path.join(root, 'store', 'promo-440x280.png'), png(440, 280, tile(440, 280)));
console.log('Wrote icons/icon16.png, icon32.png, icon48.png, icon128.png and store/promo-440x280.png');