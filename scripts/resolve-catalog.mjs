#!/usr/bin/env node
// Đọc catalog/catalog.json, tra cứu phiên bản + link tải mới nhất cho từng phần mềm,
// ghi kết quả ra catalog/resolved.json. Tải luôn icon vào public/icons/ nếu chưa có.
//
//   node scripts/resolve-catalog.mjs            # resolve tất cả
//   node scripts/resolve-catalog.mjs chrome git # chỉ resolve vài app (giữ kết quả cũ cho app khác)
//
// Đặt biến môi trường GITHUB_TOKEN để tránh giới hạn 60 request/giờ của GitHub API.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { fetchIcon } from './fetch-icons.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'catalog', 'catalog.json');
const RESOLVED = path.join(ROOT, 'catalog', 'resolved.json');
const ICON_DIR = path.join(ROOT, 'public', 'icons');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const GH_HEADERS = {
  'User-Agent': 'soge-multi-app-resolver',
  Accept: 'application/vnd.github+json',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

const only = process.argv.slice(2);

async function ghJson(url) {
  const r = await fetch(url, { headers: GH_HEADERS });
  if (!r.ok) throw new Error(`GitHub ${r.status} ${url}`);
  return r.json();
}

function cmpVersion(a, b) {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return a.localeCompare(b);
}

function fileNameFromUrl(url, fallbackExt) {
  try {
    const u = new URL(url);
    let name = decodeURIComponent(u.pathname.split('/').pop() || '');
    if (!/\.(exe|msi|zip|msix|appx|msixbundle)$/i.test(name)) name = name ? `${name}${fallbackExt}` : `setup${fallbackExt}`;
    return name;
  } catch {
    return `setup${fallbackExt}`;
  }
}

const EXT = { msi: '.msi', wix: '.msi', zip: '.zip', msix: '.msix', appx: '.appx' };
const extFor = (t) => EXT[t] ?? '.exe';

const DEFAULT_SILENT = {
  inno: ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-'],
  nullsoft: ['/S'],
  burn: ['/quiet', '/norestart'],
};

function splitArgs(s) {
  if (!s) return null;
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2]);
  return out.length ? out : null;
}

// ---------- winget ----------
// Liệt kê thư mục con trong winget-pkgs. Dùng GitHub API; nếu bị giới hạn (403/429)
// thì đọc trang tree của github.com (trả JSON khi gửi Accept: application/json).
async function listWingetDir(dir) {
  try {
    const list = await ghJson(`https://api.github.com/repos/microsoft/winget-pkgs/contents/${dir}`);
    return list.filter((e) => e.type === 'dir').map((e) => e.name);
  } catch (e) {
    if (!/GitHub (403|429)/.test(e.message)) throw e;
  }
  const r = await fetch(`https://github.com/microsoft/winget-pkgs/tree/master/${dir}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!r.ok) throw new Error(`github tree ${r.status}`);
  const j = await r.json();
  const items = j?.payload?.codeViewTreeRoute?.tree?.items ?? j?.payload?.tree?.items ?? [];
  return items.filter((i) => i.contentType === 'directory').map((i) => i.name);
}

async function resolveWinget(src) {
  const parts = src.id.split('.');
  const dir = `manifests/${parts[0][0].toLowerCase()}/${parts.join('/')}`;
  const versions = (await listWingetDir(dir)).filter((n) => /^\d/.test(n)).sort(cmpVersion);
  if (!versions.length) throw new Error('không tìm thấy phiên bản winget');
  // thử từ bản mới nhất trở xuống (bỏ qua bản lỗi/thiếu file)
  for (const version of versions.reverse().slice(0, 3)) {
    const raw = `https://raw.githubusercontent.com/microsoft/winget-pkgs/master/${dir}/${version}/${src.id}.installer.yaml`;
    const r = await fetch(raw);
    if (!r.ok) continue;
    const doc = YAML.parse(await r.text());
    const picked = pickInstaller(doc, src);
    if (!picked) continue;
    return { version: doc.PackageVersion ?? version, ...picked };
  }
  throw new Error('không có bộ cài x64/x86 phù hợp');
}

