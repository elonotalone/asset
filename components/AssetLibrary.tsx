"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Asset,
  AssetType,
  CategoryPanel,
  CategoryPreview,
  buildPanelsFromCategories,
  listCollectionIds,
  listLibraryCategories,
  previewCategories,
  removeFromCollection,
  saveToCollection,
  searchAssets,
  TYPE_LABELS,
  TYPE_ORDER,
} from "@/lib/assets";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";

// 左侧栏「素材类型」是唯一事实源：?type= 决定当前类型，?cat= 可直达该类型下某目录。
const VALID_TYPES = new Set<AssetType>(TYPE_ORDER);

function normType(t: string | null): AssetType {
  return t && VALID_TYPES.has(t as AssetType) ? (t as AssetType) : "image";
}

// 分区首页每个目录预览多少张（一行铺满，稿定/Foco 风格）。
const PREVIEW_PER_ROW = 6;

export function AssetLibrary() {
  const search = useSearchParams();
  const urlType = normType(search.get("type"));
  const urlCat = search.get("cat");

  const allPanelFor = (t: AssetType): CategoryPanel => ({
    key: "",
    label: "全部",
    icon: "",
    type: t,
    subs: [{ key: "", label: "全部" }],
  });

  // 该类型真实拥有的一级目录面板（首项恒为「全部」占位，仅用于兜底）。
  const [panels, setPanels] = useState<CategoryPanel[]>(() => [allPanelFor(urlType)]);
  // 当前进入的目录 key（""=分区首页，非空=进入该目录看完整网格）。
  const [panelKey, setPanelKey] = useState<string>(() => urlCat || "");
  const [subtab, setSubtab] = useState<string>("");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");

  // 分区首页数据：每个目录一行预览。
  const [previews, setPreviews] = useState<CategoryPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);

  // 目录网格 / 搜索网格共用的列表状态。
  const [items, setItems] = useState<Asset[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<Asset | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const reqId = useRef(0);
  const previewReqId = useRef(0);

  const LICENSE = "commercial" as const;
  const type = urlType;

  // 三态：分区首页 / 目录网格 / 搜索网格。
  const mode: "browse" | "category" | "search" = query
    ? "search"
    : panelKey
      ? "category"
      : "browse";

  const panel = useMemo(
    () => panels.find((p) => p.key === panelKey) || null,
    [panels, panelKey],
  );

  // 切类型（?type=）时：拉该类型真实目录 → 复位子状态。
  useEffect(() => {
    let alive = true;
    const allPanel = allPanelFor(urlType);
    setQuery("");
    setInput("");
    setSubtab("");
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
        /* 拉分类失败：保留「全部」占位 */
      });
    return () => {
      alive = false;
    };
  }, [urlType, urlCat]);

  // 登录用户已收藏 id（卡片高亮）。未登录静默为空。
  useEffect(() => {
    let alive = true;
    listCollectionIds()
      .then((r) => {
        if (alive) setSavedIds(new Set(r.ids));
      })
      .catch(() => {
        /* 未登录 / 网络错误：保持空集合 */
      });
    return () => {
      alive = false;
    };
  }, []);

  // 分区首页预览：对该类型的每个真实目录并发取一行样本（仅 browse 态、拿到目录后）。
  const browseCategoryKeys = useMemo(
    () => panels.filter((p) => p.key).map((p) => p.key),
    [panels],
  );
  useEffect(() => {
    if (mode !== "browse" || browseCategoryKeys.length === 0) {
      setPreviewLoading(false);
      return;
    }
    const my = ++previewReqId.current;
    setPreviewLoading(true);
    previewCategories({
      type,
      categories: browseCategoryKeys,
      license: LICENSE,
      perCategory: PREVIEW_PER_ROW,
    })
      .then((r) => {
        if (my !== previewReqId.current) return;
        setPreviews(r);
      })
      .catch(() => {
        if (my !== previewReqId.current) return;
        setPreviews([]);
      })
      .finally(() => {
        if (my === previewReqId.current) setPreviewLoading(false);
      });
  }, [type, mode, browseCategoryKeys]);

  // 目录网格 / 搜索网格取数（browse 态不取，用预览代替）。
  useEffect(() => {
    if (mode === "browse") {
      setItems([]);
      return;
    }
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
  }, [type, panelKey, subtab, query, mode]);

  function loadMore() {
    const my = ++reqId.current;
    const next = page + 1;
    setLoading(true);
    searchAssets({
      q: query,
      type,
      license: LICENSE,
      category: query ? undefined : panelKey || undefined,
      subtab: query ? undefined : subtab || undefined,
      page: next,
      pageSize: 30,
    })
      .then((r) => {
        if (my !== reqId.current) return;
        setItems((prev) => [...prev, ...r.items]);
        setHasMore(r.has_more);
        setPage(next);
      })
      .catch((e) => {
        if (my !== reqId.current) return;
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (my === reqId.current) setLoading(false);
      });
  }

  function openPanel(key: string) {
    setQuery("");
    setInput("");
    setSubtab("");
    setPanelKey(key);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function backToBrowse() {
    setQuery("");
    setInput("");
    setSubtab("");
    setPanelKey("");
  }

  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setQuery(input.trim());
  }

  const panelLabel = (key: string) =>
    panels.find((p) => p.key === key)?.label || key;

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

  // 快捷 chips：该类型前若干个真实目录（点击直达目录网格）。稿定/Foco 顶部彩色 chips。
  const quickChips = useMemo(
    () => panels.filter((p) => p.key).slice(0, 12),
    [panels],
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-zinc-900">{TYPE_LABELS[type]}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          平台自有素材（已囤到 OSS）· 免费可商用，按目录浏览或搜索。想找更多开源素材可去左侧「开源专区」。
        </p>
      </header>

      {/* 搜索框（所有态常驻） */}
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
            onClick={backToBrowse}
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            返回
          </button>
        )}
      </form>

      {/* 快捷筛选 chips（仅分区首页显示，点击直达目录） */}
      {mode === "browse" && quickChips.length > 0 && (
        <nav className="mb-6 flex flex-wrap gap-2">
          {quickChips.map((p) => (
            <button
              key={p.key}
              onClick={() => openPanel(p.key)}
              className="flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-sky-50 hover:text-sky-700 hover:ring-sky-200"
            >
              {p.icon && <span aria-hidden>{p.icon}</span>}
              {p.label}
            </button>
          ))}
        </nav>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* ------- 分区首页：每个目录一行预览 + 查看全部 ------- */}
      {mode === "browse" &&
        (previewLoading && previews.length === 0 ? (
          <div className="space-y-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="mb-3 h-5 w-24 animate-pulse rounded bg-zinc-100" />
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {Array.from({ length: PREVIEW_PER_ROW }).map((__, j) => (
                    <div
                      key={j}
                      className="aspect-square animate-pulse rounded-xl border border-zinc-200 bg-zinc-100"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : previews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400">
            平台自有素材里暂时没有该类型的内容。去左侧
            <a href="/open" className="mx-1 text-sky-600 hover:underline">
              开源专区
            </a>
            搜索更多开源素材。
          </div>
        ) : (
          <div className="space-y-8">
            {previews.map((pv) => {
              const cfg = panels.find((p) => p.key === pv.key);
              return (
                <section key={pv.key}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="flex items-center gap-1.5 text-base font-semibold text-zinc-900">
                      {cfg?.icon && <span aria-hidden>{cfg.icon}</span>}
                      {panelLabel(pv.key)}
                    </h2>
                    <button
                      onClick={() => openPanel(pv.key)}
                      className="text-sm font-medium text-zinc-400 transition hover:text-sky-600"
                    >
                      查看全部 →
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                    {pv.items.slice(0, PREVIEW_PER_ROW).map((a) => (
                      <AssetCard
                        key={a.id}
                        asset={a}
                        onOpen={setActive}
                        saved={savedIds.has(a.id)}
                        onToggleSave={toggleSave}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ))}

      {/* ------- 目录网格 / 搜索网格 ------- */}
      {mode !== "browse" && (
        <>
          {/* 目录态：返回 + 目录名 + 二级 tab */}
          {mode === "category" && (
            <div className="mb-4">
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={backToBrowse}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
                >
                  ← 全部目录
                </button>
                <h2 className="flex items-center gap-1.5 text-lg font-semibold text-zinc-900">
                  {panel?.icon && <span aria-hidden>{panel.icon}</span>}
                  {panelLabel(panelKey)}
                </h2>
              </div>
              {panel && panel.subs.length > 1 && (
                <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3">
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
            </div>
          )}

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
              没有匹配内容。换个目录试试，或去左侧
              <a href="/open" className="mx-1 text-sky-600 hover:underline">
                开源专区
              </a>
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
                onClick={loadMore}
                className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                加载更多
              </button>
            </div>
          )}
        </>
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
