import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, X } from 'lucide-react';
import { useEffect } from 'react';
import mascotDownload from './assets/img/mascot-download.webp';
import { AppUpdateBanner, JustUpdatedDialog } from './components/AppUpdateBanner';
import { CatalogView } from './components/CatalogView';
import { useAppUpdate } from './lib/appUpdate';
import { LibraryView } from './components/LibraryView';
import { Onboarding } from './components/Onboarding';
import { ActivityPanel, SelectionBar, SettingsDialog, Toasts, UpdateDialogView } from './components/Overlays';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { useStore } from './lib/store';

export default function App() {
  const { ready, init, settings, view, loadingStep } = useStore();

  useEffect(() => {
    void init();
  }, [init]);

  // Kiểm tra bản app mới sau khi đã vào giao diện chính
  useEffect(() => {
    if (ready) void useAppUpdate.getState().init();
  }, [ready]);

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  if (!ready) {
    const vi = settings.language !== 'en';
    const steps = vi
      ? ['Đang khởi động…', 'Đang tải danh sách phần mềm mới nhất…', 'Đang đọc thư mục bộ cài…', 'Đang kiểm tra phần mềm đã cài trên máy…', 'Sẵn sàng!']
      : ['Starting…', 'Loading the latest software list…', 'Reading your installer folder…', 'Checking installed software…', 'Ready!'];
    const pct = Math.max(8, (loadingStep / 4) * 100);
    return (
      <div data-tauri-drag-region className="grid h-full place-items-center">
        <div className="flex flex-col items-center">
          <img src={mascotDownload} alt="" className="h-36 w-36 animate-float" draggable={false} />
          <div className="mt-4 font-display text-2xl font-extrabold">
            SOGE <span className="text-brand">Multi App</span>
          </div>
          <div className="relative mt-5 h-2 w-64 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line">
            <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
            <div className="absolute inset-y-0 left-0 w-1/4 animate-slide bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          </div>
          <div className="mt-3 h-5 text-sm text-muted">{steps[Math.min(loadingStep, 4)]}</div>
        </div>
      </div>
    );
  }

  if (!settings.downloadDir) {
    return (
      <>
        <div data-tauri-drag-region className="fixed inset-x-0 top-0 z-10 h-10" />
        <WindowButtonsOnly />
        <Onboarding />
        <Toasts />
      </>
    );
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="flex-1 overflow-y-auto" key={view}>
          <AppUpdateBanner />
          {view === 'library' ? <LibraryView /> : <CatalogView tab={view} />}
        </div>
      </main>
      <SelectionBar />
      <ActivityPanel />
      <SettingsDialog />
      <UpdateDialogView />
      <JustUpdatedDialog />
      <Toasts />
    </div>
  );
}

function WindowButtonsOnly() {
  const w = getCurrentWindow();
  return (
    <div className="fixed right-2 top-2 z-20 flex">
      <button className="grid h-9 w-11 place-items-center rounded-lg text-muted hover:bg-surface-2" onClick={() => void w.minimize()}>
        <Minus className="h-4 w-4" />
      </button>
      <button className="grid h-9 w-11 place-items-center rounded-lg text-muted hover:bg-[#e81123] hover:text-white" onClick={() => void w.close()}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
