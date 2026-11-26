import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Catalog, InstalledProgram, InstallResult, LibraryEntry, Settings } from './types';

export const api = {
  getSettings: () => invoke<Settings>('get_settings'),
  saveSettings: (settings: Settings) => invoke<Settings>('save_settings', { settings }),
  suggestDownloadDir: () => invoke<string>('suggest_download_dir'),
  loadCatalog: (preferRemote: boolean) =>
    invoke<{ source: 'remote' | 'cache' | 'bundled'; data: Catalog }>('load_catalog', { preferRemote }),
  getLibrary: () => invoke<{ entries: Record<string, LibraryEntry> }>('get_library'),
  installedPrograms: () => invoke<InstalledProgram[]>('installed_programs'),
  /** Backend tự tra link/tham số trong danh mục đã xác minh chữ ký — chỉ gửi mã app. */
  download: (appId: string) => invoke<LibraryEntry>('download_app', { appId }),
  cancelDownload: (appId: string) => invoke<boolean>('cancel_download', { appId }),
  install: (appId: string, interactive = false) => invoke<InstallResult>('install_app', { appId, interactive }),
  deleteDownload: (appId: string) => invoke<void>('delete_download', { appId }),
  reveal: (appId?: string) => invoke<void>('reveal', { appId: appId ?? null }),
  /** Mở link https bằng trình duyệt mặc định (quyền người dùng thường). */
  openUrl: (url: string) => (/^https:\/\//i.test(url) ? invoke<void>('open_url', { url }) : Promise.resolve()),
  onProgress: (cb: (p: { appId: string; received: number; total: number | null; speed: number }) => void) =>
    listen<{ appId: string; received: number; total: number | null; speed: number }>('download://progress', (e) => cb(e.payload)),
};
