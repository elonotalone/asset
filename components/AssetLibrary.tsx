"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Asset,
  AssetType,
  LicenseFilter,
  searchAssets,
  TYPE_LABELS,
  TYPE_ORDER,
} from "@/lib/assets";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";

const LICENSE_OPTIONS: { value: LicenseFilter; label: string; hint: string }[] = [
  { value: "commercial", label: "可商用", hint: "默认：只看能用于商业作品的素材" },
  { value: "modify", label: "可商用 + 可改编", hint: "进一步排除「禁止改编」(ND) 的素材" },
  { value: "any", label: "全部", hint: "包含仅非商用 (NC) 的素材" },
];

// Curated quick searches per type, to give an empty-state something to browse.
const SUGGESTIONS: Record<AssetType, string[]> = {
  image: ["海洋", "城市夜景", "商务", "自然风光", "科技"],
  video: ["海浪", "城市", "云", "粒子", "延时"],
  music: ["happy", "epic", "relax", "corporate", "ambient"],
  audio: ["rain", "click", "whoosh", "notification", "applause"],
  "3d": ["chair", "car", "tree", "robot", "lamp"],
  vector: ["icon", "logo", "arrow", "pattern", "flat"],
};

export function AssetLibrary() {
  const [type, setType] = useState<AssetType>("image");
  const [license, setLicense] = useState<LicenseFilter>("commercial");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [items, setItems] = useState<Asset[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<Asset | null>(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (opts: { type: AssetType; license: LicenseFilter; q: string; page: number; append: boolean }) => {
      const my = ++reqId.current;
      setLoading(true);
      setError("");
      try {
        const r = await searchAssets({
          q: opts.q,
          type: opts.type,
          license: opts.license,
          page: opts.page,
          pageSize: 30,
        });
        if (my !== reqId.current) return; // a newer request superseded this one
        setItems((prev) => (opts.append ? [...prev, ...r.items] : r.items));
        setHasMore(r.has_more);
        setPage(opts.page);
      } catch (e) {
        if (my !== reqId.current) return;
        setError(e instanceof Error ? e.message : "加载失败");
        if (!opts.append) setItems([]);
      } finally {
        if (my === reqId.current) setLoading(false);
      }
    },
    [],
  );

  // Reload whenever type / license / query changes.
  useEffect(() => {
    void load({ type, license, q: query, page: 1, append: false });
  }, [type, license, query, load]);

  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setQuery(input.trim());
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-900">素材库</h1>
        <p className="mt-1 text-sm text-zinc-500">
          免费 · 开源授权的图片 / 视频 / 音乐 / 音效 / 3D 素材，浏览后可直接拿去创作。默认只展示可商用素材。
        </p>
      </header>

      {/* Search */}
      <form onSubmit={submitSearch} className="mb-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`搜索${TYPE_LABELS[type]}…`}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        />
        <button type="submit" className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-600">
          搜索
        </button>
      </form>

      {/* Type tabs */}
      <div className="mb-3 flex flex-wrap gap-2">
        {TYPE_ORDER.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              t === type
                ? "bg-sky-500 text-white"
                : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* License filter + suggestions */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white p-1">
          {LICENSE_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setLicense(o.value)}
              title={o.hint}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                o.value === license ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS[type].map((s) => (
            <button
              key={s}
              onClick={() => {
                setInput(s);
                setQuery(s);
              }}
              className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 hover:border-sky-300 hover:text-sky-600"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {/* Grid */}
      {items.length === 0 && !loading && !error ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400">
          没有找到符合条件的素材，换个关键词或放宽授权过滤试试。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => (
            <AssetCard key={a.id} asset={a} onOpen={setActive} />
          ))}
        </div>
      )}

      {loading && (
        <div className="py-8 text-center text-sm text-zinc-400">加载中…</div>
      )}

      {!loading && hasMore && items.length > 0 && (
        <div className="mt-6 text-center">
          <button
            onClick={() => load({ type, license, q: query, page: page + 1, append: true })}
            className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            加载更多
          </button>
        </div>
      )}

      {active && <AssetDetail asset={active} onClose={() => setActive(null)} />}
    </div>
  );
}
