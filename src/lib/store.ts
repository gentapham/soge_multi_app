import { create } from 'zustand';
import { api } from './api';
import { translate, type TKey } from './i18n';
import type { Catalog, CatalogApp, InstalledProgram, Lang, LibraryEntry, Settings, TabId, Task, Theme } from './types';

export type View = TabId | 'library';

export interface Toast {
  id: number;
  kind: 'ok' | 'err' | 'info';
  title: string;
  text?: string;
}

export type UpdateDialog =
  | { kind: 'nothing' }
  | { kind: 'uptodate' }
  | { kind: 'updating'; appIds: string[] }
  | null;

interface State {
  ready: boolean;
  settings: Settings;
  catalog: Catalog | null;
  catalogSource: 'remote' | 'cache' | 'bundled' | null;
  library: Record<string, LibraryEntry>;
  installed: InstalledProgram[];
  tasks: Record<string, Task>;
  view: View;
  category: Record<View, string>;
  search: string;
  selected: string[];
  toasts: Toast[];
  updateDialog: UpdateDialog;
  checking: boolean;
  settingsOpen: boolean;
  panelOpen: boolean;

  t: (k: TKey) => string;
  init: () => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<boolean>;
  setView: (v: View) => void;
  setCategory: (c: string) => void;
  setSearch: (s: string) => void;
  toggleSelect: (id: string) => void;
  setSelected: (ids: string[]) => void;
  enqueue: (ids: string[], kind: Task['kind'], opts?: { isUpdate?: boolean; force?: boolean }) => void;
  cancel: (id: string) => void;
  dismissTask: (id: string) => void;
  clearFinished: () => void;
  checkUpdates: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  refreshInstalled: () => Promise<void>;
  deleteDownload: (id: string) => Promise<void>;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  set: (p: Partial<State>) => void;
}

let toastSeq = 1;
let installRunning = false;

export const appById = (s: State, id: string) => s.catalog?.apps.find((a) => a.id === id);

export const needsDownload = (s: State, app: CatalogApp) => {
  const e = s.library[app.id];
  return !e || (!!app.release && e.version !== app.release.version);
};

