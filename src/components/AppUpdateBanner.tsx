import { ArrowRight, Sparkles } from 'lucide-react';
import mascotUpdate from '../assets/img/mascot-update.webp';
import { useAppUpdate } from '../lib/appUpdate';
import { formatBytes } from '../lib/format';
import { useStore } from '../lib/store';

/** Thông báo khi có bản SOGE Multi App mới + màn hình chờ khi đang cập nhật. */
export function AppUpdateBanner() {
  const { available, current, phase, received, total, error, dismissed, install, dismiss } = useAppUpdate();
  const vi = useStore((s) => s.settings.language) !== 'en';
  if (!available) return null;

  if (phase === 'downloading' || phase === 'installing') {
    return <UpdatingOverlay version={available.version} phase={phase} received={received} total={total} vi={vi} />;
  }
  if (dismissed) return null;

  return (
    <div className="mx-8 mb-5 animate-fade-up overflow-hidden rounded-[22px] border border-brand/40 bg-gradient-to-r from-[#FFE7B8] via-[#FFE1C8] to-[#FFD9D4] text-[#3A1D16] shadow-card">
      <div className="flex items-center gap-4 py-3 pl-3 pr-5">
        <img src={mascotUpdate} alt="" className="h-16 w-16 shrink-0" draggable={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-display text-[17px] font-extrabold">
            <Sparkles className="h-4 w-4 text-[#d97706]" />
            {vi ? 'Đã có phiên bản SOGE Multi App mới!' : 'A new SOGE Multi App is available!'}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px]">
            <span className="rounded-full bg-white/70 px-2 py-0.5 font-semibold text-[#3A1D16]/70">v{current || '?'}</span>
            <ArrowRight className="h-3.5 w-3.5 text-[#3A1D16]/50" />
            <span className="rounded-full bg-[#3A1D16] px-2 py-0.5 font-bold text-[#FFE7B8]">v{available.version}</span>
            <span className="ml-1 text-[#3A1D16]/70">
              {phase === 'error'
                ? (vi ? 'Cập nhật chưa thành công — thử lại nhé. ' : 'Update failed — please retry. ') + (error ?? '')
                : vi
                  ? 'Chỉ mất khoảng 1 phút, app sẽ tự mở lại.'
                  : 'Takes about a minute, the app reopens by itself.'}
            </span>
          </div>
        </div>
        <button
          className="btn h-10 shrink-0 text-[#3A1D16]/70 hover:bg-white/50 hover:text-[#3A1D16]"
          onClick={dismiss}
        >
          {vi ? 'Để sau' : 'Later'}
        </button>
        <button className="btn h-10 shrink-0 bg-[#3A1D16] text-[#FFE7B8] hover:opacity-90" onClick={() => void install()}>
          {phase === 'error' ? (vi ? 'Thử lại' : 'Retry') : vi ? 'Cập nhật ngay' : 'Update now'}
        </button>
      </div>
    </div>
  );
}

function UpdatingOverlay({
  version,
  phase,
  received,
  total,
  vi,
}: {
  version: string;
  phase: 'downloading' | 'installing';
  received: number;
  total: number | null;
  vi: boolean;
}) {
  const installing = phase === 'installing';
  const pct = installing ? 100 : total ? Math.min(100, Math.round((received / total) * 100)) : 0;
  const detail = installing
    ? vi
      ? 'Đang cài bản mới — app sẽ tự mở lại sau vài giây…'
      : 'Installing — the app will reopen in a few seconds…'
    : received > 0
      ? `${formatBytes(received)}${total ? ' / ' + formatBytes(total) : ''}`
      : vi
        ? 'Đang kết nối máy chủ…'
        : 'Connecting…';

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-bg/90 backdrop-blur-md">
      <div className="flex w-[420px] animate-pop-in flex-col items-center rounded-[28px] border border-line bg-surface px-10 pb-9 pt-7 text-center shadow-pop">
        <img src={mascotUpdate} alt="" className="h-36 w-36 animate-float" draggable={false} />
        <div className="mt-2 font-display text-2xl font-extrabold">
          {vi ? 'Đang cập nhật lên' : 'Updating to'} <span className="text-brand">v{version}</span>
        </div>
        <div className="mt-1 text-[13px] text-muted">{vi ? 'Vui lòng không tắt máy trong lúc này' : 'Please keep your PC on'}</div>

        <div className="mt-6 w-full">
          <div className="mb-1.5 flex items-end justify-between text-[13px]">
            <span className="font-semibold">{installing ? (vi ? 'Đang cài đặt' : 'Installing') : vi ? 'Đang tải' : 'Downloading'}</span>
            <span className="font-display text-lg font-extrabold text-brand">{installing || total ? `${pct}%` : ''}</span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FBAE2C] to-[#F59E8B] transition-[width] duration-300"
              style={{ width: `${total || installing ? Math.max(4, pct) : 30}%` }}
            />
            {(!total || installing) && (
              <div className="absolute inset-y-0 left-0 w-1/3 animate-slide bg-gradient-to-r from-transparent via-white/60 to-transparent" />
            )}
          </div>
          <div className="mt-2 text-xs text-muted">{detail}</div>
        </div>
      </div>
    </div>
  );
}
