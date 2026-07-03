"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUI } from "@oceanleo/ui/i18n";
import {
  Asset,
  AssetType,
  listCollectionIds,
  OPEN_SOURCE_TYPES,
  OPEN_SOURCE_TYPE_LABELS,
  removeFromCollection,
  saveToCollection,
  searchOpenSource,
} from "@/lib/assets";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";

// 「开源专区」——**唯一**能搜索到我们 OSS 之外内容的入口。直查实时上游开源素材网关
// （openverse/pexels/pixabay/polyhaven/freesound/jamendo…），只展示可商用授权的结果。
// 与其他左栏栏目（只查平台自有 OSS 素材）严格区分：这里的素材是「现搜现取」的开源库，
// 不在我们的自有库里。

function normOpenType(t: string | null): AssetType {
  return t && OPEN_SOURCE_TYPES.includes(t as AssetType)
    ? (t as AssetType)
    : "image";
}

export function OpenZone() {
  const tt = useUI();
  const search = useSearchParams();
  const [type, setType] = useState<AssetType>(() => normOpenType(search.get("type")));
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

  // 切类型或提交搜索时重新拉取上游。开源专区默认不预搜——空 query 时后端返回该类型的
  // 热门/精选，让用户一进来也有内容看。
  useEffect(() => {
    const my = ++reqId.current;
    setLoading(true);
    setError("");
    setItems([]);
    searchOpenSource({ q: query, type, license: LICENSE, page: 1, pageSize: 30 })
      .then((r) => {
        if (my !== reqId.current) return;
        setItems(r.items);
        setHasMore(r.has_more);
        setPage(1);
      })
      .catch((e) => {
        if (my !== reqId.current) return;
        setError(e instanceof Error ? e.message : tt("加载失败"));
        setItems([]);
      })
      .finally(() => {
        if (my === reqId.current) setLoading(false);
      });
  }, [type, query]);

  function loadMore() {
    const my = ++reqId.current;
    setLoading(true);
    setError("");
    const next = page + 1;
    searchOpenSource({ q: query, type, license: LICENSE, page: next, pageSize: 30 })
      .then((r) => {
        if (my !== reqId.current) return;
        setItems((prev) => [...prev, ...r.items]);
        setHasMore(r.has_more);
        setPage(next);
      })
      .catch((e) => {
        if (my !== reqId.current) return;
        setError(e instanceof Error ? e.message : tt("加载失败"));
      })
      .finally(() => {
        if (my === reqId.current) setLoading(false);
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
    p.catch((e) => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(a.id);
        else next.delete(a.id);
        return next;
      });
      setError(e instanceof Error ? e.message : tt("收藏失败，请先登录"));
    });
  }

  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setQuery(input.trim());
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-zinc-900">{tt("开源专区")}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {tt("实时检索全网开源可商用素材（Openverse / Pexels / Pixabay / Poly Haven / Freesound / Jamendo 等），默认只展示可商用授权。这里的素材来自开源社区，不在平台自有素材库中。")}
        </p>
      </header>

      {/* 类型切换（上游支持的类型） */}
      <nav className="mb-3 flex flex-wrap gap-1.5">
        {OPEN_SOURCE_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => {
              setType(t);
              setQuery("");
              setInput("");
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              t === type
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            {OPEN_SOURCE_TYPE_LABELS[t] ? tt(OPEN_SOURCE_TYPE_LABELS[t]) : t}
          </button>
        ))}
      </nav>

      {/* 搜索 */}
      <form onSubmit={submitSearch} className="mb-5 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tt("搜索开源「{type}」…", { type: OPEN_SOURCE_TYPE_LABELS[type] ? tt(OPEN_SOURCE_TYPE_LABELS[type]) : type })}
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
            onClick={() => {
              setInput("");
              setQuery("");
            }}
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            {tt("清空")}
          </button>
        )}
      </form>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
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
          {tt("没有找到匹配的开源素材，换个关键词或类型试试。")}
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
