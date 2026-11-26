export type Lang = 'vi' | 'en';
export type Theme = 'light' | 'dark' | 'system';
export type TabId = 'free' | 'licensed' | 'games' | 'windows';
export type L10n = { vi: string; en: string };

export interface Release {
  version: string;
  build?: string | null;
  url: string;
  fileName: string;
  installerType: string;
  silentArgs?: string[] | null;
  sha256?: string | null;
  size?: number | null;
  archiveEntry?: string;
}

export interface CatalogApp {
  id: string;
  name: string;
  tab: TabId;
  category: string;
  homepage: string;
  buyUrl?: string;
  desc: L10n;
  detect?: string[];
  installMode?: 'silent' | 'interactive' | 'portable';
  launch?: string;
  /** Hiển thị thêm trong các danh mục khác (vd. Rufus ở tab Windows) */
  alsoIn?: string[];
  /** Chỉ mở trang tải chính thức, không tải trực tiếp */
  link?: string;
  release: Release | null;
}

export interface Category {
  id: string;
  tab: TabId;
  icon: string;
  folder: string;
  name: L10n;
}

export interface TabDef {
  id: TabId;
  folder: string;
  name: L10n;
}

export interface Catalog {
  generatedAt: string;
  tabs: TabDef[];
  categories: Category[];
  apps: CatalogApp[];
}

export interface Settings {
  downloadDir: string | null;
  language: Lang;
  theme: Theme;
  maxConcurrent: number;
}

export interface LibraryEntry {
  appId: string;
  appName: string;
  version: string;
  fileName: string;
  relPath: string;
  size: number;
  installerType: string;
  downloadedAt: number;
}

export interface InstalledProgram {
  name: string;
  version?: string | null;
  publisher?: string | null;
}

export interface InstallResult {
  exitCode: number;
  success: boolean;
  needsReboot: boolean;
  mode: 'silent' | 'interactive' | 'portable';
  message?: string | null;
}

export type TaskPhase = 'queued' | 'downloading' | 'waiting-install' | 'installing' | 'done' | 'error' | 'cancelled';

export interface Task {
  appId: string;
  /** download: chỉ tải; install: tải (nếu cần) rồi cài */
  kind: 'download' | 'install';
  phase: TaskPhase;
  received: number;
  total: number | null;
  speed: number;
  error?: string;
  result?: InstallResult;
  isUpdate?: boolean;
  startedAt: number;
}
