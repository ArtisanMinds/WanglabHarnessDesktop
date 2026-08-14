// Generates the Tauri icon set (PNG/ICO/ICNS) from a procedurally drawn
// DeepSeek-Harness-style "</>" mark. Pure Node — no native dependencies.
//
//   node scripts/gen-icons.mjs
//
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "src-tauri", "icons");
mkdirSync(iconsDir, { recursive: true });

// ---- tiny PNG encoder ------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- procedural drawing ----------------------------------------------------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const coverage = (d) => clamp01(0.5 - d);

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = clamp01(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

// ViewBox is 0..32 (matches public/vite.svg); scale factor maps to 512 base.
const S = 512 / 32;
const segments = [
  { a: [7, 9.5], b: [12.8, 16], color: [0x4d, 0x6b, 0xfe] },
  { a: [12.8, 16], b: [7, 22.5], color: [0x4d, 0x6b, 0xfe] },
  { a: [25, 9.5], b: [19.2, 16], color: [0x6e, 0x8b, 0xff] },
  { a: [19.2, 16], b: [25, 22.5], color: [0x6e, 0x8b, 0xff] },
  { a: [17.8, 6.5], b: [14.2, 25.5], color: [0xe8, 0xe8, 0xea] },
];
const strokeWidth = 2.6 * S;

function renderIcon(size) {
  // Supersample for small sizes, keep the math affordable for large ones.
  const ss = size <= 64 ? 4 : 2;
  const work = size * ss;
  const rgba = Buffer.alloc(work * work * 4);

  const cx = work / 2;
  const cy = work / 2;
  const hw = work / 2 - work * 0.05;
  const hh = work / 2 - work * 0.05;
  const radius = work * 0.22;

  const glyphSegs = segments.map((seg) => ({
    ax: seg.a[0] * S * (work / 512),
    ay: seg.a[1] * S * (work / 512),
    bx: seg.b[0] * S * (work / 512),
    by: seg.b[1] * S * (work / 512),
    color: seg.color,
  }));
  const halfStroke = (strokeWidth * (work / 512)) / 2;

  for (let y = 0; y < work; y++) {
    for (let x = 0; x < work; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const idx = (y * work + x) * 4;

      // Background rounded rect.
      const bgA = coverage(sdRoundRect(px, py, cx, cy, hw, hh, radius));
      // Subtle vertical gradient for the tile.
      const grad = 0.9 + 0.1 * (py / work);

      let r = 16 * grad;
      let g = 17 * grad;
      let b = 21 * grad;
      let a = bgA;

      // Glyph strokes.
      for (const seg of glyphSegs) {
        const d = sdSegment(px, py, seg.ax, seg.ay, seg.bx, seg.by) - halfStroke;
        const cov = coverage(d);
        if (cov > 0) {
          r = r * (1 - cov) + seg.color[0] * cov;
          g = g * (1 - cov) + seg.color[1] * cov;
          b = b * (1 - cov) + seg.color[2] * cov;
          a = Math.min(1, a + cov * (1 - a));
        }
      }

      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a * 255;
    }
  }

  // Box downsample to the target size.
  const out = Buffer.alloc(size * size * 4);
  const factor = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const idx = ((y * ss + sy) * work + (x * ss + sx)) * 4;
          const alpha = rgba[idx + 3] / 255;
          r += rgba[idx] * alpha;
          g += rgba[idx + 1] * alpha;
          b += rgba[idx + 2] * alpha;
          a += alpha;
        }
      }
      const oi = (y * size + x) * 4;
      if (a > 0) {
        out[oi] = r / a;
        out[oi + 1] = g / a;
        out[oi + 2] = b / a;
      }
      out[oi + 3] = (a / factor) * 255;
    }
  }
  return out;
}

function writePng(name, size) {
  writeFileSync(join(iconsDir, name), encodePng(size, size, renderIcon(size)));
  console.log(`wrote ${name} (${size}x${size})`);
}

function writeIco() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = sizes.map((size) => ({ size, data: encodePng(size, size, renderIcon(size)) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = Buffer.alloc(pngs.length * 16);
  let offset = 6 + entries.length;
  pngs.forEach((entry, index) => {
    const base = index * 16;
    entries[base] = entry.size >= 256 ? 0 : entry.size;
    entries[base + 1] = entry.size >= 256 ? 0 : entry.size;
    entries[base + 2] = 0; // palette
    entries[base + 3] = 0; // reserved
    entries.writeUInt16LE(1, base + 4); // planes
    entries.writeUInt16LE(32, base + 6); // bpp
    entries.writeUInt32LE(entry.data.length, base + 8);
    entries.writeUInt32LE(offset, base + 12);
    offset += entry.data.length;
  });

  writeFileSync(join(iconsDir, "icon.ico"), Buffer.concat([header, entries, ...pngs.map((p) => p.data)]));
  console.log("wrote icon.ico");
}

function writeIcns() {
  const sizes = [
    { type: "icp4", size: 16 },
    { type: "icp5", size: 32 },
    { type: "icp6", size: 64 },
    { type: "ic07", size: 128 },
    { type: "ic08", size: 256 },
    { type: "ic09", size: 512 },
    { type: "ic10", size: 1024 },
    { type: "ic11", size: 64 },
    { type: "ic12", size: 128 },
    { type: "ic13", size: 512 },
    { type: "ic14", size: 1024 },
  ];
  const chunks = sizes.map(({ type, size }) => {
    const data = encodePng(size, size, renderIcon(size));
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 8);
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(total, 4);
  writeFileSync(join(iconsDir, "icon.icns"), Buffer.concat([header, ...chunks]));
  console.log("wrote icon.icns");
}

// Tauri bundle.icon references.
writePng("32x32.png", 32);
writePng("128x128.png", 128);
writePng("128x128@2x.png", 256);
writePng("icon.png", 512);
writeIco();
writeIcns();
console.log("icon set generated in", iconsDir);
