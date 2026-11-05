// Turns the text grids in art/ into PNGs in public/art/ (graphics.md section 5). Run with `npm run art`.
// Uses only Node's standard library. The PNGs are committed, so the site build does not need this step.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_DIR = join(ROOT, 'art');
const OUT_DIR = join(ROOT, 'public', 'art');

/** Grid size for each art folder. */
const SIZES = {
  portraits: [32, 32],
  crests: [32, 32],
  enemies: [32, 32],
  ships: [64, 32],
  player: [96, 48],
};

/** One palette code per entry: null is transparent, anything else is "#rrggbb". */
export function loadPalette(path = join(ART_DIR, 'palette.json')) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const codes = Object.keys(raw);
  for (const code of codes) {
    if (code.length !== 1) throw new Error(`palette.json: code "${code}" must be one character`);
    const hex = raw[code];
    if (hex !== null && !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`palette.json: bad colour for "${code}": ${hex}`);
  }
  return raw;
}

/** Reads a grid and returns its rows, or throws a message naming the exact line and character. */
export function parseGrid(text, [width, height], palette, label) {
  const rows = text.split(/\r?\n/);
  if (rows.at(-1) === '') rows.pop();
  if (rows.length !== height) throw new Error(`${label}: expected ${height} rows, found ${rows.length}`);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${label}: line ${y + 1} is ${row.length} characters, expected ${width}`);
    [...row].forEach((code, x) => {
      if (!(code in palette)) throw new Error(`${label}: line ${y + 1}, column ${x + 1}: unknown colour "${code}"`);
    });
  });
  return rows;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes grid rows as an indexed PNG. `scale` repeats each pixel, for previews. */
export function encodePng(rows, palette, scale = 1) {
  const codes = Object.keys(palette);
  const index = new Map(codes.map((c, i) => [c, i]));
  const width = rows[0].length * scale;
  const height = rows.length * scale;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // indexed colour

  const plte = Buffer.alloc(codes.length * 3);
  const trns = Buffer.alloc(codes.length, 255);
  codes.forEach((code, i) => {
    const hex = palette[code];
    if (hex === null) trns[i] = 0;
    else Buffer.from(hex.slice(1), 'hex').copy(plte, i * 3);
  });

  const stride = width + 1;
  const pixels = Buffer.alloc(stride * height);
  rows.forEach((row, y) => {
    for (let sy = 0; sy < scale; sy++) {
      const start = (y * scale + sy) * stride + 1; // the byte before it is the row filter, 0
      [...row].forEach((code, x) => pixels.fill(index.get(code), start + x * scale, start + (x + 1) * scale));
    }
  });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('tRNS', trns),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function build() {
  const palette = loadPalette();
  mkdirSync(OUT_DIR, { recursive: true });
  const errors = [];
  let built = 0;
  for (const [folder, size] of Object.entries(SIZES)) {
    let names;
    try {
      names = readdirSync(join(ART_DIR, folder)).filter((n) => n.endsWith('.txt'));
    } catch {
      continue; // nothing drawn for this folder yet
    }
    for (const name of names) {
      const path = join(ART_DIR, folder, name);
      try {
        const rows = parseGrid(readFileSync(path, 'utf8'), size, palette, relative(ROOT, path));
        writeFileSync(join(OUT_DIR, name.replace(/\.txt$/, '.png')), encodePng(rows, palette));
        built++;
      } catch (e) {
        errors.push(e.message);
      }
    }
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(`Built ${built} image${built === 1 ? '' : 's'} into public/art/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();
