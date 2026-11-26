#!/usr/bin/env node
// Chuẩn hoá icon: cắt viền trong suốt, đưa về khung 128x128, xuất WebP (nhẹ, nét trên màn hình HiDPI).
//   node scripts/icons-to-webp.mjs        # chuyển mọi public/icons/*.png sang .webp rồi xoá .png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'icons');
export const ICON_SIZE = 128;

/** Ảnh bất kỳ (buffer) → WebP 128x128 đã cắt viền trong suốt. */
export async function toIconWebp(input) {
  let img = sharp(input, { density: 384 }).ensureAlpha();
  try {
    const t = await img.clone().trim({ threshold: 2 }).toBuffer({ resolveWithObject: true });
    if (t.info.width > 8 && t.info.height > 8) img = sharp(t.data);
  } catch {
    /* ảnh không có viền để cắt */
  }
  return img
    .resize(ICON_SIZE, ICON_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .webp({ quality: 92, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let before = 0;
  let after = 0;
  for (const f of (await fs.readdir(DIR)).filter((x) => x.endsWith('.png'))) {
    const src = path.join(DIR, f);
    const buf = await fs.readFile(src);
    const out = await toIconWebp(buf);
    await fs.writeFile(src.replace(/\.png$/, '.webp'), out);
    await fs.unlink(src);
    before += buf.length;
    after += out.length;
  }
  console.log(`PNG ${(before / 1024) | 0} KB → WebP ${(after / 1024) | 0} KB`);
}
