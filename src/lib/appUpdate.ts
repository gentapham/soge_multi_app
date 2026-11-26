import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { create } from 'zustand';

/**
 * Tự cập nhật SOGE Multi App. Bản cập nhật do GitHub Actions build & ký số
 * (khoá minisign); app chỉ cài bản có chữ ký khớp khoá công khai trong tauri.conf.json.
 */
interface AppUpdateState {
  current: string;
  available: Update | null;
  phase: 'idle' | 'checking' | 'downloading' | 'installing' | 'error' | 'uptodate';
  received: number;
  total: number | null;
  error?: string;
  dismissed: boolean;
  init: () => Promise<void>;
  checkNow: (manual?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

export const useAppUpdate = create<AppUpdateState>((set, get) => ({
  current: '',
  available: null,
  phase: 'idle',
  received: 0,
  total: null,
  dismissed: false,

  init: async () => {
    try {
      set({ current: await getVersion() });
    } catch {
      /* bỏ qua */
    }
    await get().checkNow(false);
  },

  checkNow: async (manual = false) => {
    if (get().phase === 'downloading' || get().phase === 'installing') return;
    set({ phase: 'checking', error: undefined, dismissed: false });
    try {
      const u = await check({ timeout: 15000 });
      set({ available: u, phase: u ? 'idle' : manual ? 'uptodate' : 'idle' });
    } catch (e) {
      // Lần kiểm tra tự động lỗi (mất mạng, chưa có bản phát hành) thì im lặng
      set({ phase: manual ? 'error' : 'idle', error: String(e) });
    }
  },

  install: async () => {
    const u = get().available;
    if (!u) return;
    set({ phase: 'downloading', received: 0, total: null });
    try {
      await u.downloadAndInstall((ev) => {
        if (ev.event === 'Started') set({ total: ev.data.contentLength ?? null });
        else if (ev.event === 'Progress') set((s) => ({ received: s.received + ev.data.chunkLength }));
        else if (ev.event === 'Finished') set({ phase: 'installing' });
      });
      await relaunch();
    } catch (e) {
      set({ phase: 'error', error: String(e) });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));
