"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Asset,
  AssetType,
  listCollectionIds,
  removeFromCollection,
  saveToCollection,
  searchAssets,
  TYPE_LABELS,
  TYPE_ORDER,
} from "@/lib/assets";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";

// TYPE_ORDER 用于校验 URL 里的 type 合法性（左侧栏分区驱动）。

// 推荐的筛选维度（取代原「可商用 / 可商用+可改编 / 全部」授权三选一——授权口径已
// 默认只展示可商用素材，用户不必再手动切）。改用对「挑图」真正有用、且基于已加载
// 数据即可瞬时本地过滤的维度：
//   · 方向（横/竖/方形）——对图片/视频最常用，基于 width/height 本地判定。
// 其余类型（音乐/音效/3D/字体/PPT…）没有方向概念，则不显示该筛选条。
type Orientation = "all" | "landscape" | "portrait" | "square";

const ORIENTATION_OPTIONS: { value: Orientation; label: string }[] = [
  { value: "all", label: "全部方向" },
  { value: "landscape", label: "横版" },
  { value: "portrait", label: "竖版" },
  { value: "square", label: "方形" },
];

// 仅这些类型有「方向」语义。
const ORIENTATION_TYPES = new Set<AssetType>(["image", "video", "vector", "sticker"]);

function orientationOf(a: Asset): Orientation {
  if (!a.width || !a.height) return "all";
  const r = a.width / a.height;
  if (r > 1.15) return "landscape";
  if (r < 0.87) return "portrait";
  return "square";
}

// Curated quick searches per type, to give an empty-state something to browse.
const SUGGESTIONS: Record<AssetType, string[]> = {
  image: ["海洋", "城市夜景", "商务", "自然风光", "科技"],
  video: ["海浪", "城市", "云", "粒子", "延时"],
  music: ["happy", "epic", "relax", "corporate", "ambient"],
  audio: ["rain", "click", "whoosh", "notification", "applause"],
  "3d": ["chair", "car", "tree", "robot", "lamp"],
  vector: ["icon", "logo", "arrow", "pattern", "flat"],
  sticker: ["花朵", "边框", "爱心", "庆祝", "手绘"],
  font: ["黑体", "宋体", "手写", "书法", "标题"],
  ppt: ["商务", "教育", "极简", "图表", "总结汇报"],
};

const VALID_TYPES = new Set<AssetType>(TYPE_ORDER);

export function AssetLibrary() {
  // 当前类别由左侧栏（URL ?type=）驱动；缺省/非法值回落到「图片」。
  const search = useSearchParams();
  const urlType = search.get("type") as AssetType | null;
  const type: AssetType = urlType && VALID_TYPES.has(urlType) ? urlType : "image";

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

  // 授权口径固定为「只看可商用」（默认且唯一，不再让用户手切）。
  const LICENSE = "commercial" as const;

  const showOrientation = ORIENTATION_TYPES.has(type);

  // 方向筛选是已加载结果的「本地」过滤——瞬时、不发网络请求。（React Compiler 会
  // 自动 memo，无需手写 useMemo。）
  const visible =
    !showOrientation || orientation === "all"
      ? items
      : items.filter((a) => orientationOf(a) === orientation);

  // 登录用户的已收藏 id 集合（用于卡片高亮收藏态）。未登录则静默为空。
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
    // 乐观更新
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(a.id);
      else next.add(a.id);
      return next;
    });
    const p = isSaved ? removeFromCollection(a.id) : saveToCollection(a);
    p.catch((e) => {
      // 回滚 + 提示（多数失败=未登录）
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(a.id);
        else next.delete(a.id);
        return next;
      });
      setError(e instanceof Error ? e.message : "收藏失败，请先登录");
    });
  }

  async function runSearch(opts: { type: AssetType; q: string; page: number; append: boolean }) {
    const my = ++reqId.current;
    setLoading(true);
    setError("");
    // 切换类别/搜索时立即清空旧网格 → 先出骨架屏，不再让用户盯着上一个分区的内容
    // 干等网络回包。这是「按按键要等很久才跳页」的体感根因（之前换分区时整页保持
    // 旧素材静止 0.5~1.5s）。append（加载更多）时保留已有项。
    if (!opts.append) setItems([]);
    try {
      const r = await searchAssets({
        q: opts.q,
        type: opts.type,
        license: LICENSE,
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
  }

  // Reload whenever type / query changes. 内联取数（不把函数放进 deps），避免每次渲染
  // 重新触发 effect；这也是 React Compiler 推荐的写法（无需手动 useCallback 稳定化）。
  useEffect(() => {
    const my = ++reqId.current;
    setLoading(true);
    setError("");
    setItems([]);
    searchAssets({ q: query, type, license: LICENSE, page: 1, pageSize: 30 })
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
  }, [type, query]);

  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setQuery(input.trim());
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-900">{TYPE_LABELS[type]}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          免费 · 开源授权素材，按质量排序，浏览后可直接收藏到「我的素材库」或拿去创作。默认只展示可商用素材。
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

      {/* 推荐筛选（方向，仅图片/视频/矢量/贴纸）+ 快捷词建议 */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {showOrientation && (
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white p-1">
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
      {loading && items.length === 0 ? (
        // 切类别/搜索时的瞬时骨架屏——立刻给反馈，不让用户盯着旧内容干等网络。
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
          没有找到符合条件的素材，换个关键词或筛选条件试试。
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
            onClick={() => runSearch({ type, q: query, page: page + 1, append: true })}
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
