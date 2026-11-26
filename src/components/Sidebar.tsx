import { BadgeCheck, FolderDown, FolderOpen, Gamepad2, Gift, Monitor, Settings as Cog, type LucideIcon } from 'lucide-react';
import { useAppUpdate } from '../lib/appUpdate';
import { inTab } from '../lib/format';
import logoText from '../assets/img/logo-text.webp';
import { api } from '../lib/api';
import { useStore, type View } from '../lib/store';
import type { TKey } from '../lib/i18n';

const NAV: { id: View; icon: LucideIcon; label?: TKey }[] = [
  { id: 'free', icon: Gift },
  { id: 'licensed', icon: BadgeCheck },
  { id: 'games', icon: Gamepad2 },
  { id: 'windows', icon: Monitor },
];

export function Sidebar() {
  const { view, setView, catalog, settings, library, t, set } = useStore();
  const lang = settings.language;
  const count = (tab: View) => (catalog && tab !== 'library' ? catalog.apps.filter((a) => inTab(a, tab, catalog)).length : 0);
  const libCount = Object.keys(library).length;
  const appVersion = useAppUpdate((u) => u.current);

  return (
    <aside className="flex w-[276px] shrink-0 flex-col border-r border-line bg-surface/70">
      <div data-tauri-drag-region className="flex flex-col items-center px-6 pb-5 pt-6">
        <img src={logoText} alt="SOGE Store" draggable={false} className="logo-chip pointer-events-none h-auto w-[160px]" />
        <div className="pointer-events-none mt-2 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          <span className="font-display text-[14px] font-extrabold tracking-[0.2em] text-muted">MULTI APP</span>
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV.map(({ id, icon: Icon }) => {
          const tab = catalog?.tabs.find((x) => x.id === id);
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`group flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition ${
                active ? 'bg-brand text-[#3A1D16] shadow-card' : 'text-muted hover:bg-surface-2 hover:text-ink'
              }`}
            >
              <span
                className={`grid h-9 w-9 place-items-center rounded-xl transition ${
                  active ? 'bg-white/40' : 'bg-surface-2 group-hover:bg-surface'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.3} />
              </span>
              <span className="min-w-0 flex-1 truncate whitespace-nowrap">{tab?.name[lang] ?? id}</span>
              <span className={`text-xs font-bold ${active ? 'text-[#3A1D16]/70' : 'text-muted/70'}`}>{count(id)}</span>
            </button>
          );
        })}

        <div className="mx-3 my-3 h-px bg-line" />

        <button
          onClick={() => setView('library')}
          className={`group flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition ${
            view === 'library' ? 'bg-ink text-bg shadow-card' : 'text-muted hover:bg-surface-2 hover:text-ink'
          }`}
        >
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${view === 'library' ? 'bg-white/15' : 'bg-surface-2'}`}>
            <FolderDown className="h-[18px] w-[18px]" strokeWidth={2.3} />
          </span>
          <span className="flex-1">{t('library')}</span>
          {libCount > 0 && <span className="text-xs font-bold opacity-70">{libCount}</span>}
        </button>
      </nav>

      <div className="mt-auto space-y-2 p-3">
        <div className="rounded-2xl border border-line bg-surface p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t('folder')}</div>
          <div className="mt-1 truncate text-[13px] font-semibold" title={settings.downloadDir ?? ''}>
            {settings.downloadDir}
          </div>
          <div className="mt-2 flex gap-1.5">
            <button className="btn-outline flex-1 !px-2 !py-1.5 text-xs" onClick={() => api.reveal()}>
              <FolderOpen className="h-3.5 w-3.5" />
              {t('openFolder')}
            </button>
            <button className="btn-outline !px-2.5 !py-1.5" onClick={() => set({ settingsOpen: true })} title={t('settings')}>
              <Cog className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="text-center text-[11px] text-muted/80">SOGE Multi App {appVersion ? `v${appVersion}` : ''}</div>
      </div>
    </aside>
  );
}
