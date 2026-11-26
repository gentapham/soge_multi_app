import { Rocket, X } from 'lucide-react';
import { useAppUpdate } from '../lib/appUpdate';
import { formatBytes } from '../lib/format';
import { useStore } from '../lib/store';
import mascotUpdate from '../assets/img/mascot-update.webp';
import { ProgressBar } from './ui';

/** Thanh thông báo khi có bản SOGE Multi App mới. */
export function AppUpdateBanner() {
  const { available, phase, received, total, error, dismissed, install, dismiss } = useAppUpdate();
  const lang = useStore((s) => s.settings.language);
  const vi = lang !== 'en';
  const busy = phase === 'downloading' || phase === 'installing';
  const pct = total ? (received / total) * 100 : 0;
  if (!available) return null;

  // Đang tải/cài: phủ toàn màn hình để người dùng biết app sắp tự mở lại
  if (busy) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-bg/95 backdrop-blur-sm">
        <div className="flex w-[380px] flex-col items-center text-center">
          <img src={mascotUpdate} alt="" className="h-40 w-40 animate-float" draggable={false} />
          <div className="mt-3 font-display text-2xl font-extrabold">
            {vi ? 'Đang cập nhật lên' : 'Updating to'} <span className="text-brand">v{available.version}</span>
          </div>
          <div className="mt-4 w-full">
            <ProgressBar value={phase === 'installing' ? 100 : pct} indeterminate={phase === 'installing' || !total} />
          </div>
          <div className="mt-2 text-sm text-muted">
            {phase === 'installing'
              ? vi
                ? 'Đang cài bản mới, app sẽ tự mở lại sau vài giây…'
                : 'Installing, the app will reopen in a few seconds…'
              : `${vi ? 'Đang tải' : 'Downloading'} ${formatBytes(received)}${total ? ' / ' + formatBytes(total) : ''}`}
          </div>
        </div>
      </div>
    );
  }
  if (dismissed) return null;

  return (
    <div className="mx-8 mb-4 flex animate-fade-up items-center gap-4 rounded-2xl border border-brand/50 bg-brand-soft px-5 py-3.5 shadow-card">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-[#3A1D16]">
        <Rocket className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[15px] font-extrabold">
          {vi ? `Có bản SOGE Multi App mới: v${available.version}` : `New SOGE Multi App: v${available.version}`}
        </div>
        {busy ? (
          <div className="mt-1.5 max-w-md">
            <ProgressBar value={pct} indeterminate={phase === 'installing' || !total} />
            <div className="mt-1 text-xs text-muted">
              {phase === 'installing'
                ? vi
                  ? 'Đang cài đặt, app sẽ tự mở lại…'
                  : 'Installing, the app will restart…'
                : `${formatBytes(received)}${total ? ' / ' + formatBytes(total) : ''}`}
            </div>
          </div>
        ) : (
          <div className="text-[13px] text-muted">
            {phase === 'error'
              ? (vi ? 'Cập nhật thất bại: ' : 'Update failed: ') + (error ?? '')
              : vi
                ? 'Cập nhật để có phần mềm & tính năng mới nhất. Chỉ mất khoảng 1 phút.'
                : 'Update to get the newest features. Takes about a minute.'}
          </div>
        )}
      </div>
      {!busy && (
        <>
          <button className="btn-primary" onClick={() => void install()}>
            {phase === 'error' ? (vi ? 'Thử lại' : 'Retry') : vi ? 'Cập nhật ngay' : 'Update now'}
          </button>
          <button className="btn-ghost !px-2" onClick={dismiss} title={vi ? 'Để sau' : 'Later'}>
            <X className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