function pickInstaller(doc, src) {
  const installers = (doc.Installers ?? []).map((i) => ({
    ...i,
    InstallerType: (i.InstallerType ?? doc.InstallerType ?? '').toLowerCase(),
    NestedInstallerType: (i.NestedInstallerType ?? doc.NestedInstallerType ?? '').toLowerCase(),
    NestedInstallerFiles: i.NestedInstallerFiles ?? doc.NestedInstallerFiles,
    Scope: i.Scope ?? doc.Scope,
    InstallerLocale: i.InstallerLocale ?? doc.InstallerLocale,
    Switches: { ...(doc.InstallerSwitches ?? {}), ...(i.InstallerSwitches ?? {}) },
  }));
  const archScore = { x64: 3, x86: 2, neutral: 1 };
  const typeScore = { msi: 6, wix: 6, inno: 5, nullsoft: 5, burn: 4, exe: 3, zip: 2, portable: 2, msix: 1, appx: 1 };
  const localeScore = (l) => (!l ? 2 : /^vi/i.test(l) ? 4 : /^en-US$/i.test(l) ? 3 : /^en/i.test(l) ? 2.5 : 0);
  const scopeScore = (s) => (src.scope && s === src.scope ? 3 : s === 'machine' ? 2 : !s ? 1.5 : 1);
  const scored = installers
    .filter((i) => archScore[i.Architecture])
    .filter((i) => i.InstallerType !== 'zip' || i.NestedInstallerFiles?.length || !i.NestedInstallerType)
    .map((i) => {
      const portable = i.InstallerType === 'portable' || (i.InstallerType === 'zip' && ['portable', ''].includes(i.NestedInstallerType));
      return {
        i,
        s:
          archScore[i.Architecture] * 1000 +
          (portable && !src.preferPortable ? -500 : 0) +
          localeScore(i.InstallerLocale) * 100 +
          scopeScore(i.Scope) * 10 +
          (typeScore[i.InstallerType] ?? 0),
      };
    })
    .sort((a, b) => b.s - a.s);
  const best = scored[0]?.i;
  if (!best) return null;
  let installerType = best.InstallerType;
  const nestedPath = best.NestedInstallerFiles?.[0]?.RelativeFilePath;
  let launch;
  let archiveEntry;
  if (installerType === 'zip' && best.NestedInstallerType && best.NestedInstallerType !== 'portable') {
    // Bộ cài nằm trong file zip: giải nén rồi chạy file bên trong
    installerType = best.NestedInstallerType;
    archiveEntry = nestedPath?.split(/[\\/]/).pop();
  } else {
    launch = nestedPath?.split(/[\\/]/).pop();
  }
  const silentArgs =
    splitArgs(best.Switches.Silent) && !['msi', 'wix'].includes(installerType)
      ? [...splitArgs(best.Switches.Silent), ...(splitArgs(best.Switches.Custom) ?? [])]
      : DEFAULT_SILENT[installerType] ?? null;
  return {
    url: best.InstallerUrl,
    fileName: fileNameFromUrl(best.InstallerUrl, archiveEntry ? '.zip' : extFor(installerType)),
    installerType,
    ...(archiveEntry ? { archiveEntry } : {}),
    silentArgs,
    sha256: best.InstallerSha256?.toLowerCase() ?? null,
    ...(launch ? { launch } : {}),
  };
}

