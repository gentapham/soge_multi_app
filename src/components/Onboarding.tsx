import { open } from '@tauri-apps/plugin-dialog';
import { ArrowRight, Folder, FolderOpen, HardDrive } from 'lucide-react';
import { useEffect, useState } from 'react';
import logoText from '../assets/img/logo-text.webp';
import mascot from '../assets/img/mascot-welcome.webp';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { Lang } from '../lib/types';
import { Segmented } from './ui';

export function Onboarding() {
  const { t, settings, saveSettings } = useStore();
  const [dir, setDir] = useState<string | null>(null);
  const [suggested, setSuggested] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.suggestDownloadDir().then(setSuggested);
  }, []);

  const pick = async () => {
    const r = await open({ directory: true, multiple: false, title: t('chooseFolderTitle') });
    if (typeof r === 'string') setDir(r);
  };

  const start = async () => {
    if (!dir) return;
    setSaving(true);
    await saveSettings({ downloadDir: dir });
    setSaving(false);
  };

  const root = dir ?? suggested;

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden px-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-brand/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[460px] w-[460px] rounded-full bg-blush/30 blur-3xl" />

      <div className="relative grid w-full max-w-[1040px] grid-cols-[1fr_520px] items-center gap-10">
        <div className="flex flex-col items-center text-center">
          <img src={logoText} alt="SOGE Store" className="logo-chip w-[220px]" draggable={false} />
          <img src={mascot} alt="" className="mt-4 w-[280px] animate-float" draggable={false} />
          <h1 className="mt-3 font-display leading-[1.1]">
            <span className="block text-[24px] font-semibold text-muted">{t('welcomeLine1')}</span>
            <span className="block text-[44px] font-extrabold">
              SOGE <span className="text-brand">Multi App</span>
            </span>
          </h1>
          <p className="mt-2 text-[17px] font-semibold text-muted">{t('welcomeText')}</p>
        </div>

        <div className="animate-pop-in rounded-[28px] border border-line bg-surface p-8 shadow-lift">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted">{t('language')}</span>
            <Segmented<Lang>
              value={settings.language}
              onChange={(v) => void saveSettings({ language: v })}
              options={[
                { value: 'vi', label: 'Tiếng Việt' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>

          <div className="my-6 h-px bg-line" />

          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-[#9a5b00] dark:text-brand">
              <HardDrive className="h-5 w-5" />
            </span>
            <h2 className="font-display text-2xl font-bold">{t('chooseFolderTitle')}</h2>
          </div>
          <p className="mt-2 text-[14px] leading-6 text-muted">{t('chooseFolderText')}</p>

          <button
            onClick={() => void pick()}
            className={`mt-5 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed p-4 text-left transition ${
              dir ? 'border-ok/60 bg-ok/5' : 'border-line hover:border-brand hover:bg-brand-soft/40'
            }`}
          >
            <FolderOpen className={`h-6 w-6 shrink-0 ${dir ? 'text-ok' : 'text-muted'}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold">{dir ?? t('chooseFolder')}</div>
            </div>
            <span className="btn-outline !py-1.5 text-xs">{dir ? t('change') : t('chooseFolder')}</span>
          </button>

          {!dir && suggested && (
            <button onClick={() => setDir(suggested)} className="mt-2 text-[13px] font-semibold text-muted hover:text-ink">
              💡 {t('useSuggested')} <span className="underline decoration-brand decoration-2 underline-offset-2">{suggested}</span>
            </button>
          )}

          <div className="mt-5 rounded-2xl bg-surface-2 p-4 text-[12.5px]">
            <div className="mb-2 font-semibold text-muted">{t('folderPreview')}</div>
            <Tree root={root || 'D:\\SOGE Software'} />
          </div>

          <button className="btn-primary mt-6 h-12 w-full text-base" disabled={!dir || saving} onClick={() => void start()}>
            {t('start')} <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Tree({ root }: { root: string }) {
  const row = (depth: number, name: string, file?: boolean) => (
    <div className="flex items-center gap-1.5 font-mono text-[12px]" style={{ paddingLeft: depth * 16 }}>
      {file ? <span className="w-3.5 text-center text-muted">·</span> : <Folder className="h-3.5 w-3.5 text-brand" />}
      <span className={file ? 'text-muted' : 'font-semibold'}>{name}</span>
    </div>
  );
  return (
    <div className="space-y-0.5">
      {row(0, root)}
      {row(1, 'Mien Phi')}
      {row(2, 'Bo Go Chu')}
      {row(3, 'UniKey')}
      {row(4, 'unikey46RC2-win64.zip', true)}
      {row(1, 'Ban Quyen')}
      {row(1, 'Games')}
    </div>
  );
}
