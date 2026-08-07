"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUI } from "@oceanleo/ui/i18n";
import { AssetType, TYPE_LABELS, TYPE_ORDER } from "@/lib/assets";
import { OpenZone } from "@/components/OpenZone";
import { SeriesZone } from "@/components/SeriesZone";

// 左栏是**纯素材类型轴**，「开源」和「成套」都不是素材类型：
// 前者是「现搜全网上游」这个**功能**，后者是素材的一种**形态**。两者原先各占左栏一格
// （开源专区 / 成套素材），现在降级成类型页顶部的开关 —— 你先选「找什么素材」，
// 再在这一类里面选「从哪儿找 / 要不要整套」。
//
// 这一层刻意做成 AssetLibrary 的**外壳**而不是改 AssetLibrary：素材库那个组件是
// A3 的面，也是本站最重的组件，包在外面就能加开关，不必动它一行。
//
// 最要紧的一条纪律写在下面两张表里：**没有上游就不画开关**。
// 画一个点下去永远空的搜索框，比不画更糟。

/**
 * 有实时上游可搜的 5 个类型（上游 `OPEN_SOURCE_TYPES` 是 6 个，多出来的 `music`
 * 在库里一行都没有、左栏也没有格子，所以这里没有它）。
 */
export const OPEN_SEARCH_TYPES: AssetType[] = ["image", "vector", "video", "audio", "3d"];

/** 库里真有成套数据的 3 个类型：ppt 243 套 / vector 20 套 / image 10 套，合计 273 套。 */
export const SERIES_TYPES: AssetType[] = ["ppt", "vector", "image"];

type TypeView = "library" | "open" | "series";

function normType(t: string | null): AssetType {
  return t && TYPE_ORDER.includes(t as AssetType) ? (t as AssetType) : "image";
}

// 手敲一个这一类不支持的 view（?type=font&view=open）要落回本站素材，
// 而不是渲染一个搜不到东西的面。
function normView(v: string | null, type: AssetType): TypeView {
  if (v === "open" && OPEN_SEARCH_TYPES.includes(type)) return "open";
  if (v === "series" && SERIES_TYPES.includes(type)) return "series";
  return "library";
}

function hrefFor(type: AssetType, view: TypeView, cat: string | null): string {
  const qs = new URLSearchParams();
  if (type !== "image") qs.set("type", type);
  if (view !== "library") qs.set("view", view);
  // ?cat= 是本站素材独有的目录直达，换到开源 / 成套就没有意义了。
  else if (cat) qs.set("cat", cat);
  const s = qs.toString();
  return s ? `/?${s}` : "/";
}

export function TypePageChrome({ children }: { children: ReactNode }) {
  const tt = useUI();
  const search = useSearchParams();
  const type = normType(search.get("type"));
  const cat = search.get("cat");
  const view = normView(search.get("view"), type);
  const typeName = tt(TYPE_LABELS[type]);

  const tabs: { view: TypeView; label: string; note: string }[] = [
    {
      view: "library",
      label: tt("本站素材"),
      note: tt("本站已囤到自有存储的「{type}」原件，可直接下载商用。", { type: typeName }),
    },
  ];
  if (OPEN_SEARCH_TYPES.includes(type)) {
    tabs.push({
      view: "open",
      label: tt("开源搜索"),
      note: tt(
        "现搜全网开源可商用「{type}」（Openverse / Pexels / Pixabay / Poly Haven / Freesound 等）。这些素材来自开源社区，不在本站库里。",
        { type: typeName },
      ),
    });
  }
  if (SERIES_TYPES.includes(type)) {
    tabs.push({
      view: "series",
      label: tt("成套"),
      note: tt("风格统一、成组配套的「{type}」，整套取用不违和（每套均已人工逐件过目）。", {
        type: typeName,
      }),
    });
  }

  // 这一类既没有上游也没有成套 —— **一个开关都不画**，页面就是纯粹的素材库。
  if (tabs.length === 1) return <>{children}</>;

  const active = tabs.find((t) => t.view === view) ?? tabs[0];

  return (
    <div>
      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 pt-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {tabs.map((t) => (
              <Link
                key={t.view}
                href={hrefFor(type, t.view, cat)}
                scroll={false}
                aria-current={t.view === view ? "page" : undefined}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                  t.view === view
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
          <p className="pb-3 pt-2 text-xs text-zinc-500">{active.note}</p>
        </div>
      </div>

      {/* key=type：换类型就是换一个全新的浏览上下文，重建组件比在 effect 里逐个
          reset 干净，也不会短暂混用上一类型的搜索词与结果。 */}
      {view === "open" ? (
        <OpenZone key={type} lockType={type} />
      ) : view === "series" ? (
        <SeriesZone key={type} lockType={type} />
      ) : (
        children
      )}
    </div>
  );
}
