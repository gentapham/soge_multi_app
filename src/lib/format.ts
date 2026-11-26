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

/** Tìm phần mềm đã cài trên máy dựa vào danh sách tên trong `detect`. */
export function findInstalled(app: CatalogApp, programs: InstalledProgram[]): InstalledProgram | undefined {
  if (!app.detect?.length) return undefined;
  const pats = app.detect.map(norm);
  return programs.find((p) => {
    const n = norm(p.name);
    // khớp đầu tên và ký tự kế tiếp không phải chữ cái (tránh "Git" khớp "GitHub Desktop")
    return pats.some((pat) => n.startsWith(pat) && !/[a-z]/.test(n.charAt(pat.length)));
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
