#!/usr/bin/env node
// Tải icon cho từng phần mềm vào public/icons/<id>.png (128x128).
// Thứ tự thử: app.icon (khai báo tay) → icon lớn khai báo trong trang chủ (apple-touch-icon, icon sizes)
// → /apple-touch-icon.png → Google favicon 128. Chọn ảnh lớn nhất.
//
//   node scripts/fetch-icons.mjs           # chỉ tải icon còn thiếu
//   node scripts/fetch-icons.mjs --refresh # tải lại các icon nhỏ hơn 96px
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = path.join(ROOT, 'public', 'icons');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

async function get(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    return r.ok ? r : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function candidatesFromPage(pageUrl) {
  const r = await get(pageUrl);
  if (!r) return [];
  const html = (await r.text()).slice(0, 400_000);
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    if (!/icon/.test(rel)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || href.startsWith('data:')) continue;
    const sizes = /sizes=["'](\d+)x\d+["']/i.exec(tag)?.[1];
    const score = rel.includes('apple-touch') ? 180 : sizes ? Number(sizes) : /\.svg/i.test(href) ? 256 : 32;
    try {
      out.push({ url: new URL(href, r.url).href, score });
    } catch {}
  }
  const origin = new URL(r.url).origin;
  out.push({ url: `${origin}/apple-touch-icon.png`, score: 180 });
  out.push({ url: `${origin}/favicon.ico`, score: 16 });
  return out.sort((a, b) => b.score - a.score);
}

// Lấy ảnh PNG lớn nhất nhúng trong file .ico (sharp không đọc được .ico)
function pngFromIco(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return buf;
  const n = buf.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 16;
    const w = buf[o] || 256;
    const size = buf.readUInt32LE(o + 8);
    const off = buf.readUInt32LE(o + 12);
    const data = buf.subarray(off, off + size);
    const isPng = data.length > 8 && data.readUInt32BE(0) === 0x89504e47;
    if (isPng && (!best || w > best.w)) best = { w, data };
  }
  return best?.data ?? buf;
}

async function toPng(buf) {
  buf = pngFromIco(buf);
  try {
    const img = sharp(buf, { density: 384 });
    const meta = await img.metadata();
    if (!meta.width) return null;
    const png = await img
      .resize(128, 128, { fit: 'contain', withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return { png, width: meta.width };
  } catch {
    return null; // .ico và định dạng lạ: bỏ qua
  }
}

export async function fetchIcon(app, { refresh = false } = {}) {
  const file = path.join(ICON_DIR, `${app.id}.png`);
  try {
    await fs.access(file);
    if (!refresh) return;
    const { width } = await sharp(file).metadata();
    if (width >= 96 && !(await fs.readFile(file).then((b) => b.length < 600))) return;
  } catch {}

  const domain = new URL(app.iconDomain ? `https://${app.iconDomain}` : app.homepage).hostname;
  const list = [
    ...(app.icon ? [{ url: app.icon, score: 999 }] : []),
    // Kho icon mở dashboard-icons (thử theo id phần mềm)
    { url: `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${app.iconSlug ?? app.id}.png`, score: 998 },
    ...(await candidatesFromPage(app.homepage)),
    { url: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`, score: 0 },
  ];
  let best = null;
  for (const c of list.slice(0, 8)) {
    const r = await get(c.url);
    if (!r) continue;
    const res = await toPng(Buffer.from(await r.arrayBuffer()));
    if (!res) continue;
    if (!best || res.width > best.width) best = res;
    if (best.width >= 128 || c.score >= 998) break;
  }
  if (best) {
    await fs.mkdir(ICON_DIR, { recursive: true });
    await fs.writeFile(file, best.png);
  }
  return best?.width;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const refresh = process.argv.includes('--refresh');
  const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'catalog', 'catalog.json'), 'utf8'));
  for (const app of catalog.apps) {
    const w = await fetchIcon(app, { refresh });
    if (w !== undefined) console.log(`${app.id.padEnd(16)} ${w ?? 'không lấy được'}`);
  }
}
