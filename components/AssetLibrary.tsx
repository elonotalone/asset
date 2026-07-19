"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUI } from "@oceanleo/ui/i18n";
import { ResultCanvas, type CanvasTab } from "@oceanleo/ui/shell";
import {
  Asset,
  AssetType,
  CategoryPanel,
  CategoryPreview,
  buildPanelsFromCategories,
  listCollectionIds,
  listLibraryCategories,
  PPT_INDUSTRIES,
  previewCategories,
  removeFromCollection,
  saveToCollection,
  searchAssets,
  TYPE_LABELS,
  TYPE_ORDER,
} from "@/lib/assets";
import { ARTIFACT_CONTEXTS, MATERIALS } from "@/lib/materials";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";

// 左侧栏「素材类型」是唯一事实源：?type= 决定当前类型，?cat= 可直达该类型下某目录。
const VALID_TYPES = new Set<AssetType>(TYPE_ORDER);

function normType(t: string | null): AssetType {
  return t && VALID_TYPES.has(t as AssetType) ? (t as AssetType) : "image";
}

// 分区首页每个目录预览多少张（一行铺满，稿定/Foco 风格）。
const PREVIEW_PER_ROW = 6;
const COMMERCIAL_LICENSE = "commercial" as const;

function allPanelFor(type: AssetType): CategoryPanel {
  return {
    key: "",
    label: "全部",
    icon: "",
    type,
    subs: [{ key: "", label: "全部" }],
  };
}

type PreviewResult = {
  key: string;
  previews: CategoryPreview[];
};

type LibrarySearchResult = {
  key: string;
  items: Asset[];
  page: number;
  hasMore: boolean;
  error: string;
  loadingMore: boolean;
};

export function AssetLibrary() {
  const search = useSearchParams();
  const urlType = normType(search.get("type"));
  const urlCat = search.get("cat");
  const showContextShelf = !search.has("type") && !search.has("cat");

  // URL 里的类型/目录代表一个全新的浏览上下文；用 key 重建本地交互状态，
  // 避免在 effect 里同步串行 reset，且不会短暂混用上一类型的筛选或结果。
  return (
    <AssetLibraryContent
      key={`${urlType}\u0000${urlCat ?? ""}`}
      urlType={urlType}
      urlCat={urlCat}
      showContextShelf={showContextShelf}
    />
  );
}

