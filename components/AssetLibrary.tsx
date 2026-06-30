"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Asset,
  AssetType,
  CATEGORY_PANELS,
  CategoryPanel,
  listCollectionIds,
  panelByKey,
  removeFromCollection,
  saveToCollection,
  searchAssets,
  TYPE_LABELS,
  TYPE_ORDER,
} from "@/lib/assets";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";

// TYPE_ORDER 用于校验 URL 里的 type 合法性（左侧栏分区驱动）。

// 推荐的筛选维度：方向（横/竖/方形）——对图片/视频最常用，基于已加载结果本地过滤。
type Orientation = "all" | "landscape" | "portrait" | "square";

const ORIENTATION_OPTIONS: { value: Orientation; label: string }[] = [
  { value: "all", label: "全部方向" },
  { value: "landscape", label: "横版" },
  { value: "portrait", label: "竖版" },
  { value: "square", label: "方形" },
];

const ORIENTATION_TYPES = new Set<AssetType>(["image", "video", "vector", "sticker"]);

function orientationOf(a: Asset): Orientation {
  if (!a.width || !a.height) return "all";
  const r = a.width / a.height;
  if (r > 1.15) return "landscape";
  if (r < 0.87) return "portrait";
  return "square";
}

const VALID_TYPES = new Set<AssetType>(TYPE_ORDER);

// 第一个面板默认选中（热门），让用户一进来就看到「分类」而非空搜索框。
const DEFAULT_PANEL = CATEGORY_PANELS[0];

export function AssetLibrary() {
  const search = useSearchParams();
  // URL ?cat= 指定目录面板（优先）；否则用 ?type= 找该 type 的首个面板；都没有用默认。
  const urlCat = search.get("cat");
  const urlType = search.get("type") as AssetType | null;

  const initialPanel: CategoryPanel =
    (urlCat && panelByKey(urlCat)) ||
    (urlType && VALID_TYPES.has(urlType)
      ? CATEGORY_PANELS.find((p) => p.type === urlType) || DEFAULT_PANEL
      : DEFAULT_PANEL);

  const [panelKey, setPanelKey] = useState<string>(initialPanel.key);
  const [subtab, setSubtab] = useState<string>("");
  const [orientation, setOrientation] = useState<Orientation>("all");
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

  // 左栏分区切 ?type= / URL 带 ?cat= 时，同步成对应面板（首个该 type 面板）。
  useEffect(() => {
    if (urlCat && panelByKey(urlCat)) {
      if (urlCat !== panelKey) selectPanel(panelByKey(urlCat)!);
      return;
    }
    if (urlType && VALID_TYPES.has(urlType)) {
      const cur = panelByKey(panelKey);
      if (!cur || cur.type !== urlType) {
        const next = CATEGORY_PANELS.find((p) => p.type === urlType);
        if (next) selectPanel(next);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlType, urlCat]);

  const panel = panelByKey(panelKey) || DEFAULT_PANEL;
  const type = panel.type;
  const showOrientation = ORIENTATION_TYPES.has(type);

  // 方向筛选是已加载结果的本地过滤——瞬时、不发网络请求。
  const visible =
    !showOrientation || orientation === "all"
      ? items
      : items.filter((a) => orientationOf(a) === orientation);

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
    panel: CategoryPanel;
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
      type: opts.panel.type,
      license: LICENSE,
      // 自由搜索（有 q）时不锁 category，让搜索跨整个 type；否则按目录/二级 tab 浏览。
      category: opts.q ? undefined : opts.panel.key,
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

  // 切面板 / 二级 tab / 搜索词变化时重新拉取（内联取数，避免在 effect 里同步调用
  // 包裹了 setState 的 load()——满足 react-hooks/set-state-in-effect）。
  useEffect(() => {
    const my = ++reqId.current;
    setLoading(true);
    setError("");
    setItems([]);
    const p = panelByKey(panelKey) || DEFAULT_PANEL;
    searchAssets({
      q: query,
      type: p.type,
      license: LICENSE,
      category: query ? undefined : p.key,
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
  }, [panelKey, subtab, query]);

  function selectPanel(p: CategoryPanel) {
    setQuery("");
    setInput("");
    setSubtab("");
    setOrientation("all");
    setPanelKey(p.key);
  }

  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setQuery(input.trim());
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-zinc-900">素材库</h1>
        <p className="mt-1 text-sm text-zinc-500">
          免费 · 开源授权 + 平台自产素材，按目录浏览或搜索，可收藏到「我的素材库」或拿去创作。默认只展示可商用素材。
        </p>
      </header>

      {/* 一级目录：板块（对标稿定 23 个素材面板） */}
      <nav className="mb-3 flex flex-wrap gap-1.5">
        {CATEGORY_PANELS.map((p) => (
          <button
            key={p.key}
            onClick={() => selectPanel(p)}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              p.key === panelKey && !query
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            <span aria-hidden>{p.icon}</span>
            {p.label}
          </button>
        ))}
      </nav>

      {/* 二级目录：当前面板的 tab（仅当面板有多于「全部」一项时显示） */}
      {!query && panel.subs.length > 1 && (
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

      {/* 方向筛选（仅图片/视频/矢量/贴纸） */}
      {showOrientation && (
        <div className="mb-5 flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white p-1 w-fit">
          {ORIENTATION_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setOrientation(o.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                o.value === orientation ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

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
      ) : visible.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400">
          这个目录的素材正在补充中，换个分类或用搜索试试。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((a) => (
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
            onClick={() => load({ panel, subtab, q: query, page: page + 1, append: true })}
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
