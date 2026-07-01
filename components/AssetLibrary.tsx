"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Asset,
  AssetType,
  CategoryPanel,
  buildPanelsFromCategories,
  listCollectionIds,
  listLibraryCategories,
  removeFromCollection,
  saveToCollection,
  searchAssets,
  TYPE_LABELS,
  TYPE_ORDER,
} from "@/lib/assets";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";

// TYPE_ORDER 用于校验 URL 里的 type 合法性（左侧栏分区驱动）。

const VALID_TYPES = new Set<AssetType>(TYPE_ORDER);

function normType(t: string | null): AssetType {
  return t && VALID_TYPES.has(t as AssetType) ? (t as AssetType) : "image";
}

export function AssetLibrary() {
  const search = useSearchParams();
  // 左侧栏「素材类型」是唯一事实源：?type= 决定当前类型；?cat= 可指定该类型下的一级目录。
  const urlType = normType(search.get("type"));
  const urlCat = search.get("cat");

  // 当前类型的一级目录面板。首项恒为「全部」(key="")；其后是**该类型在 OSS 里真实拥有
  // 的目录**（下方 effect 从后端 library/categories 拉取 + 手写配置叠加）。默认选「全部」。
  const allPanelFor = (t: AssetType): CategoryPanel => ({
    key: "",
    label: "全部",
    icon: "",
    type: t,
    subs: [{ key: "", label: "全部" }],
  });
  const [panels, setPanels] = useState<CategoryPanel[]>(() => [allPanelFor(urlType)]);
  const [panelKey, setPanelKey] = useState<string>(() => urlCat || "");
  const [panelsExpanded, setPanelsExpanded] = useState(false);
  const [subtab, setSubtab] = useState<string>("");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [items, setItems] = useState<Asset[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<Asset | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const reqId = useRef(0);

  const LICENSE = "commercial" as const;
  const type = urlType;

  // 左栏切换素材类型（?type=）时，从后端拉该类型**真实拥有的目录**并复位子状态。
  // 面板 = 「全部」(key="") + 真实 category（DB 驱动，手写 CATEGORY_PANELS 仅作叠加配置
  // 补中文名/图标/二级 tab）。这保证：① 图片与矢量图彻底分开；② 进哪个类型只看到该类型
  // 的目录和素材；③ 每个目录都有内容（不会出现「点进去永远空」的死目录）。
  useEffect(() => {
    let alive = true;
    const allPanel = allPanelFor(urlType);
    setQuery("");
    setInput("");
    setSubtab("");
    setPanelsExpanded(false);
    setPanels([allPanel]);
    setPanelKey(urlCat || "");
    listLibraryCategories(urlType)
      .then((r) => {
        if (!alive) return;
        const dyn = buildPanelsFromCategories(urlType, r.categories || []);
        const withAll = [allPanel, ...dyn];
        setPanels(withAll);
        setPanelKey(urlCat && withAll.some((p) => p.key === urlCat) ? urlCat : "");
      })
      .catch(() => {
        /* 拉分类失败：保留「全部」占位，仍能浏览该类型全部素材 */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlType, urlCat]);

  const panel = panels.find((p) => p.key === panelKey) || panels[0] || null;

  // 登录用户的已收藏 id 集合（卡片高亮收藏态）。未登录则静默为空。
  useEffect(() => {
    let alive = true;
    listCollectionIds()
      .then((r) => {
        if (alive) setSavedIds(new Set(r.ids));
      })
      .catch(() => {
        /* 未登录 / 网络错误：保持空集合，不打扰浏览 */
      });
    return () => {
      alive = false;
    };
  }, []);

  function toggleSave(a: Asset) {
    const isSaved = savedIds.has(a.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(a.id);
      else next.add(a.id);
      return next;
    });
    const p = isSaved ? removeFromCollection(a.id) : saveToCollection(a);
    p.catch((e) => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(a.id);
        else next.delete(a.id);
        return next;
      });
      setError(e instanceof Error ? e.message : "收藏失败，请先登录");
    });
  }

  function load(opts: {
    panelKey: string;
    subtab: string;
    q: string;
    page: number;
    append: boolean;
  }) {
    const my = ++reqId.current;
    setLoading(true);
    setError("");
    if (!opts.append) setItems([]);
    searchAssets({
      q: opts.q,
      type,
      license: LICENSE,
      // 自由搜索（有 q）时不锁 category，让搜索跨当前类型；否则按目录/二级 tab 浏览。
      category: opts.q ? undefined : opts.panelKey || undefined,
      subtab: opts.q ? undefined : opts.subtab || undefined,
      page: opts.page,
      pageSize: 30,
    })
      .then((r) => {
        if (my !== reqId.current) return;
        setItems((prev) => (opts.append ? [...prev, ...r.items] : r.items));
        setHasMore(r.has_more);
        setPage(opts.page);
      })
      .catch((e) => {
        if (my !== reqId.current) return;
        setError(e instanceof Error ? e.message : "加载失败");
        if (!opts.append) setItems([]);
      })
      .finally(() => {
        if (my === reqId.current) setLoading(false);
      });
  }

  // 切类型 / 面板 / 二级 tab / 搜索词变化时重新拉取（内联取数，避免在 effect 里同步
  // 调用包裹了 setState 的 load()——满足 react-hooks/set-state-in-effect）。
  useEffect(() => {
    const my = ++reqId.current;
    setLoading(true);
    setError("");
    setItems([]);
    searchAssets({
      q: query,
      type,
      license: LICENSE,
      category: query ? undefined : panelKey || undefined,
      subtab: query ? undefined : subtab || undefined,
      page: 1,
      pageSize: 30,
    })
      .then((r) => {
        if (my !== reqId.current) return;
        setItems(r.items);
        setHasMore(r.has_more);
        setPage(1);
      })
      .catch((e) => {
        if (my !== reqId.current) return;
        setError(e instanceof Error ? e.message : "加载失败");
        setItems([]);
      })
      .finally(() => {
        if (my === reqId.current) setLoading(false);
      });
  }, [type, panelKey, subtab, query]);

  function selectPanel(p: CategoryPanel) {
    setQuery("");
    setInput("");
    setSubtab("");
    setPanelKey(p.key);
  }

  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setQuery(input.trim());
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {TYPE_LABELS[type]}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          平台自有素材（已囤到 OSS）· 免费可商用，按目录浏览或搜索。想找更多开源素材可去左侧「开源专区」。
        </p>
      </header>

      {/* 一级目录：仅展示**当前素材类型**下真实拥有的目录（图片/矢量/贴纸/字体各不相混，
          每个目录都有内容）。目录多时先展示前若干个，点「更多目录」展开。 */}
      {panels.length > 1 &&
        (() => {
          const CAP = 18;
          const overflow = panels.length > CAP + 1;
          const shown = panelsExpanded || !overflow ? panels : panels.slice(0, CAP);
          return (
            <nav className="mb-3 flex flex-wrap gap-1.5">
              {shown.map((p) => (
                <button
                  key={p.key || "all"}
                  onClick={() => selectPanel(p)}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    p.key === panelKey && !query
                      ? "bg-zinc-900 text-white"
                      : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  {p.icon && <span aria-hidden>{p.icon}</span>}
                  {p.label}
                </button>
              ))}
              {overflow && (
                <button
                  onClick={() => setPanelsExpanded((v) => !v)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-sky-600 hover:bg-sky-50"
                >
                  {panelsExpanded ? "收起" : `更多目录 (${panels.length - 1 - CAP})`}
                </button>
              )}
            </nav>
          );
        })()}

      {/* 二级目录：当前面板的 tab（仅当面板有多于「全部」一项时显示） */}
      {!query && panel && panel.subs.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3">
          {panel.subs.map((s) => (
            <button
              key={s.key || "all"}
              onClick={() => setSubtab(s.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                s.key === subtab
                  ? "bg-sky-500 text-white"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* 搜索（跨当前面板的素材 type 全文搜索） */}
      <form onSubmit={submitSearch} className="mb-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`在「${TYPE_LABELS[type]}」里搜索…`}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-600"
        >
          搜索
        </button>
        {query && (
          <button
            type="button"
            onClick={() => {
              setInput("");
              setQuery("");
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            返回目录
          </button>
        )}
      </form>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-xl border border-zinc-200 bg-white"
            >
              <div className="aspect-[4/3] w-full bg-zinc-100" />
              <div className="space-y-2 px-3 py-3">
                <div className="h-3 w-3/4 rounded bg-zinc-100" />
                <div className="h-2.5 w-1/2 rounded bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400">
          平台自有素材里暂时没有匹配内容。换个目录试试，或去左侧
          <a href="/open" className="mx-1 text-sky-600 hover:underline">开源专区</a>
          搜索更多开源素材。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              onOpen={setActive}
              saved={savedIds.has(a.id)}
              onToggleSave={toggleSave}
            />
          ))}
        </div>
      )}

      {loading && items.length > 0 && (
        <div className="py-8 text-center text-sm text-zinc-400">加载中…</div>
      )}

      {!loading && hasMore && items.length > 0 && (
        <div className="mt-6 text-center">
          <button
            onClick={() => load({ panelKey, subtab, q: query, page: page + 1, append: true })}
            className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            加载更多
          </button>
        </div>
      )}

      {active && (
        <AssetDetail
          asset={active}
          onClose={() => setActive(null)}
          saved={savedIds.has(active.id)}
          onToggleSave={toggleSave}
        />
      )}
    </div>
  );
}
