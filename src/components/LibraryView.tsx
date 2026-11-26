import { ask } from '@tauri-apps/plugin-dialog';
import { Download, FolderOpen, Play, Sparkles, Trash2 } from 'lucide-react';
import mascotDownload from '../assets/img/mascot-download.webp';
import { api } from '../lib/api';
import { displayVersion, formatBytes } from '../lib/format';
import { appById, needsDownload, useStore } from '../lib/store';
import { AppIcon, ProgressBar } from './ui';

export function LibraryView() {
  const s = useStore();
  const { library, t, settings, enqueue, deleteDownload, tasks } = s;
  const lang = settings.language;
  const entries = Object.values(library).sort((a, b) => b.downloadedAt - a.downloadedAt);
  const total = entries.reduce((n, e) => n + e.size, 0);
  const outdated = entries.filter((e) => {
    const a = appById(s, e.appId);
    return a?.release && needsDownload(s, a);
  });

  return (
    <div className="px-8 pb-28">
      <section className="mb-6 flex items-center gap-6 rounded-[28px] border border-line bg-surface p-6 shadow-card">
        <img src={mascotDownload} alt="" className="h-28 w-28" draggable={false} />
        <div className="flex-1">
          <h1 className="font-display text-[32px] font-extrabold leading-none">{t('library')}</h1>
          <p className="mt-2 text-sm text-muted">{t('librarySub')}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
            <span className="badge bg-surface-2 px-2.5 py-1 text-ink">
              {entries.length} {t('apps')}
            </span>
            <span className="badge bg-surface-2 px-2.5 py-1 text-ink">
              {t('totalSize')}: {formatBytes(total)}
            </span>
            {outdated.length > 0 && (
              <span className="badge bg-brand/20 px-2.5 py-1 text-[#9a5b00] dark:text-brand">
                <Sparkles className="h-3 w-3" /> {outdated.length} {t('newVersion').toLowerCase()}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {outdated.length > 0 && (
            <button className="btn-primary" onClick={() => enqueue(outdated.map((e) => e.appId), 'download', { isUpdate: true })}>
              <Sparkles className="h-4 w-4" /> {t('update')} ({outdated.length})
            </button>
          )}
          <button className="btn-outline" onClick={() => void api.reveal()}>
            <FolderOpen className="h-4 w-4" /> {t('openFolder')}
          </button>
        </div>
      </section>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <h3 className="font-display text-2xl font-bold">{t('libraryEmpty')}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted">{t('libraryEmptyText')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-card">
          {entries.map((e, i) => {
            const app = appById(s, e.appId);
            const isOld = app?.release && needsDownload(s, app);
            const task = tasks[e.appId];
            const busy = task && ['queued', 'downloading', 'waiting-install', 'installing'].includes(task.phase);
            return (
              <div key={e.appId} className={`flex items-center gap-4 px-5 py-3.5 ${i ? 'border-t border-line' : ''}`}>
                <AppIcon id={e.appId} name={e.appName} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{e.appName}</span>
                    {isOld && (
                      <span className="badge bg-brand/20 text-[#9a5b00] dark:text-brand">
                        {displayVersion(app!.release!.version, lang)}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted" title={e.relPath}>
                    {displayVersion(e.version, lang)} · {formatBytes(e.size)} · {e.relPath}
                  </div>
                  {busy && (
                    <div className="mt-1.5 max-w-sm">
                      <ProgressBar
                        value={task.total ? (task.received / task.total) * 100 : 0}
                        indeterminate={task.phase !== 'downloading' || !task.total}
                      />
                    </div>
                  )}
                </div>
                {isOld && (
                  <button className="btn-primary !py-1.5" disabled={busy} onClick={() => enqueue([e.appId], 'download', { isUpdate: true })}>
                    <Download className="h-4 w-4" /> {t('update')}
                  </button>
                )}
                <button className="btn-outline !py-1.5" disabled={busy || !app} onClick={() => enqueue([e.appId], 'install')}>
                  <Play className="h-4 w-4" /> {t('install')}
                </button>
                <button className="btn-ghost !px-2.5" title={t('showFile')} onClick={() => void api.reveal(e.appId)}>
                  <FolderOpen className="h-4 w-4" />
                </button>
                <button
                  className="btn-ghost !px-2.5 text-bad"
                  title={t('deleteFile')}
                  disabled={busy}
                  onClick={async () => {
                    if (await ask(t('confirmDelete'), { title: e.appName, kind: 'warning' })) void deleteDownload(e.appId);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
