import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Catalog, CatalogApp, Category, InstalledProgram, InstallResult, LibraryEntry, Settings, TabDef } from './types';

export const api = {
  getSettings: () => invoke<Settings>('get_settings'),
  saveSettings: (settings: Settings) => invoke<Settings>('save_settings', { settings }),
  suggestDownloadDir: () => invoke<string>('suggest_download_dir'),
  loadCatalog: (preferRemote: boolean) =>
    invoke<{ source: 'remote' | 'cache' | 'bundled'; data: Catalog }>('load_catalog', { preferRemote }),
  getLibrary: () => invoke<{ entries: Record<string, LibraryEntry> }>('get_library'),
  installedPrograms: () => invoke<InstalledProgram[]>('installed_programs'),
  download: (app: CatalogApp, tab: TabDef, cat: Category) =>
    invoke<LibraryEntry>('download_app', {
      request: {
        appId: app.id,
        appName: app.name,
        tabFolder: tab.folder,
        categoryFolder: cat.folder,
        release: app.release,
        installMode: app.installMode ?? null,
        launch: app.launch ?? null,
      },
    }),
  cancelDownload: (appId: string) => invoke<boolean>('cancel_download', { appId }),
  install: (appId: string, interactive = false) => invoke<InstallResult>('install_app', { appId, interactive }),
  deleteDownload: (appId: string) => invoke<void>('delete_download', { appId }),
  reveal: (appId?: string) => invoke<void>('reveal', { appId: appId ?? null }),
  onProgress: (cb: (p: { appId: string; received: number; total: number | null; speed: number }) => void) =>
    listen<{ appId: string; received: number; total: number | null; speed: number }>('download://progress', (e) => cb(e.payload)),
};