function AssetLibraryContent({
  urlType,
  urlCat,
  showContextShelf,
}: {
  urlType: AssetType;
  urlCat: string | null;
  showContextShelf: boolean;
}) {
  const tt = useUI();
  const [artifactView, setArtifactView] = useState("materials");
  const loadFailedText = tt("加载失败");

  // 该类型真实拥有的一级目录面板（首项恒为「全部」占位，仅用于兜底）。
  const [panels, setPanels] = useState<CategoryPanel[]>(() => [allPanelFor(urlType)]);
  // 当前进入的目录 key（""=分区首页，非空=进入该目录看完整网格）。
  const [panelKey, setPanelKey] = useState<string>(() => urlCat || "");
  const [subtab, setSubtab] = useState<string>("");
  // PPT 专属「行业」第二筛选轴（scene_tags 里的 ind-* 键，经 subtab 参数传后端）。
  // 与风格目录（category）正交可叠加；独立 state 避免与目录二级 tab 冲突。
  const [industry, setIndustry] = useState<string>("");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");

  // 分区首页数据：每个目录一行预览。
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);

  // 目录网格 / 搜索网格共用的列表状态。
  const [searchResult, setSearchResult] = useState<LibrarySearchResult | null>(null);
  const [actionError, setActionError] = useState<{
    key: string | null;
    message: string;
  } | null>(null);
  const [active, setActive] = useState<Asset | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const reqId = useRef(0);

  const type = urlType;

  // 三态：分区首页 / 目录网格 / 搜索网格。
  // ppt 选中行业后即使没进目录也切到网格（行业本身就是一种筛选）。
  const mode: "browse" | "category" | "search" = query
    ? "search"
    : panelKey || (type === "ppt" && industry)
      ? "category"
      : "browse";

  const panel = useMemo(
    () => panels.find((p) => p.key === panelKey) || null,
    [panels, panelKey],
  );

  // URL 上下文变化会由外层 key 重建组件；这里仅异步拉取真实目录。
  useEffect(() => {
    let alive = true;
    const allPanel = allPanelFor(urlType);
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
  const previewKey =
    mode === "browse" && browseCategoryKeys.length > 0
      ? JSON.stringify([type, ...browseCategoryKeys])
      : null;
  const currentPreview =
    previewKey && previewResult?.key === previewKey ? previewResult : null;
  const previews = currentPreview?.previews ?? [];
  const previewLoading = previewKey !== null && !currentPreview;

  const searchKey =
    mode === "browse"
      ? null
      : JSON.stringify([type, panelKey, subtab, industry, query]);
  const currentSearch =
    searchKey && searchResult?.key === searchKey ? searchResult : null;
  const items = currentSearch?.items ?? [];
  const page = currentSearch?.page ?? 1;
  const hasMore = currentSearch?.hasMore ?? false;
  const loading = searchKey !== null && (!currentSearch || currentSearch.loadingMore);
  const error =
    actionError?.key === searchKey
      ? actionError.message
      : currentSearch?.error ?? "";

  useEffect(() => {
    if (!previewKey) return;
    let alive = true;
    previewCategories({
      type,
      categories: browseCategoryKeys,
      license: COMMERCIAL_LICENSE,
      perCategory: PREVIEW_PER_ROW,
    })
      .then((r) => {
        if (alive) setPreviewResult({ key: previewKey, previews: r });
      })
      .catch(() => {
        if (alive) setPreviewResult({ key: previewKey, previews: [] });
      });
    return () => {
      alive = false;
    };
  }, [type, browseCategoryKeys, previewKey]);

  // 目录网格 / 搜索网格取数（browse 态不取，用预览代替）。
  useEffect(() => {
    const my = ++reqId.current;
    if (!searchKey) return;
    let alive = true;
    searchAssets({
      q: query,
      type,
      license: COMMERCIAL_LICENSE,
      category: query ? undefined : panelKey || undefined,
      // ppt 的行业键优先（目录二级 tab 与行业互斥使用：ppt 目录都是单
      // 「全部」子 tab，subtab 恒空，行业键借道同一个后端参数）。
      subtab: query ? undefined : industry || subtab || undefined,
      page: 1,
      pageSize: 30,
    })
      .then((r) => {
        if (!alive || my !== reqId.current) return;
        setSearchResult({
          key: searchKey,
          items: r.items,
          page: 1,
          hasMore: r.has_more,
          error: "",
          loadingMore: false,
        });
      })
      .catch((e) => {
        if (!alive || my !== reqId.current) return;
        setSearchResult({
          key: searchKey,
          items: [],
          page: 1,
          hasMore: false,
          error: e instanceof Error ? e.message : loadFailedText,
          loadingMore: false,
        });
      });
    return () => {
      alive = false;
    };
  }, [type, panelKey, subtab, industry, query, searchKey, loadFailedText]);

  function loadMore() {
    if (!currentSearch || currentSearch.loadingMore || !searchKey) return;
    const my = ++reqId.current;
    const next = page + 1;
    setSearchResult((prev) =>
      prev?.key === searchKey ? { ...prev, error: "", loadingMore: true } : prev,
    );
    searchAssets({
      q: query,
      type,
      license: COMMERCIAL_LICENSE,
      category: query ? undefined : panelKey || undefined,
      subtab: query ? undefined : industry || subtab || undefined,
      page: next,
      pageSize: 30,
    })
      .then((r) => {
        if (my !== reqId.current) return;
        setSearchResult((prev) =>
          prev?.key === searchKey
            ? {
                ...prev,
                items: [...prev.items, ...r.items],
                page: next,
                hasMore: r.has_more,
                loadingMore: false,
              }
            : prev,
        );
      })
      .catch((e) => {
        if (my !== reqId.current) return;
        setSearchResult((prev) =>
          prev?.key === searchKey
            ? {
                ...prev,
                error: e instanceof Error ? e.message : loadFailedText,
                loadingMore: false,
              }
            : prev,
        );
      });
  }

  function openPanel(key: string) {
    // 进目录保留行业选择（风格 × 行业可叠加）。
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
    setIndustry("");
    setPanelKey("");
  }

  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setQuery(input.trim());
  }

  const panelLabel = (key: string) => {
    const label = panels.find((p) => p.key === key)?.label;
    return label ? tt(label) : key;
  };

  function toggleSave(a: Asset) {
    const isSaved = savedIds.has(a.id);
    setActionError(null);
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
      setActionError({
        key: searchKey,
        message: e instanceof Error ? e.message : tt("收藏失败，请先登录"),
      });
    });
  }

  // 快捷 chips：该类型前若干个真实目录（点击直达目录网格）。稿定/Foco 顶部彩色 chips。
  const quickChips = useMemo(
    () => panels.filter((p) => p.key).slice(0, 12),
    [panels],
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      {showContextShelf && (
        <section className="mb-8 rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-zinc-900">
              {tt("已接入耐久素材")}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {tt("这里只展示已有 artifact/revision 身份且通过权限校验的素材；下方旧库存保持只读，等待迁移，不会伪造耐久身份。")}
            </p>
          </div>
          <ResultCanvas
            tabs={
              [
                { id: "materials", label: tt("素材库"), content: null },
              ] as CanvasTab[]
            }
            active={artifactView}
            onChange={setArtifactView}
            materials={MATERIALS}
            accent="#0ea5e9"
            className="h-[32rem]"
            siteId="asset"
            materialContext={ARTIFACT_CONTEXTS[0]}
            showTemplate={false}
          />
        </section>
      )}
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-zinc-900">{tt(TYPE_LABELS[type])}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {tt("平台自有素材（已囤到 OSS）· 免费可商用，按目录浏览或搜索。想找更多开源素材可去左侧「开源专区」。")}
        </p>
      </header>

      {/* 搜索框（所有态常驻） */}
      <form onSubmit={submitSearch} className="mb-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tt("在「{type}」里搜索…", { type: tt(TYPE_LABELS[type]) })}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-600"
        >
          {tt("搜索")}
        </button>
        {query && (
          <button
            type="button"
            onClick={backToBrowse}
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            {tt("返回")}
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
              {tt(p.label)}
            </button>
          ))}
        </nav>
      )}

      {/* PPT 行业筛选条（第二分类轴，搜索态隐藏；与风格目录可叠加） */}
      {type === "ppt" && mode !== "search" && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-zinc-400">{tt("行业")}</span>
          {[{ key: "", label: "全部行业" }, ...PPT_INDUSTRIES].map((it) => (
            <button
              key={it.key || "all"}
              onClick={() => setIndustry(it.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                it.key === industry
                  ? "bg-sky-500 text-white"
                  : "bg-white text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-100 hover:text-zinc-800"
              }`}
            >
              {tt(it.label)}
            </button>
          ))}
        </div>
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
            {tt("平台自有素材里暂时没有该类型的内容。去左侧")}
            <a href="/open" className="mx-1 text-sky-600 hover:underline">
              {tt("开源专区")}
            </a>
            {tt("搜索更多开源素材。")}
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
                      {tt("查看全部")} →
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
                  {tt("← 全部目录")}
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
                      {tt(s.label)}
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
              {tt("没有匹配内容。换个目录试试，或去左侧")}
              <a href="/open" className="mx-1 text-sky-600 hover:underline">
                {tt("开源专区")}
              </a>
              {tt("搜索更多开源素材。")}
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
            <div className="py-8 text-center text-sm text-zinc-400">{tt("加载中…")}</div>
          )}

          {!loading && hasMore && items.length > 0 && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {tt("加载更多")}
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
