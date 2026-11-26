import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { create } from 'zustand';

/**
 * Tự cập nhật SOGE Multi App. Bản cập nhật do GitHub Actions build & ký số
 * (khoá minisign); app chỉ cài bản có chữ ký khớp khoá công khai trong tauri.conf.json.
 *
 * Quy trình hiển thị: tải (có %) → "Đã tải xong 100%" (dừng ~2 giây) → cài ngầm → app tự mở lại
 * → hộp thoại "Đã cập nhật thành công".
 */
export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'installing' | 'error' | 'uptodate';

interface AppUpdateState {
  current: string;
  available: Update | null;
  phase: UpdatePhase;
  received: number;
  total: number | null;
  error?: string;
  dismissed: boolean;
  /** Vừa cập nhật xong (phát hiện khi app mở lại) */
  justUpdated: { from: string; to: string } | null;
  init: () => Promise<void>;
  checkNow: (manual?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
  closeJustUpdated: () => void;
}

const VERSION_KEY = 'soge.lastVersion';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useAppUpdate = create<AppUpdateState>((set, get) => ({
  current: '',
  available: null,
  phase: 'idle',
  received: 0,
  total: null,
  dismissed: false,
  justUpdated: null,

  init: async () => {
    try {
      const current = await getVersion();
      set({ current });
      try {
        const prev = localStorage.getItem(VERSION_KEY);
        if (prev && prev !== current) set({ justUpdated: { from: prev, to: current } });
        localStorage.setItem(VERSION_KEY, current);
      } catch {
        /* localStorage không dùng được — bỏ qua */
      }
    } catch {
      /* bỏ qua */
    }
    await get().checkNow(false);
  },

  checkNow: async (manual = false) => {
    const ph = get().phase;
    if (ph === 'downloading' || ph === 'ready' || ph === 'installing') return;
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
    set({ phase: 'downloading', received: 0, total: null, error: undefined });
    try {
      const started = Date.now();
      await u.download((ev) => {
        if (ev.event === 'Started') set({ total: ev.data.contentLength ?? null });
        else if (ev.event === 'Progress') set((s) => ({ received: s.received + ev.data.chunkLength }));
      });
      // Cho thanh tiến trình kịp chạy tới 100% (file nhỏ tải rất nhanh)
      const elapsed = Date.now() - started;
      if (elapsed < 1200) await sleep(1200 - elapsed);
      set((s) => ({ phase: 'ready', received: s.total ?? s.received }));
      await sleep(1800);
      set({ phase: 'installing' });
      await sleep(400);
      await u.install();
      await relaunch();
    } catch (e) {
      set({ phase: 'error', error: String(e) });
    }
  },

  dismiss: () => set({ dismissed: true }),
  closeJustUpdated: () => set({ justUpdated: null }),
}));