function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export const useStore = create<State>((set, get) => {
  const patchTask = (id: string, p: Partial<Task>) =>
    set((s) => (s.tasks[id] ? { tasks: { ...s.tasks, [id]: { ...s.tasks[id], ...p } } } : {}));

  const appName = (id: string) => appById(get(), id)?.name ?? id;

  /** Khởi động các lượt tải đang chờ, tối đa `maxConcurrent` cùng lúc. */
  const pump = () => {
    const s = get();
    const running = Object.values(s.tasks).filter((t) => t.phase === 'downloading').length;
    let slots = Math.max(1, s.settings.maxConcurrent) - running;
    for (const task of Object.values(s.tasks)) {
      if (slots <= 0) break;
      if (task.phase !== 'queued') continue;
      const app = appById(s, task.appId);
      if (!app?.release) {
        patchTask(task.appId, { phase: 'error', error: get().t('unavailable') });
        continue;
      }
      slots--;
      void runDownload(app, task.kind);
    }
  };

  const runDownload = async (app: CatalogApp, kind: Task['kind']) => {
    const s = get();
    const tab = s.catalog!.tabs.find((t) => t.id === app.tab)!;
    const cat = s.catalog!.categories.find((c) => c.id === app.category)!;
    patchTask(app.id, { phase: 'downloading', received: 0, total: app.release?.size ?? null, speed: 0 });
    try {
      const entry = await api.download(app, tab, cat);
      set((st) => ({ library: { ...st.library, [app.id]: entry } }));
      if (kind === 'install') {
        patchTask(app.id, { phase: 'waiting-install' });
        void pumpInstall();
      } else {
        patchTask(app.id, { phase: 'done' });
        get().toast({ kind: 'ok', title: app.name, text: get().t('downloadedOk') });
      }
    } catch (e) {
      const msg = String(e);
      if (msg.includes('CANCELLED')) patchTask(app.id, { phase: 'cancelled' });
      else {
        patchTask(app.id, { phase: 'error', error: msg });
        get().toast({ kind: 'err', title: app.name, text: msg });
      }
    } finally {
      pump();
    }
  };

  /** Cài lần lượt từng phần mềm (trình cài Windows không chạy song song được). */
  const pumpInstall = async () => {
    if (installRunning) return;
    const next = Object.values(get().tasks).find((t) => t.phase === 'waiting-install');
    if (!next) return;
    installRunning = true;
    patchTask(next.appId, { phase: 'installing' });
    const t = get().t;
    try {
      const res = await api.install(next.appId);
      patchTask(next.appId, { phase: res.success ? 'done' : 'error', result: res, error: res.message ?? undefined });
      if (res.success) {
        const text =
          res.mode === 'portable'
            ? t('portableOk')
            : res.needsReboot
              ? `${t('installedOk')}. ${t('rebootNeeded')}`
              : t('installedOk');
        get().toast({ kind: 'ok', title: appName(next.appId), text });
      } else {
        get().toast({ kind: 'err', title: appName(next.appId), text: res.message ?? t('failed') });
      }
    } catch (e) {
      patchTask(next.appId, { phase: 'error', error: String(e) });
      get().toast({ kind: 'err', title: appName(next.appId), text: String(e) });
    } finally {
      installRunning = false;
      void get().refreshInstalled();
      void pumpInstall();
    }
  };

  return {
    ready: false,
    settings: { downloadDir: null, language: 'vi', theme: 'system', maxConcurrent: 3 },
    catalog: null,
    catalogSource: null,
    library: {},
    installed: [],
    tasks: {},
    view: 'free',
    category: { free: 'all', licensed: 'all', games: 'all', library: 'all' },
    search: '',
    selected: [],
    toasts: [],
    updateDialog: null,
    checking: false,
    settingsOpen: false,
    panelOpen: false,

    t: (k) => translate(get().settings.language as Lang, k),
    set: (p) => set(p),

    init: async () => {
      const settings = await api.getSettings();
      applyTheme(settings.theme);
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(get().settings.theme));
      set({ settings });
      await api.onProgress((p) => {
        const task = get().tasks[p.appId];
        if (task?.phase === 'downloading') patchTask(p.appId, { received: p.received, total: p.total, speed: p.speed });
      });
      // Hiện giao diện ngay bằng danh sách đã lưu, rồi tải danh sách mới từ GitHub ở nền
      const local = await api.loadCatalog(false);
      set({ catalog: local.data, catalogSource: local.source, ready: true });
      void get().refreshLibrary();
      void get().refreshInstalled();
      void api.loadCatalog(true).then((cat) => {
        if (cat.source === 'remote') set({ catalog: cat.data, catalogSource: cat.source });
        else get().toast({ kind: 'info', title: 'Offline', text: get().t('offline') });
      });
    },

    saveSettings: async (patch) => {
      try {
        const settings = await api.saveSettings({ ...get().settings, ...patch });
        applyTheme(settings.theme);
        set({ settings });
        if ('downloadDir' in patch) await get().refreshLibrary();
        return true;
      } catch (e) {
        get().toast({ kind: 'err', title: get().t('folder'), text: String(e) });
        return false;
      }
    },

    setView: (view) => set({ view, selected: [], search: '' }),
    setCategory: (c) => set((s) => ({ category: { ...s.category, [s.view]: c } })),
    setSearch: (search) => set({ search }),
    toggleSelect: (id) =>
      set((s) => ({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] })),
    setSelected: (selected) => set({ selected }),

    enqueue: (ids, kind, opts) => {
      const s = get();
      const tasks = { ...s.tasks };
      let needInstallPump = false;
      for (const id of ids) {
        const cur = tasks[id];
        if (cur && ['queued', 'downloading', 'waiting-install', 'installing'].includes(cur.phase)) continue;
        const app = appById(s, id);
        if (!app) continue;
        const fresh = !needsDownload(s, app) && !opts?.force;
        const base: Task = {
          appId: id,
          kind,
          phase: 'queued',
          received: 0,
          total: app.release?.size ?? null,
          speed: 0,
          isUpdate: opts?.isUpdate,
          startedAt: Date.now(),
        };
        if (fresh && kind === 'install') {
          tasks[id] = { ...base, phase: 'waiting-install' };
          needInstallPump = true;
        } else if (fresh && kind === 'download') {
          tasks[id] = { ...base, phase: 'done' };
        } else {
          tasks[id] = base;
        }
      }
      set({ tasks, selected: [] });
      pump();
      if (needInstallPump) void pumpInstall();
    },

    cancel: (id) => {
      const task = get().tasks[id];
      if (!task) return;
      if (task.phase === 'downloading') void api.cancelDownload(id);
      else if (task.phase === 'queued' || task.phase === 'waiting-install') patchTask(id, { phase: 'cancelled' });
    },

    dismissTask: (id) =>
      set((s) => {
        const tasks = { ...s.tasks };
        delete tasks[id];
        return { tasks };
      }),

    clearFinished: () =>
      set((s) => ({
        tasks: Object.fromEntries(
          Object.entries(s.tasks).filter(([, t]) => !['done', 'error', 'cancelled'].includes(t.phase)),
        ),
      })),

    checkUpdates: async () => {
      set({ checking: true });
      try {
        const cat = await api.loadCatalog(true);
        set({ catalog: cat.data, catalogSource: cat.source });
        await get().refreshLibrary();
        void get().refreshInstalled();
        const s = get();
        const entries = Object.values(s.library);
        if (!entries.length) {
          set({ updateDialog: { kind: 'nothing' } });
          return;
        }
        const outdated = entries
          .map((e) => appById(s, e.appId))
          .filter((a): a is CatalogApp => !!a?.release && needsDownload(s, a))
          .map((a) => a.id);
        if (!outdated.length) {
          set({ updateDialog: { kind: 'uptodate' } });
          return;
        }
        set({ updateDialog: { kind: 'updating', appIds: outdated } });
        get().enqueue(outdated, 'download', { isUpdate: true });
      } finally {
        set({ checking: false });
      }
    },

    refreshLibrary: async () => {
      try {
        const lib = await api.getLibrary();
        set({ library: lib.entries });
      } catch {
        set({ library: {} });
      }
    },

    refreshInstalled: async () => {
      try {
        set({ installed: await api.installedPrograms() });
      } catch {
        /* bỏ qua */
      }
    },

    deleteDownload: async (id) => {
      await api.deleteDownload(id);
      await get().refreshLibrary();
      get().dismissTask(id);
    },

    toast: (t) => {
      const id = toastSeq++;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
      setTimeout(() => get().dismissToast(id), t.kind === 'err' ? 9000 : 5000);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  };
});
