"use client";

import { useEffect, useState } from "react";
import { useUI } from "@oceanleo/ui/i18n";
import { Asset, searchAssets } from "@/lib/assets";
import { assetFormat } from "@/lib/asset-file-meta";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";
import type { DocumentZone } from "@/lib/document-zones";

export function DocumentZoneView({ zone }: { zone: DocumentZone }) {
  const tt = useUI();
  const [items, setItems] = useState<Asset[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [active, setActive] = useState<Asset | null>(null);
  const [formats, setFormats] = useState<string[]>(zone.formats);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setItems([]);
    setTotal(null);
    setHasMore(false);
    setPage(1);
    setFormats(zone.formats);
    searchAssets({
      q: "",
      type: zone.type,
      category: zone.category,
      page: 1,
      pageSize: 24,
    })
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setTotal(typeof r.total === "number" ? r.total : r.items.length);
        setHasMore(r.has_more);
        const found = r.items
          .map((a) => assetFormat(a))
          .filter((f): f is string => Boolean(f));
        setFormats([...new Set([...zone.formats, ...found])]);
      })
      .catch(() => {
        if (!alive) return;
        // 供货链还没交付或网关暂时不可用：这一页仍然要能打开，显示「整理中」。
        setItems([]);
        setTotal(0);
        setHasMore(false);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [zone.category, zone.formats, zone.type]);

  async function loadMore() {
    const next = page + 1;
    setLoadingMore(true);
    try {
      const r = await searchAssets({
        q: "",
        type: zone.type,
        category: zone.category,
        page: next,
        pageSize: 24,
      });
      setItems((cur) => {
        const seen = new Set(cur.map((a) => a.id));
        return [...cur, ...r.items.filter((a) => !seen.has(a.id))];
      });
      setHasMore(r.has_more);
      setPage(next);
    } catch {
      /* 多翻一页失败就停在已有结果上，不把整页打成错误页 */
    } finally {
      setLoadingMore(false);
    }
  }

  const empty = !loading && items.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{tt("文档分区")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{tt(zone.title)}</h1>

        {zone.officialNumbers.length > 0 && (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                {tt("官方原文")}
              </span>
              {zone.officialNumbers.map((n) => (
                <span
                  key={n}
                  className="rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold text-sky-900 ring-1 ring-sky-200"
                >
                  {n}
                </span>
              ))}
            </div>
            {zone.officialSourceNote ? (
              <p className="mt-2 text-sm text-sky-900/80">{tt(zone.officialSourceNote)}</p>
            ) : null}
          </div>
        )}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <dt className="text-xs text-zinc-400">{tt("素材数")}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
              {loading || total == null ? "…" : total.toLocaleString("en-US")}
            </dd>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <dt className="text-xs text-zinc-400">{tt("许可来源")}</dt>
            <dd className="mt-1 font-medium text-zinc-900">{tt(zone.licenseLabel)}</dd>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <dt className="text-xs text-zinc-400">{tt("可下载格式")}</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {formats.map((f) => f.toUpperCase()).join(" · ") || tt("未标注")}
            </dd>
          </div>
        </dl>
      </header>

      {loading ? (
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
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="text-base font-medium text-zinc-800">{tt("整理中")}</p>
          <p className="mt-2 text-sm text-zinc-500">
            {tt("这一区的页面已经做好了，素材还在入库。货到了会排在这里，不会变成空白页或报错页。")}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((a) => (
              <AssetCard key={a.id} asset={a} onOpen={setActive} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {loadingMore ? tt("加载中…") : tt("加载更多")}
              </button>
            </div>
          )}
        </>
      )}

      {active && <AssetDetail asset={active} onClose={() => setActive(null)} />}
    </div>
  );
}
