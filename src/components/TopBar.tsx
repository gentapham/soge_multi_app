import { getCurrentWindow } from '@tauri-apps/api/window';
import { Activity, Copy, Minus, RefreshCw, Search, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';

export function TopBar() {
  const { search, setSearch, checkUpdates, checking, t, tasks, set, panelOpen, view } = useStore();
  const active = Object.values(tasks).filter((x) => ['queued', 'downloading', 'waiting-install', 'installing'].includes(x.phase)).length;
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void win.isMaximized().then(setMaximized);
    const un = win.onResized(() => void win.isMaximized().then(setMaximized));
    return () => {
      void un.then((f) => f());
    };
  }, [win]);

  return (
    <header data-tauri-drag-region className="flex h-[64px] shrink-0 items-center gap-3 pl-8 pr-2">
      {view !== 'library' ? (
        <label className="flex h-10 w-full max-w-[420px] items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 shadow-card focus-within:border-brand">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search')}
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      ) : (
        <div data-tauri-drag-region className="flex-1" />
      )}
      <div data-tauri-drag-region className="flex-1" />

      <button className="btn-outline h-10" onClick={() => void checkUpdates()} disabled={checking}>
        <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
        {checking ? t('checking') : t('checkUpdate')}
      </button>
      <button
        className={`btn-outline relative h-10 !px-3 ${panelOpen ? '!border-brand' : ''}`}
        onClick={() => set({ panelOpen: !panelOpen })}
        title={t('downloads')}
      >
        <Activity className="h-4 w-4" />
        {active > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-bad px-1 text-[11px] font-bold text-white">
            {active}
          </span>
        )}
      </button>

      <div className="ml-2 flex items-center">
        <WinBtn onClick={() => void win.minimize()} title={t('minimize')}>
          <Minus className="h-4 w-4" />
        </WinBtn>
        <WinBtn onClick={() => void win.toggleMaximize()} title={t('maximize')}>
          {maximized ? <Copy className="h-3.5 w-3.5 -scale-x-100" /> : <Square className="h-3.5 w-3.5" />}
        </WinBtn>
        <WinBtn onClick={() => void win.close()} title={t('closeWindow')} danger>
          <X className="h-4 w-4" />
        </WinBtn>
      </div>
    </header>
  );
}

function WinBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-9 w-11 place-items-center rounded-lg text-muted transition ${
        danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-surface-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
