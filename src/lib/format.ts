import type { Catalog, CatalogApp, InstalledProgram, TabId } from './types';

export function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeed(n: number): string {
  return n > 0 ? `${formatBytes(n)}/s` : '';
}

/** Phiên bản dạng ngày (2026-11-16) hiển thị gọn theo locale. */
export function displayVersion(v: string | undefined | null, lang: 'vi' | 'en'): string {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v);
    return lang === 'vi' ? `Bản ${d.toLocaleDateString('vi-VN')}` : `Build ${d.toLocaleDateString('en-GB')}`;
  }
  return /^\d/.test(v) ? `v${v}` : v;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

export function matchesSearch(app: CatalogApp, q: string): boolean {
  if (!q.trim()) return true;
  const hay = norm(`${app.name} ${app.desc.vi} ${app.desc.en} ${app.id}`);
  return norm(q)
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

const ADDON_RE = /\b(add-?in|plug-?in|extension|outlook|meeting|helper|redistributable|sdk|documentation|language pack)\b/;

/** So sánh phiên bản dạng số (1.10 > 1.9). Trả về null nếu không so được. */
export function compareVersions(a: string, b: string): number | null {
  const num = (v: string) => (/^\d+(\.\d+)*/.exec(v.trim().replace(/^v/i, ''))?.[0] ?? null);
  const x = num(a);
  const y = num(b);
  if (!x || !y) return null;
  const pa = x.split('.').map(Number);
  const pb = y.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Tìm phần mềm đã cài trên máy dựa vào danh sách tên trong `detect`. */
export function findInstalled(app: CatalogApp, programs: InstalledProgram[]): InstalledProgram | undefined {
  if (!app.detect?.length) return undefined;
  const pats = app.detect.map(norm);
  return programs.find((p) => {
    const n = norm(p.name);
    return pats.some((pat) => {
      // khớp đầu tên, ký tự kế tiếp không phải chữ cái (tránh "Git" khớp "GitHub Desktop")
      if (!n.startsWith(pat) || /[a-z]/.test(n.charAt(pat.length))) return false;
      // bỏ qua add-in/plugin đi kèm (vd. "Microsoft Teams Meeting Add-in", "Zoom Outlook Plugin")
      return !ADDON_RE.test(n.slice(pat.length));
    });
  });
}

/** App thuộc danh mục (kể cả danh mục phụ khai báo trong alsoIn). */
export function inCategory(app: CatalogApp, catId: string): boolean {
  return app.category === catId || !!app.alsoIn?.includes(catId);
}

/** App hiển thị trong tab (tab chính hoặc qua danh mục phụ). */
export function inTab(app: CatalogApp, tab: TabId, catalog: Catalog): boolean {
  if (app.tab === tab) return true;
  return !!app.alsoIn?.some((c) => catalog.categories.find((x) => x.id === c)?.tab === tab);
}
