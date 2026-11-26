// Chuyển hình PNG gốc (Codex vẽ) sang WebP nhỏ gọn cho app.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
const SRC = 'design/art';
const OUT = 'src/assets/img';
await fs.mkdir(OUT, { recursive: true });
for (const f of await fs.readdir(SRC)) {
  if (!f.endsWith('.png') || f.startsWith('_')) continue;
  const isBanner = f.startsWith('banner');
  const out = path.join(OUT, f.replace('.png', '.webp'));
  await sharp(path.join(SRC, f))
    .resize(isBanner ? { width: 1600 } : { width: 512 })
    .webp({ quality: 88 })
    .toFile(out);
  console.log(out, (await fs.stat(out)).size);
}
// Logo
await sharp('D:/Genta/SOGE Store/SOGE STORE Text LOGO.png').resize({ width: 480 }).webp({ quality: 92 }).toFile(path.join(OUT, 'logo-text.webp'));
await sharp('D:/Genta/SOGE Store/LOGO_tròn viền.png').resize({ width: 256 }).webp({ quality: 92 }).toFile(path.join(OUT, 'logo-round.webp'));
