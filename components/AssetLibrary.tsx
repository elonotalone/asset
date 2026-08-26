"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUI } from "@oceanleo/ui/i18n";
import {
  Asset,
  AssetType,
  CategoryPanel,
  buildPanelsFromCategories,
  loadTypeOriginIndex,
  PPT_INDUSTRIES,
  searchAssetsInZone,
  TYPE_LABELS,
  TYPE_ORDER,
  type TypeOriginIndex,
  zoneCategories,
  zoneTotal,
} from "@/lib/assets";
import {
  defaultZone,
  hasSeriesFilter,
  normSeriesFlag,
  parseZone,
  typePageHref,
  ZONE_LABELS,
  ZONE_ORIGIN,
  zoneIsUsable,
  type MaterialOrigin,
  type TypeZone,
} from "@/lib/type-page-views";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";
import { SeriesZone } from "@/components/SeriesZone";

// 左侧栏「素材类型」是唯一事实源：?type= 决定当前类型，?cat= 可直达该类型下某目录，
// ?view= 决定看哪一个来源分区（OceanLeo 自有 / 开源专区（已入库））。
//
// 分区不是换一个组件，是**同一个素材库换一个来源**：目录清单、每个目录的件数、
// 网格、搜索全部按 origin 收窄。收窄靠 lib/assets.ts 的目录→来源索引 ——
// 目录归属读的是服务端每一行带的 origin，取数时再逐件硬过滤一遍，
// 所以「OceanLeo 自有」里不可能混进开源件。
const VALID_TYPES = new Set<AssetType>(TYPE_ORDER);

function normType(t: string | null): AssetType {
  return t && VALID_TYPES.has(t as AssetType) ? (t as AssetType) : "image";
}

// 分区首页每个目录预览多少张（一行铺满，稿定/Foco 风格）。
// 与 lib/assets.ts 的 SAMPLE_PER_CATEGORY 一致：那一批采样直接当预览行用。
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
  const urlView = search.get("view");
  const urlSeries = search.get("series");

  // 目录→来源索引：分区件数、每个分区有哪些目录、分区首页的预览行都从它来。
  // 它按类型缓存，所以顶部那排页签与这里读的是同一份，不会各说一个数。
  const [index, setIndex] = useState<TypeOriginIndex | null>(null);
  const [indexError, setIndexError] = useState(false);
  useEffect(() => {
    let alive = true;
    setIndex(null);
    setIndexError(false);
    loadTypeOriginIndex(urlType)
      .then((r) => {
        if (alive) setIndex(r);
      })
      .catch(() => {
        if (alive) setIndexError(true);
      });
    return () => {
      alive = false;
    };
  }, [urlType]);

  const zone: TypeZone =
    parseZone(urlView, urlType) ??
    (index
      ? defaultZone(urlType, {
          owned: zoneTotal(index, "first-party"),
          stocked: zoneTotal(index, "external"),
        })
      : "owned");
  const seriesOn = normSeriesFlag(urlView, urlSeries, urlType, zone);

  if (indexError) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          素材网关暂时读不到，稍后再试。
        </div>
      </div>
    );
  }
  // 分区未定（索引还没回来）时先不取数：定错了分区会白打一轮请求再全部作废。
  // `live` 由 TypePageChrome 换成 OpenZone，走不到这里。
  if (!index || zone === "live") {
    return (
      <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: PREVIEW_PER_ROW }).map((_, j) => (
            <div
              key={j}
              className="aspect-square animate-pulse rounded-xl border border-zinc-200 bg-zinc-100"
            />
          ))}
        </div>
      </div>
    );
  }

  // 类型 / 目录 / 分区都代表一个全新的浏览上下文；用 key 重建本地交互状态，
  // 避免在 effect 里同步串行 reset，且不会短暂混用上一个上下文的筛选或结果。
  return (
    <AssetLibraryContent
      key={`${urlType}\u0000${zone}\u0000${urlCat ?? ""}\u0000${seriesOn}`}
      urlType={urlType}
      urlCat={urlCat}
      zone={zone}
      origin={ZONE_ORIGIN[zone]}
      seriesOn={seriesOn}
      index={index}
    />
  );
}

