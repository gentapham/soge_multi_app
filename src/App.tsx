import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, X } from 'lucide-react';
import { useEffect } from 'react';
import mascotDownload from './assets/img/mascot-download.webp';
import { CatalogView } from './components/CatalogView';
import { LibraryView } from './components/LibraryView';
import { Onboarding } from './components/Onboarding';
import { ActivityPanel, SelectionBar, SettingsDialog, Toasts, UpdateDialogView } from './components/Overlays';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { useStore } from './lib/store';

export default function App() {
  const { ready, init, settings, view } = useStore();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  if (!ready) {
    const vi = settings.language !== 'en';
    return (
      <div data-tauri-drag-region className="grid h-full place-items-center">
        <div className="flex flex-col items-center">
          <img src={mascotDownload} alt="" className="h-36 w-36 animate-float" draggable={false} />
          <div className="mt-4 font-display text-xl font-extrabold">
            SOGE <span className="text-brand">Multi App</span>
          </div>
          <div className="mt-1 text-sm text-muted">{vi ? 'Đang tải danh sách phần mềm…' : 'Loading software list…'}</div>
          <div className="mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-1/3 animate-slide rounded-full bg-brand" />
          </div>
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
          {view === 'library' ? <LibraryView /> : <CatalogView tab={view} />}
        </div>
      </main>
      <SelectionBar />
      <ActivityPanel />
      <SettingsDialog />
      <UpdateDialogView />
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
