import {
  Clapperboard,
  Code2,
  Cpu,
  Download,
  FileText,
  Flag,
  Gamepad2,
  Globe,
  Keyboard,
  LayoutGrid,
  MessageCircle,
  Palette,
  Shield,
  Trophy,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  all: LayoutGrid,
  globe: Globe,
  keyboard: Keyboard,
  'message-circle': MessageCircle,
  'file-text': FileText,
  code: Code2,
  wrench: Wrench,
  clapperboard: Clapperboard,
  cpu: Cpu,
  download: Download,
  palette: Palette,
  shield: Shield,
  gamepad: Gamepad2,
  flag: Flag,
  trophy: Trophy,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CATEGORY_ICONS[name] ?? LayoutGrid;
  return <Icon className={className} strokeWidth={2.2} />;
}

const PALETTE = ['#FBAE2C', '#F59E8B', '#7CB9E8', '#8BD3A6', '#C3A6F0', '#F2C14E', '#E88AB6'];

/** Icon phần mềm: icon đóng gói sẵn → icon trên GitHub → chữ cái đầu. */
export function AppIcon({ id, name, size = 48 }: { id: string; name: string; size?: number }) {
  const sources = [`/icons/${id}.png`, `https://raw.githubusercontent.com/gentapham/soge_multi_app/main/public/icons/${id}.png`];
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [id]);
  const color = PALETTE[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-[14px] border border-line bg-surface-2"
      style={{ width: size, height: size }}
    >
      {idx < sources.length ? (
        <img
          src={sources[idx]}
          alt=""
          draggable={false}
          className="object-contain"
          style={{ width: size * 0.62, height: size * 0.62 }}
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        <span className="font-display text-xl font-bold text-[#3A1D16]" style={{ background: color, width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function Modal({ open, onClose, children, width = 520 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1a0f0b]/45 p-6 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        className="relative w-full animate-pop-in rounded-3xl border border-line bg-surface p-7 shadow-pop"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="btn-ghost absolute right-3 top-3 !p-2" aria-label="close">
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ value, indeterminate }: { value: number; indeterminate?: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line">
      <div
        className={`h-full rounded-full bg-brand transition-[width] duration-300 ${indeterminate ? 'w-full animate-stripes' : ''}`}
        style={
          indeterminate
            ? {
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgb(255 255 255 / .35) 0 7px, transparent 7px 14px)',
                backgroundSize: '28px 100%',
              }
            : { width: `${Math.max(2, Math.min(100, value))}%` }
        }
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