function AssetLibraryContent({
  urlType,
  urlCat,
  zone,
  origin,
  seriesOn,
  index,
}: {
  urlType: AssetType;
  urlCat: string | null;
  zone: "owned" | "stocked";
  origin: MaterialOrigin;
  seriesOn: boolean;
  index: TypeOriginIndex;
}) {
  const tt = useUI();
  const loadFailedText = tt("加载失败");

  // 本分区真实拥有的一级目录面板（首项恒为「全部」占位，仅用于兜底）。
  // 目录清单来自索引里归属本分区的那些目录 —— 别的分区的目录不出现在这里。
  const zoneCats = useMemo(
    () => zoneCategories(index, origin),
    [index, origin],
  );
  const totalInZone = zoneTotal(index, origin);
  const panels = useMemo(() => {
    const dyn = buildPanelsFromCategories(
      urlType,
      zoneCats.map((c) => c.key),
    );
    return [allPanelFor(urlType), ...dyn];
  }, [urlType, zoneCats]);
  const countByCat = useMemo(
    () => new Map(zoneCats.map((c) => [c.key, c.total])),
    [zoneCats],
  );

  const [panelKey, setPanelKey] = useState<string>(() =>
    urlCat && zoneCats.some((c) => c.key === urlCat) ? urlCat : "",
  );
  const [subtab, setSubtab] = useState<string>("");
  // PPT 专属「行业」第二筛选轴（scene_tags 里的 ind-* 键，经 subtab 参数传后端）。
  // 与风格目录（category）正交可叠加；独立 state 避免与目录二级 tab 冲突。
  const [industry, setIndustry] = useState<string>("");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");

  // 目录网格 / 搜索网格共用的列表状态。
  const [searchResult, setSearchResult] = useState<LibrarySearchResult | null>(null);
  const [active, setActive] = useState<Asset | null>(null);
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

  // 分区首页的每行预览**直接用索引里的采样**，不再为预览另打一轮请求
  // （索引本来就是靠「每个目录取一小把」建起来的，那一把就是这一行）。
  const previews = useMemo(
    () =>
      zoneCats
        .map((c) => ({ key: c.key, items: c.sample.slice(0, PREVIEW_PER_ROW) }))
        .filter((p) => p.items.length > 0),
    [zoneCats],
  );

  const searchKey =
    mode === "browse"
      ? null
      : JSON.stringify([type, zone, panelKey, subtab, industry, query]);
  const currentSearch =
    searchKey && searchResult?.key === searchKey ? searchResult : null;
  const items = currentSearch?.items ?? [];
  const page = currentSearch?.page ?? 1;
  const hasMore = currentSearch?.hasMore ?? false;
  const loading = searchKey !== null && (!currentSearch || currentSearch.loadingMore);
  const error = currentSearch?.error ?? "";

  // 目录网格 / 搜索网格取数（browse 态不取，用索引的采样代替）。
  useEffect(() => {
    const my = ++reqId.current;
    if (!searchKey) return;
    let alive = true;
    searchAssetsInZone({
      index,
      type,
      origin,
      q: query,
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
  }, [
    index,
    origin,
    type,
    zone,
    panelKey,
    subtab,
    industry,
    query,
    searchKey,
    loadFailedText,
  ]);

  function loadMore() {
    if (!currentSearch || currentSearch.loadingMore || !searchKey) return;
    const my = ++reqId.current;
    const next = page + 1;
    setSearchResult((prev) =>
      prev?.key === searchKey ? { ...prev, error: "", loadingMore: true } : prev,
    );
    searchAssetsInZone({
      index,
      type,
      origin,
      q: query,
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

  // 快捷 chips：本分区前若干个真实目录（点击直达目录网格）。
  const quickChips = useMemo(
    () => panels.filter((p) => p.key).slice(0, 12),
    [panels],
  );

  const typeName = tt(TYPE_LABELS[type]);
  const otherZone = zone === "owned" ? "stocked" : "owned";
  const otherTotal = zoneTotal(
    index,
    otherZone === "owned" ? "first-party" : "external",
  );

  // 「成套」是形态不是来源，所以它不占一个分区，而是所属分区里的一个筛选。
  const seriesAvailable = hasSeriesFilter(type, zone);
  if (seriesOn && seriesAvailable) {
    return (
      <div>
        <div className="mx-auto max-w-6xl px-5 pt-6">
          <SeriesFilterBar
            type={type}
            zone={zone}
            on
            label={tt("只看成套")}
            allLabel={tt("全部（含单件）")}
          />
          <p className="pb-1 pt-2 text-xs text-zinc-500">
            {tt("成组配套、风格统一的「{type}」，整套取用不违和（每套均已人工逐件过目）。", {
              type: typeName,
            })}
          </p>
        </div>
        {/* 成套件仍然按本分区的来源逐件过滤：万一某一套的来源判错，
            结果是这一套看起来空了，而不是把开源件显示在「OceanLeo 自有」里。 */}
        <SeriesZone key={`${type}-${zone}`} lockType={type} origin={origin} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {typeName}
          <span
            className="ml-2 align-middle text-sm font-normal text-zinc-400"
            title={
              index.incomplete
                ? tt("素材网关刚才有请求没成功，实际件数只会更多，不会更少。")
                : undefined
            }
          >
            {tt(ZONE_LABELS[zone])} · {index.incomplete ? "≥" : ""}
            {totalInZone.toLocaleString("en-US")}
            {tt(" 件")}
          </span>
        </h1>
      </header>

      {seriesAvailable && (
        <div className="mb-4">
          <SeriesFilterBar
            type={type}
            zone={zone}
            on={false}
            label={tt("只看成套")}
            allLabel={tt("全部（含单件）")}
          />
        </div>
      )}

      {/* 搜索框（所有态常驻） */}
      <form onSubmit={submitSearch} className="mb-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tt("在「{zone}」的「{type}」里搜索…", {
            zone: tt(ZONE_LABELS[zone]),
            type: typeName,
          })}
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

      {/* 快捷筛选 chips（仅分区首页显示，点击直达目录）。带件数——
          操作员这次的不满就是「看不出有没有东西」，件数是最直接的回答。 */}
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
              <span className="tabular-nums text-xs text-zinc-400">
                {(countByCat.get(p.key) ?? 0).toLocaleString("en-US")}
              </span>
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
        (previews.length === 0 ? (
          <ZoneEmptyState
            type={type}
            typeName={typeName}
            zone={zone}
            otherZone={otherZone}
            otherTotal={otherTotal}
          />
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
                      <span className="tabular-nums text-xs font-normal text-zinc-400">
                        {(countByCat.get(pv.key) ?? 0).toLocaleString("en-US")}
                      </span>
                    </h2>
                    <button
                      onClick={() => openPanel(pv.key)}
                      className="text-sm font-medium text-zinc-400 transition hover:text-sky-600"
                    >
                      {tt("查看全部")} →
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                    {pv.items.map((a) => (
                      <AssetCard key={a.id} asset={a} onOpen={setActive} />
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
            <ZoneEmptyState
              type={type}
              typeName={typeName}
              zone={zone}
              otherZone={otherZone}
              otherTotal={otherTotal}
              searching={mode === "search"}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((a) => (
                <AssetCard key={a.id} asset={a} onOpen={setActive} />
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
        <AssetDetail asset={active} onClose={() => setActive(null)} />
      )}
    </div>
  );
}

/** 「只看成套 / 全部」两颗按钮。成套是形态，所以它待在所属来源分区里面。 */
function SeriesFilterBar({
  type,
  zone,
  on,
  label,
  allLabel,
}: {
  type: AssetType;
  zone: "owned" | "stocked";
  on: boolean;
  label: string;
  allLabel: string;
}) {
  const pill = "rounded-full px-3 py-1 text-xs font-medium transition";
  const activeCls = "bg-sky-500 text-white";
  const idleCls = "bg-white text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-100";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link
        href={typePageHref(type, zone)}
        scroll={false}
        className={`${pill} ${on ? idleCls : activeCls}`}
      >
        {allLabel}
      </Link>
      <Link
        href={typePageHref(type, zone, { series: true })}
        scroll={false}
        className={`${pill} ${on ? activeCls : idleCls}`}
      >
        {label}
      </Link>
    </div>
  );
}

/**
 * 空态。**分区不隐藏**，所以这块要把话说全：这一类为什么没有这一种来源的件，
 * 以及别处有没有。操作员这次不满的根源就是分不清「没货」和「页面没做」。
 */
function ZoneEmptyState({
  type,
  typeName,
  zone,
  otherZone,
  otherTotal,
  searching,
}: {
  type: AssetType;
  typeName: string;
  zone: "owned" | "stocked";
  otherZone: "owned" | "stocked";
  otherTotal: number;
  searching?: boolean;
}) {
  const tt = useUI();
  const liveUsable = zoneIsUsable(type, "live");
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center">
      <p className="text-sm text-zinc-500">
        {searching
          ? tt("「{zone}」里没有匹配的「{type}」。", {
              zone: tt(ZONE_LABELS[zone]),
              type: typeName,
            })
          : zone === "owned"
            ? tt("OceanLeo 还没有自己做过「{type}」。这一格不是没做，是这一类真的还没有自有件。", {
                type: typeName,
              })
            : tt("还没有把开源的「{type}」下载进 OceanLeo 库。这一格不是没做，是这一类还没有已入库的开源件。", {
                type: typeName,
              })}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm">
        {otherTotal > 0 && (
          <Link
            href={typePageHref(type, otherZone)}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 hover:bg-zinc-50"
          >
            {tt("去「{zone}」看 {n} 件", {
              zone: tt(ZONE_LABELS[otherZone]),
              n: otherTotal.toLocaleString("en-US"),
            })}
          </Link>
        )}
        {liveUsable && (
          <Link
            href={typePageHref(type, "live")}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 hover:bg-zinc-50"
          >
            {tt("去实时搜索全网开源「{type}」", { type: typeName })}
          </Link>
        )}
      </div>
    </div>
  );
}
