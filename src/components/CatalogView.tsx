import bannerFree from '../assets/img/banner-free.webp';
import bannerGames from '../assets/img/banner-games.webp';
import bannerLicensed from '../assets/img/banner-licensed.webp';
import mascotEmpty from '../assets/img/mascot-empty.webp';
import { matchesSearch } from '../lib/format';
import { useStore } from '../lib/store';
import type { TabId } from '../lib/types';
import { AppCard } from './AppCard';
import { CategoryIcon } from './ui';

const BANNERS: Record<TabId, string> = { free: bannerFree, licensed: bannerLicensed, games: bannerGames };
const SUB = { free: 'tabFreeSub', licensed: 'tabLicensedSub', games: 'tabGamesSub' } as const;

export function CatalogView({ tab }: { tab: TabId }) {
  const { catalog, settings, category, setCategory, search, t } = useStore();
  const lang = settings.language;
  if (!catalog) return null;
  const tabDef = catalog.tabs.find((x) => x.id === tab)!;
  const cats = catalog.categories.filter((c) => c.tab === tab);
  const activeCat = category[tab] ?? 'all';
  const inTab = catalog.apps.filter((a) => a.tab === tab);
  const apps = inTab.filter((a) => (activeCat === 'all' || a.category === activeCat) && matchesSearch(a, search));
  const searching = search.trim().length > 0;

  // Khi đang lọc "Tất cả": nhóm theo danh mục. Khi tìm kiếm hoặc chọn 1 danh mục: lưới phẳng.
  const groups =
    activeCat === 'all' && !searching
      ? cats.map((c) => ({ cat: c, apps: apps.filter((a) => a.category === c.id) })).filter((g) => g.apps.length)
      : [{ cat: null, apps }];

  return (
    <div className="px-8 pb-28">
      <section className="relative mb-6 h-[168px] overflow-hidden rounded-[28px] border border-line bg-[#F6EFE9]">
        <img src={BANNERS[tab]} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover object-right" />
        <div className="relative flex h-full flex-col justify-center pl-9 text-[#3A1D16]">
          <h1 className="font-display text-[38px] font-extrabold leading-none tracking-tight">{tabDef.name[lang]}</h1>
          <p className="mt-2 max-w-[440px] text-[14px] font-medium text-[#3A1D16]/70">{t(SUB[tab])}</p>
          <div className="mt-3 flex gap-2">
            <span className="badge bg-[#3A1D16] px-2.5 py-1 text-[12px] text-[#F6EFE9]">
              {inTab.length} {t('apps')}
            </span>
            <span className="badge bg-white/70 px-2.5 py-1 text-[12px] text-[#3A1D16]/80">
              {cats.length} {lang === 'vi' ? 'danh mục' : 'categories'}
            </span>
          </div>
        </div>
      </section>

      <div className="no-scrollbar sticky top-0 z-20 -mx-8 mb-5 flex gap-2 overflow-x-auto bg-bg/85 px-8 py-2 backdrop-blur-md">
        <button className={`chip ${activeCat === 'all' ? 'chip-active' : ''}`} onClick={() => setCategory('all')}>
          <CategoryIcon name="all" className="h-3.5 w-3.5" />
          {t('all')}
        </button>
        {cats.map((c) => (
          <button key={c.id} className={`chip ${activeCat === c.id ? 'chip-active' : ''}`} onClick={() => setCategory(c.id)}>
            <CategoryIcon name={c.icon} className="h-3.5 w-3.5" />
            {c.name[lang]}
            <span className="opacity-60">{inTab.filter((a) => a.category === c.id).length}</span>
          </button>
        ))}
      </div>

      {apps.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <img src={mascotEmpty} alt="" className="h-44 w-44 animate-float" draggable={false} />
          <h3 className="mt-2 font-display text-2xl font-bold">{t('emptyTitle')}</h3>
          <p className="mt-1 text-sm text-muted">{t('emptyText')}</p>
        </div>
      ) : (
        groups.map((g, gi) => (
          <section key={g.cat?.id ?? 'flat'} className={gi > 0 ? 'mt-8' : ''}>
            {g.cat && (
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-soft text-[#9a5b00] dark:text-brand">
                  <CategoryIcon name={g.cat.icon} className="h-4 w-4" />
                </span>
                <h2 className="font-display text-xl font-bold">{g.cat.name[lang]}</h2>
                <span className="text-sm font-semibold text-muted">{g.apps.length}</span>
              </div>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-4">
              {g.apps.map((a, i) => (
                <AppCard key={a.id} app={a} index={i} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
