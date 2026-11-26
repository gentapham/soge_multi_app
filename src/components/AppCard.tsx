import { ask } from '@tauri-apps/plugin-dialog';
import { Check, CircleCheck, Download, ExternalLink, FolderOpen, MoreHorizontal, RotateCcw, ShoppingCart, Sparkles, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { displayVersion, findInstalled, formatBytes, formatSpeed } from '../lib/format';
import { needsDownload, useStore } from '../lib/store';
import type { CatalogApp } from '../lib/types';
import { AppIcon, ProgressBar } from './ui';

export function AppCard({ app, index }: { app: CatalogApp; index: number }) {
  const s = useStore();
  const { t, settings, library, installed, tasks, selected, toggleSelect, enqueue, cancel } = s;
  const lang = settings.language;
  const entry = library[app.id];
  const task = tasks[app.id];
  const inst = findInstalled(app, installed);
  const outdated = !!entry && needsDownload(s, app);
  const isSelected = selected.includes(app.id);
  const busy = task && ['queued', 'downloading', 'waiting-install', 'installing'].includes(task.phase);
  const noRelease = !app.release;
  const isLink = !!app.link;
  const mode = app.installMode ?? (app.release?.installerType === 'portable' || app.release?.installerType === 'zip' ? 'portable' : 'silent');

  const pct = task?.total ? (task.received / task.total) * 100 : 0;

  return (
    <div
      className={`group relative flex animate-fade-up flex-col rounded-[22px] border bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift ${
        isSelected ? 'border-brand ring-2 ring-brand/40' : 'border-line'
      }`}
      style={{ animationDelay: `${Math.min(index, 16) * 25}ms` }}
    >
      <div className="flex items-start gap-3">
        <AppIcon id={app.id} name={app.name} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="truncate font-display text-[17px] font-bold leading-tight">{app.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
            <span className="truncate">{isLink ? 'microsoft.com' : displayVersion(app.release?.version, lang) || '—'}</span>
            {app.release?.size ? (
              <>
                <span className="opacity-50">•</span>
                <span>{formatBytes(app.release.size)}</span>
              </>
            ) : null}
          </div>
        </div>
        <button
          onClick={() => toggleSelect(app.id)}
          disabled={noRelease}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${
            isSelected ? 'border-brand bg-brand text-[#3A1D16]' : 'border-line text-transparent hover:border-brand/70'
          }`}
          aria-label="select"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
        </button>
      </div>

      <p className="mt-3 line-clamp-2 min-h-[40px] text-[13px] leading-5 text-muted">{app.desc[lang]}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {inst && (
          <span className="badge bg-ok/12 text-ok" title={inst.version ?? ''}>
            <CircleCheck className="h-3 w-3" /> {t('installed')}
          </span>
        )}
        {entry && !outdated && (
          <span className="badge bg-info/12 text-info">
            <Download className="h-3 w-3" /> {t('downloaded')}
          </span>
        )}
        {outdated && (
          <span className="badge bg-brand/20 text-[#9a5b00] dark:text-brand">
            <Sparkles className="h-3 w-3" /> {t('newVersion')}
          </span>
        )}
        {isLink && (
          <span className="badge bg-info/12 text-info">
            <ExternalLink className="h-3 w-3" /> {t('officialPage')}
          </span>
        )}
        {!isLink && mode === 'silent' && (
          <span className="badge bg-surface-2 text-muted" title={t('silentHint')}>
            <Zap className="h-3 w-3" /> Auto
          </span>
        )}
        {mode === 'portable' && (
          <span className="badge bg-surface-2 text-muted" title={t('portableHint')}>
            Portable
          </span>
        )}
      </div>

      <div className="mt-auto pt-4">
        {busy ? (
          <TaskStrip appId={app.id} pct={pct} />
        ) : (
          <div className="flex items-center gap-2">
            {isLink ? (
              <button className="btn-primary h-10 flex-1" onClick={() => void api.openUrl(app.link!)}>
                <ExternalLink className="h-4 w-4" /> {t('openPage')}
              </button>
            ) : (
            <button
              className={`${inst && !outdated ? 'btn-soft-ok' : 'btn-primary'} h-10 flex-1`}
              disabled={noRelease}
              onClick={() => enqueue([app.id], 'install')}
              title={mode === 'interactive' ? t('interactiveHint') : mode === 'portable' ? t('portableHint') : t('silentHint')}
            >
              {noRelease ? (
                t('unavailable')
              ) : outdated ? (
                <>
                  <Sparkles className="h-4 w-4" /> {t('update')}
                </>
              ) : inst ? (
                <>
                  <RotateCcw className="h-4 w-4" /> {t('reinstall')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> {t('install')}
                </>
              )}
            </button>
            )}
            {app.buyUrl && (
              <button className="btn-outline h-10 w-10 shrink-0 !p-0" title={t('buy')} onClick={() => void api.openUrl(app.buyUrl!)}>
                <ShoppingCart className="h-4 w-4" />
              </button>
            )}
            <CardMenu app={app} hasEntry={!!entry} />
          </div>
        )}
        {task?.phase === 'error' && !busy && (
          <div className="mt-2 line-clamp-2 text-xs text-bad" title={task.error}>
            {task.error}
          </div>
        )}
      </div>

      {busy && task?.phase === 'downloading' && (
        <button
          onClick={() => cancel(app.id)}
          className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-muted hover:text-bad"
          title={t('cancel')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function TaskStrip({ appId, pct }: { appId: string; pct: number }) {
  const { tasks, t } = useStore();
  const task = tasks[appId];
  if (!task) return null;
  const label =
    task.phase === 'queued'
      ? t('queued')
      : task.phase === 'downloading'
        ? `${t('downloading')} ${task.total ? Math.floor(pct) + '%' : formatBytes(task.received)}`
        : task.phase === 'waiting-install'
          ? t('waitingInstall')
          : t('installing');
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span>{label}</span>
        <span className="text-muted">{task.phase === 'downloading' ? formatSpeed(task.speed) : ''}</span>
      </div>
      <ProgressBar value={pct} indeterminate={task.phase !== 'downloading' || !task.total} />
    </div>
  );
}

function CardMenu({ app, hasEntry }: { app: CatalogApp; hasEntry: boolean }) {
  const { t, enqueue, deleteDownload } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium hover:bg-surface-2';
  return (
    <div className="relative" ref={ref}>
      <button className="btn-outline h-10 w-10 shrink-0 !p-0" onClick={() => setOpen(!open)}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-52 animate-pop-in rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          <button className={item} disabled={!app.release} onClick={() => (enqueue([app.id], 'download'), setOpen(false))}>
            <Download className="h-4 w-4 text-muted" /> {t('downloadOnly')}
          </button>
          {hasEntry && (
            <button className={item} onClick={() => (void api.reveal(app.id), setOpen(false))}>
              <FolderOpen className="h-4 w-4 text-muted" /> {t('showFile')}
            </button>
          )}
          <button className={item} onClick={() => (void api.openUrl(app.homepage), setOpen(false))}>
            <ExternalLink className="h-4 w-4 text-muted" /> {t('homepage')}
          </button>
          {hasEntry && (
            <button
              className={`${item} text-bad`}
              onClick={() => {
                setOpen(false);
                void ask(t('confirmDelete'), { title: app.name, kind: 'warning' }).then((ok) => {
                  if (ok) void deleteDownload(app.id);
                });
              }}
            >
              <Trash2 className="h-4 w-4" /> {t('deleteFile')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
