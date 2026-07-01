"use client";

import { useEffect, useRef, useState } from "react";
import {
  Asset,
  listCollectionIds,
  listSeries,
  removeFromCollection,
  saveToCollection,
  searchAssets,
  Series,
} from "@/lib/assets";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";

// 「成套素材」专区——一批风格统一、可整套浏览的开源素材（来自 svgrepo 同一 data_pack，
// 每套均已人工逐张过目）。列表页展示成套封面卡片；点开进整套（series_id 过滤）。
// 这些素材已囤到平台 OSS，属于自有库；与「开源专区」（实时上游）不同。

function CoverCollage({ covers }: { covers: string[] }) {
  const four = covers.slice(0, 4);
  while (four.length < 4) four.push("");
  return (
    <div className="grid aspect-[4/3] w-full grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-t-xl bg-zinc-100">
      {four.map((c, i) =>
        c ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={c}
            alt=""
            loading="lazy"
            className="h-full w-full bg-white object-contain p-1"
          />
        ) : (
          <div key={i} className="h-full w-full bg-zinc-50" />
        ),
      )}
    </div>
  );
}

export function SeriesZone() {
  const [series, setSeries] = useState<Series[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");

  // 打开的整套
  const [openSeries, setOpenSeries] = useState<Series | null>(null);
  const [items, setItems] = useState<Asset[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [active, setActive] = useState<Asset | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const reqId = useRef(0);

  useEffect(() => {
    let alive = true;
    listSeries()
      .then((r) => {
        if (alive) setSeries(r.series || []);
      })
      .catch((e) => {
        if (alive) setListError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (alive) setLoadingList(false);
      });
    listCollectionIds()
      .then((r) => alive && setSavedIds(new Set(r.ids)))
      .catch(() => {
        /* 未登录：保持空集 */
      });
    return () => {
      alive = false;
    };
  }, []);

  function openOne(s: Series) {
    setOpenSeries(s);
    setItems([]);
    setPage(1);
    const my = ++reqId.current;
    setLoadingItems(true);
    searchAssets({ q: "", type: s.type, seriesId: s.series_id, page: 1, pageSize: 60 })
      .then((r) => {
        if (my !== reqId.current) return;
        setItems(r.items);
        setHasMore(r.has_more);
      })
      .finally(() => {
        if (my === reqId.current) setLoadingItems(false);
      });
  }

  function loadMore() {
    if (!openSeries) return;
    const my = ++reqId.current;
    const next = page + 1;
    setLoadingItems(true);
    searchAssets({ q: "", type: openSeries.type, seriesId: openSeries.series_id, page: next, pageSize: 60 })
      .then((r) => {
        if (my !== reqId.current) return;
        setItems((prev) => [...prev, ...r.items]);
        setHasMore(r.has_more);
        setPage(next);
      })
      .finally(() => {
        if (my === reqId.current) setLoadingItems(false);
      });
  }

  function toggleSave(a: Asset) {
    const isSaved = savedIds.has(a.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(a.id);
      else next.add(a.id);
      return next;
    });
    const p = isSaved ? removeFromCollection(a.id) : saveToCollection(a);
    p.catch(() => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(a.id);
        else next.delete(a.id);
        return next;
      });
    });
  }

  // —— 整套详情视图 ——
  if (openSeries) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
        <button
          onClick={() => {
            setOpenSeries(null);
            setItems([]);
          }}
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← 返回全部成套
        </button>
        <header className="mb-5">
          <h1 className="text-2xl font-semibold text-zinc-900">{openSeries.series_name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            共 {openSeries.count} 件 · 风格统一的整套开源素材，可整套取用
          </p>
        </header>

        {loadingItems && items.length === 0 ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-xl bg-zinc-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
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

        {loadingItems && items.length > 0 && (
          <div className="py-8 text-center text-sm text-zinc-400">加载中…</div>
        )}
        {!loadingItems && hasMore && (
          <div className="mt-6 text-center">
            <button
              onClick={loadMore}
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

  // —— 成套列表视图 ——
  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-900">成套素材</h1>
        <p className="mt-1 text-sm text-zinc-500">
          风格统一、成组配套的开源素材集（每套均已人工筛选审阅）。点开任意一套，整套风格一致，直接取用不违和。
        </p>
      </header>

      {listError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {listError}
        </div>
      )}

      {loadingList ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="aspect-[4/3] w-full animate-pulse bg-zinc-100" />
              <div className="px-3 py-3">
                <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      ) : series.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400">
          暂无成套素材。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {series.map((s) => (
            <button
              key={s.series_id}
              onClick={() => openOne(s)}
              className="group overflow-hidden rounded-xl border border-zinc-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
            >
              <CoverCollage covers={s.covers} />
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="truncate text-sm font-medium text-zinc-800">
                  {s.series_name}
                </span>
                <span className="ml-2 shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                  {s.count}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
