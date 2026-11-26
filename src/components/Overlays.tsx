import { CircleAlert, CircleCheck, Download, Info, ListChecks, Monitor, Moon, Sun, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import mascotEmpty from '../assets/img/mascot-empty.webp';
import mascotSuccess from '../assets/img/mascot-success.webp';
import mascotUpdate from '../assets/img/mascot-update.webp';
import { displayVersion, formatBytes, formatSpeed, matchesSearch } from '../lib/format';
import { appById, useStore } from '../lib/store';
import type { Lang, Theme } from '../lib/types';
import { AppIcon, Modal, ProgressBar, Segmented } from './ui';

/** Thanh nổi khi chọn nhiều phần mềm. */
export function SelectionBar() {
  const { selected, setSelected, enqueue, t, catalog, view, category, search } = useStore();
  if (view === 'library') return null;
  const visible =
    catalog?.apps.filter(
      (a) =>
        a.tab === view &&
        a.release &&
        (category[view] === 'all' || a.category === category[view]) &&
        matchesSearch(a, search),
    ) ?? [];
  if (!selected.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-[248px] right-0 z-30 flex justify-center">
      <div className="pointer-events-auto flex animate-fade-up items-center gap-2 rounded-2xl border border-line bg-ink py-2 pl-5 pr-2 text-bg shadow-pop">
        <ListChecks className="h-5 w-5 text-brand" />
        <span className="mr-2 text-sm font-semibold">
          {t('selected')}: {selected.length}
        </span>
        <button className="btn !px-3 text-bg/80 hover:bg-white/10" onClick={() => setSelected(visible.map((a) => a.id))}>
          {t('selectAll')}
        </button>
        <button className="btn !px-3 text-bg/80 hover:bg-white/10" onClick={() => setSelected([])}>
          {t('clear')}
        </button>
        <button className="btn border border-white/20 text-bg hover:bg-white/10" onClick={() => enqueue(selected, 'download')}>
          <Download className="h-4 w-4" /> {t('downloadOnly')}
        </button>
        <button className="btn-primary" onClick={() => enqueue(selected, 'install')}>
          {t('installAll')} ({selected.length})
        </button>
      </div>
    </div>
  );
}

/** Bảng tiến trình tải/cài. */
export function ActivityPanel() {
  const s = useStore();
  const { panelOpen, set, tasks, t, clearFinished, cancel, dismissTask } = s;
  if (!panelOpen) return null;
  const list = Object.values(tasks).sort((a, b) => b.startedAt - a.startedAt);
  const label = (p: string) =>
    ({
      queued: t('queued'),
      downloading: t('downloading'),
      'waiting-install': t('waitingInstall'),
      installing: t('installing'),
      done: t('done'),
      error: t('failed'),
      cancelled: t('cancel'),
    })[p] ?? p;
  return (
    <>
      <div className="fixed inset-0 z-30" onMouseDown={() => set({ panelOpen: false })} />
      <div className="fixed right-4 top-[64px] z-40 flex max-h-[70vh] w-[380px] animate-pop-in flex-col rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="font-display text-lg font-bold">{t('downloads')}</span>
          <button className="text-xs font-semibold text-muted hover:text-ink" onClick={clearFinished}>
            {t('clearFinished')}
          </button>
        </div>
        <div className="overflow-y-auto p-2">
          {list.length === 0 && <div className="py-10 text-center text-sm text-muted">{t('noTasks')}</div>}
          {list.map((task) => {
            const app = appById(s, task.appId);
            const busy = ['queued', 'downloading', 'waiting-install', 'installing'].includes(task.phase);
            const pct = task.total ? (task.received / task.total) * 100 : 0;
            return (
              <div key={task.appId} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-surface-2">
                <AppIcon id={task.appId} name={app?.name ?? task.appId} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{app?.name}</span>
                    <span
                      className={`shrink-0 text-[11px] font-semibold ${
                        task.phase === 'error' ? 'text-bad' : task.phase === 'done' ? 'text-ok' : 'text-muted'
                      }`}
                    >
                      {label(task.phase)}
                      {task.phase === 'downloading' && task.total ? ` ${Math.floor(pct)}%` : ''}
                    </span>
                  </div>
                  {busy ? (
                    <div className="mt-1.5">
                      <ProgressBar value={pct} indeterminate={task.phase !== 'downloading' || !task.total} />
                      {task.phase === 'downloading' && (
                        <div className="mt-1 text-[11px] text-muted">
                          {formatBytes(task.received)} / {formatBytes(task.total)} · {formatSpeed(task.speed)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="truncate text-[11px] text-muted" title={task.error}>
                      {task.error ?? (task.result?.needsReboot ? t('rebootNeeded') : displayVersion(app?.release?.version, s.settings.language))}
                    </div>
                  )}
                </div>
                <button
                  className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface hover:text-bad"
                  onClick={() => (busy ? cancel(task.appId) : dismissTask(task.appId))}
                  title={busy ? t('cancel') : t('close')}
                  disabled={task.phase === 'installing'}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex w-[340px] flex-col gap-2">
      {toasts.map((x) => {
        const Icon = x.kind === 'ok' ? CircleCheck : x.kind === 'err' ? CircleAlert : Info;
        return (
          <div
            key={x.id}
            className="pointer-events-auto flex animate-fade-up items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-pop"
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${x.kind === 'ok' ? 'text-ok' : x.kind === 'err' ? 'text-bad' : 'text-info'}`} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{x.title}</div>
              {x.text && <div className="mt-0.5 line-clamp-3 text-[13px] text-muted">{x.text}</div>}
            </div>
            <button className="text-muted hover:text-ink" onClick={() => dismissToast(x.id)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function UpdateDialogView() {
  const s = useStore();
  const { updateDialog, set, t, tasks, settings } = s;
  const close = () => set({ updateDialog: null });
  if (!updateDialog) return null;
  const img = updateDialog.kind === 'updating' ? mascotUpdate : updateDialog.kind === 'uptodate' ? mascotSuccess : mascotEmpty;
  return (
    <Modal open onClose={close} width={updateDialog.kind === 'updating' ? 560 : 440}>
      <div className="flex flex-col items-center text-center">
        <img src={img} alt="" className="h-36 w-36" draggable={false} />
        <h2 className="mt-1 font-display text-2xl font-bold">
          {updateDialog.kind === 'updating' ? t('updatesTitle') : updateDialog.kind === 'uptodate' ? t('upToDateTitle') : t('libraryEmpty')}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {updateDialog.kind === 'updating' ? t('updatesText') : updateDialog.kind === 'uptodate' ? t('upToDateText') : t('nothingDownloaded')}
        </p>
      </div>
      {updateDialog.kind === 'updating' && (
        <div className="mt-5 max-h-[300px] space-y-1 overflow-y-auto">
          {updateDialog.appIds.map((id) => {
            const app = appById(s, id);
            const entry = s.library[id];
            const task = tasks[id];
            const pct = task?.total ? (task.received / task.total) * 100 : 0;
            return (
              <div key={id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2.5">
                <AppIcon id={id} name={app?.name ?? id} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="truncate">{app?.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {task?.phase === 'done' ? (
                        <span className="text-ok">✓ {t('done')}</span>
                      ) : task?.phase === 'error' ? (
                        <span className="text-bad">{t('failed')}</span>
                      ) : (
                        <>
                          {displayVersion(entry?.version, settings.language)} → {displayVersion(app?.release?.version, settings.language)}
                        </>
                      )}
                    </span>
                  </div>
                  {task && ['queued', 'downloading'].includes(task.phase) && (
                    <div className="mt-1.5">
                      <ProgressBar value={pct} indeterminate={task.phase === 'queued' || !task.total} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button className="btn-primary mt-6 w-full" onClick={close}>
        {t('close')}
      </button>
    </Modal>
  );
}

export function SettingsDialog() {
  const { settingsOpen, set, t, settings, saveSettings, catalog, catalogSource } = useStore();
  const pickFolder = async () => {
    const r = await open({ directory: true, multiple: false, defaultPath: settings.downloadDir ?? undefined });
    if (typeof r === 'string') await saveSettings({ downloadDir: r });
  };
  const row = 'flex items-center justify-between gap-4 py-3.5';
  return (
    <Modal open={settingsOpen} onClose={() => set({ settingsOpen: false })}>
      <h2 className="font-display text-2xl font-bold">{t('settings')}</h2>
      <div className="mt-3 divide-y divide-line">
        <div className={row}>
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t('folder')}</div>
            <div className="truncate text-xs text-muted">{settings.downloadDir}</div>
          </div>
          <button className="btn-outline shrink-0 !py-1.5" onClick={() => void pickFolder()}>
            {t('change')}
          </button>
        </div>
        <div className={row}>
          <span className="text-sm font-semibold">{t('language')}</span>
          <Segmented<Lang>
            value={settings.language}
            onChange={(v) => void saveSettings({ language: v })}
            options={[
              { value: 'vi', label: 'Tiếng Việt' },
              { value: 'en', label: 'English' },
            ]}
          />
        </div>
        <div className={row}>
          <span className="text-sm font-semibold">{t('theme')}</span>
          <Segmented<Theme>
            value={settings.theme}
            onChange={(v) => void saveSettings({ theme: v })}
            options={[
              { value: 'light', label: <><Sun className="h-3.5 w-3.5" /> {t('light')}</> },
              { value: 'dark', label: <><Moon className="h-3.5 w-3.5" /> {t('dark')}</> },
              { value: 'system', label: <><Monitor className="h-3.5 w-3.5" /> {t('system')}</> },
            ]}
          />
        </div>
        <div className={row}>
          <span className="text-sm font-semibold">{t('concurrent')}</span>
          <Segmented<string>
            value={String(settings.maxConcurrent)}
            onChange={(v) => void saveSettings({ maxConcurrent: Number(v) })}
            options={['1', '2', '3', '5'].map((v) => ({ value: v, label: v }))}
          />
        </div>
        <div className="pt-3.5 text-xs text-muted">
          {t('dataUpdated')}: {catalog?.generatedAt ? new Date(catalog.generatedAt).toLocaleString(settings.language === 'vi' ? 'vi-VN' : 'en-GB') : '—'} ·{' '}
          {catalogSource}
        </div>
      </div>
    </Modal>
  );
}