// ---------- github releases ----------
// Dự phòng khi GitHub API bị giới hạn: đọc trang releases/latest trên github.com
async function githubLatestFromHtml(repo) {
  const r = await fetch(`https://github.com/${repo}/releases/latest`, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  const tag = decodeURIComponent(/\/releases\/tag\/([^/?#]+)/.exec(r.url)?.[1] ?? '');
  if (!tag) throw new Error('không tìm thấy release mới nhất');
  const html = await (await fetch(`https://github.com/${repo}/releases/expanded_assets/${encodeURIComponent(tag)}`, { headers: { 'User-Agent': UA } })).text();
  const tagPage = await (await fetch(r.url, { headers: { 'User-Agent': UA } })).text();
  const published = /<relative-time[^>]*datetime="([^"]+)"/.exec(tagPage)?.[1] ?? /datetime="([^"]+)"/.exec(html)?.[1];
  if (!published) throw new Error('không đọc được ngày phát hành');
  const assets = [...html.matchAll(/href="(\/[^"]+\/releases\/download\/[^"]+)"/g)].map((m) => {
    const url = `https://github.com${m[1]}`;
    return { name: decodeURIComponent(url.split('/').pop()), browser_download_url: url, updated_at: published, size: null };
  });
  return { tag_name: tag, name: tag, assets };
}

async function resolveGithub(src) {
  let rel;
  try {
    rel = await ghJson(`https://api.github.com/repos/${src.repo}/releases/latest`);
  } catch (e) {
    if (!/GitHub (403|429)/.test(e.message)) throw e;
    rel = await githubLatestFromHtml(src.repo);
  }
  const re = new RegExp(src.asset, 'i');
  const asset = rel.assets.find((a) => re.test(a.name));
  if (!asset) throw new Error(`không thấy asset khớp ${src.asset}`);
  const num = (t) => /\d+(?:\.\d+)+/.exec(t ?? '')?.[0];
  const version = num(rel.tag_name) ?? num(rel.name) ?? asset.updated_at.slice(0, 10);
  return {
    version,
    url: asset.browser_download_url,
    fileName: asset.name,
    installerType: src.installerType ?? 'exe',
    silentArgs: src.silentArgs ?? DEFAULT_SILENT[src.installerType] ?? null,
    sha256: asset.digest?.startsWith('sha256:') ? asset.digest.slice(7) : null,
    size: asset.size,
  };
}

// ---------- direct link ----------
async function headInfo(url) {
  let r = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': UA } });
  if (!r.ok || !r.headers.get('content-length')) {
    // Một số CDN không hỗ trợ HEAD: dùng GET rồi huỷ ngay
    const ctrl = new AbortController();
    r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA }, signal: ctrl.signal });
    ctrl.abort();
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get('content-type') ?? '';
  if (/text\/html/i.test(ct)) throw new Error('link trả về trang HTML, không phải file');
  const cd = r.headers.get('content-disposition') ?? '';
  const cdName = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)?.[1];
  return {
    finalUrl: r.url,
    fileName: cdName ? decodeURIComponent(cdName) : null,
    size: Number(r.headers.get('content-length')) || null,
    lastModified: r.headers.get('last-modified'),
    etag: r.headers.get('etag'),
  };
}

async function resolveDirect(src) {
  const h = await headInfo(src.url);
  const fileName = src.fileName ?? h.fileName ?? fileNameFromUrl(h.finalUrl, extFor(src.installerType));
  // Phiên bản: ưu tiên khai báo tay > số trong tên file > ngày cập nhật trên server
  const fromName = /(\d+(?:\.\d+){1,3})/.exec(h.fileName ?? fileNameFromUrl(h.finalUrl, ''))?.[1];
  let version = src.version ?? fromName;
  let fingerprint = null;
  if (h.lastModified) fingerprint = new Date(h.lastModified).toISOString().slice(0, 10);
  if (!version) version = fingerprint ? `${fingerprint}` : 'latest';
  return {
    version,
    // Link cố định (không có số phiên bản): dùng ngày/etag/kích thước để phát hiện bản mới
    build: [fingerprint, h.size, h.etag].filter(Boolean).join('|') || null,
    url: src.url,
    fileName,
    installerType: src.installerType ?? 'exe',
    silentArgs: src.silentArgs ?? DEFAULT_SILENT[src.installerType] ?? null,
    sha256: null,
    size: h.size,
  };
}

// ---------- link nằm trong trang web ----------
async function resolvePage(src) {
  let url = null;
  let version = null;
  try {
    const html = await (await fetch(src.page, { headers: { 'User-Agent': UA } })).text();
    const m = new RegExp(src.pattern).exec(html);
    if (m) {
      url = m[0];
      version = m[1] ?? null;
    }
  } catch {}
  if (!url) {
    if (!src.fallbackUrl) throw new Error('không tìm thấy link trong trang');
    url = src.fallbackUrl;
    version = new RegExp(src.pattern).exec(url)?.[1] ?? null;
  }
  const r = await resolveDirect({ ...src, url, version: version ?? src.version });
  return r;
}

const RESOLVERS = { winget: resolveWinget, github: resolveGithub, direct: resolveDirect, page: resolvePage };


async function main() {
  const catalog = JSON.parse(await fs.readFile(CATALOG, 'utf8'));
  let previous = { apps: [] };
  try {
    previous = JSON.parse(await fs.readFile(RESOLVED, 'utf8'));
  } catch {}
  const prevById = new Map((previous.apps ?? []).map((a) => [a.id, a]));
  const catById = new Map(catalog.categories.map((c) => [c.id, c]));
  await fs.mkdir(ICON_DIR, { recursive: true });

  const failures = [];
  const apps = [];
  // chạy song song có giới hạn
  const queue = [...catalog.apps];
  async function worker() {
    while (queue.length) {
      const app = queue.shift();
      const cat = catById.get(app.category);
      if (!cat) throw new Error(`App ${app.id}: category ${app.category} không tồn tại`);
      const { source, ...rest } = app;
      const out = { ...rest, tab: cat.tab };
      const prev = prevById.get(app.id);
      if (source.type === 'link') {
        // Chỉ mở trang tải chính thức (vd. ISO Windows dùng link tạm thời), không tải trực tiếp
        out.link = source.url;
        out.release = null;
        if (!only.length || only.includes(app.id)) {
          console.log(`↗ ${app.id.padEnd(16)} ${source.url}`);
          try {
            await fetchIcon(app);
          } catch {}
        }
        apps.push(out);
        continue;
      }
      if (only.length && !only.includes(app.id)) {
        apps.push({ ...out, release: prev?.release ?? null });
        continue;
      }
      try {
        const release = await RESOLVERS[source.type]({ ...source, preferPortable: app.installMode === 'portable' });
        if (/^(download|setup|installer|getinstaller)\.(exe|msi|zip)$/i.test(release.fileName)) {
          release.fileName = `${app.id}-${release.version}${path.extname(release.fileName)}`;
        }
        if (release.launch && !out.launch) out.launch = release.launch;
        delete release.launch;
        if (!/^https:\/\//i.test(release.url)) throw new Error(`link không phải https: ${release.url}`);
        // Link cố định không chứa số phiên bản (vd. .../ChromeSetup.exe) có thể đổi file bất cứ lúc nào
        // → mã SHA256 sẽ nhanh chóng lỗi thời. Bỏ mã, app sẽ kiểm tra chữ ký số Authenticode thay thế.
        if (release.sha256 && !/\d+[._]\d+/.test(decodeURIComponent(new URL(release.url).pathname))) {
          release.sha256 = null;
        }
        out.release = release;
        console.log(`✔ ${app.id.padEnd(16)} ${release.version.padEnd(18)} ${release.installerType.padEnd(9)} ${release.fileName}`);
      } catch (e) {
        failures.push(`${app.id}: ${e.message}`);
        out.release = prev?.release ?? null; // giữ bản cũ nếu lần này lỗi
        if (prev?.launch && !out.launch) out.launch = prev.launch;
        console.log(`✘ ${app.id.padEnd(16)} ${e.message}`);
      }
      try {
        await fetchIcon(app);
      } catch {}
      apps.push(out);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  const order = new Map(catalog.apps.map((a, i) => [a.id, i]));
  apps.sort((a, b) => order.get(a.id) - order.get(b.id));

  const resolved = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    tabs: catalog.tabs,
    categories: catalog.categories,
    apps,
  };
  await fs.writeFile(RESOLVED, JSON.stringify(resolved, null, 2) + '\n');
  console.log(`\nĐã ghi ${apps.length} app vào catalog/resolved.json (${failures.length} lỗi)`);
  if (failures.length) {
    console.log(failures.map((f) => '  - ' + f).join('\n'));
    if (process.env.CI && failures.length > apps.length / 3) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
