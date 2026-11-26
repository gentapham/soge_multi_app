import { ArrowRight, CircleCheck, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import mascotSuccess from '../assets/img/mascot-success.webp';
import mascotUpdate from '../assets/img/mascot-update.webp';
import { useAppUpdate, type UpdatePhase } from '../lib/appUpdate';
import { formatBytes } from '../lib/format';
import { useStore } from '../lib/store';
import { Modal } from './ui';

/** Thông báo khi có bản SOGE Multi App mới + màn hình chờ khi đang cập nhật. */
export function AppUpdateBanner() {
  const { available, current, phase, received, total, error, dismissed, install, dismiss } = useAppUpdate();
  const vi = useStore((s) => s.settings.language) !== 'en';
  if (!available) return null;

  if (phase === 'downloading' || phase === 'ready' || phase === 'installing') {
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
        <button className="btn h-10 shrink-0 text-[#3A1D16]/70 hover:bg-white/50 hover:text-[#3A1D16]" onClick={dismiss}>
          {vi ? 'Để sau' : 'Later'}
        </button>
        <button className="btn h-10 shrink-0 bg-[#3A1D16] text-[#FFE7B8] hover:opacity-90" onClick={() => void install()}>
          {phase === 'error' ? (vi ? 'Thử lại' : 'Retry') : vi ? 'Cập nhật ngay' : 'Update now'}
        </button>
      </div>
    </div>
  );
}

/** Số % hiển thị chạy mượt dần tới giá trị thật (không nhảy cóc). */
function useSmoothPercent(target: number) {
  const [shown, setShown] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const diff = target - ref.current;
      if (Math.abs(diff) < 0.5) {
        ref.current = target;
      } else {
        ref.current += Math.max(0.6, diff * 0.12);
        raf = requestAnimationFrame(tick);
      }
      setShown(Math.min(100, ref.current));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

function UpdatingOverlay({
  version,
  phase,
  received,
  total,
  vi,
}: {
  version: string;
  phase: UpdatePhase;
  received: number;
  total: number | null;
  vi: boolean;
}) {
  const done = phase === 'ready' || phase === 'installing';
  const target = done ? 100 : total ? Math.min(99, (received / total) * 100) : 0;
  const pct = useSmoothPercent(target);
  const reached = done && pct >= 99.5;

  const title = phase === 'installing' ? (vi ? 'Đang cài đặt' : 'Installing') : reached ? (vi ? 'Đã tải xong' : 'Downloaded') : vi ? 'Đang tải' : 'Downloading';
  const detail =
    phase === 'installing'
      ? vi
        ? 'Đang cài bản mới — app sẽ tự mở lại sau vài giây…'
        : 'Installing — the app will reopen in a few seconds…'
      : reached
        ? vi
          ? 'Chuẩn bị cài đặt…'
          : 'Preparing to install…'
        : received > 0
          ? `${formatBytes(received)}${total ? ' / ' + formatBytes(total) : ''}`
          : vi
            ? 'Đang kết nối máy chủ…'
            : 'Connecting…';

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-bg/90 backdrop-blur-md">
      <div className="flex w-[420px] animate-pop-in flex-col items-center rounded-[28px] border border-line bg-surface px-10 pb-9 pt-7 text-center shadow-pop">
        <img src={reached ? mascotSuccess : mascotUpdate} alt="" className="h-36 w-36 animate-float" draggable={false} />
        <div className="mt-2 font-display text-2xl font-extrabold">
          {vi ? 'Đang cập nhật lên' : 'Updating to'} <span className="text-brand">v{version}</span>
        </div>
        <div className="mt-1 text-[13px] text-muted">{vi ? 'Vui lòng không tắt máy trong lúc này' : 'Please keep your PC on'}</div>

        <div className="mt-6 w-full">
          <div className="mb-1.5 flex items-end justify-between text-[13px]">
            <span className="flex items-center gap-1.5 font-semibold">
              {reached && <CircleCheck className="h-4 w-4 text-ok" />}
              {title}
            </span>
            <span className="font-display text-lg font-extrabold tabular-nums text-brand">{Math.round(pct)}%</span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FBAE2C] to-[#F59E8B]"
              style={{ width: `${Math.max(3, pct)}%` }}
            />
            {!reached && (
              <div className="absolute inset-y-0 left-0 w-1/3 animate-slide bg-gradient-to-r from-transparent via-white/60 to-transparent" />
            )}
          </div>
          <div className="mt-2 text-xs text-muted">{detail}</div>
        </div>
      </div>
    </div>
  );
}

/** Hộp thoại hiện 1 lần sau khi app tự mở lại với phiên bản mới. */
export function JustUpdatedDialog() {
  const { justUpdated, closeJustUpdated } = useAppUpdate();
  const vi = useStore((s) => s.settings.language) !== 'en';
  if (!justUpdated) return null;
  return (
    <Modal open onClose={closeJustUpdated} width={420}>
      <div className="flex flex-col items-center text-center">
        <img src={mascotSuccess} alt="" className="h-36 w-36" draggable={false} />
        <h2 className="mt-1 font-display text-2xl font-extrabold">
          🎉 {vi ? 'Cập nhật thành công!' : 'Update complete!'}
        </h2>
        <div className="mt-2 flex items-center gap-1.5 text-sm">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-muted">v{justUpdated.from}</span>
          <ArrowRight className="h-3.5 w-3.5 text-muted" />
          <span className="rounded-full bg-brand px-2 py-0.5 font-bold text-[#3A1D16]">v{justUpdated.to}</span>
        </div>
        <p className="mt-3 text-sm text-muted">
          {vi ? 'SOGE Multi App đã lên phiên bản mới nhất.' : 'SOGE Multi App is now up to date.'}
        </p>
        <button className="btn-primary mt-6 w-full" onClick={closeJustUpdated}>
          {vi ? 'Tuyệt vời!' : 'Great!'}
        </button>
      </div>
    </Modal>
  );
}
