"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUI } from "@oceanleo/ui/i18n";
import { AssetType, TYPE_LABELS, TYPE_ORDER } from "@/lib/assets";
import {
  OPEN_SEARCH_TYPES,
  SERIES_TYPES,
  type TypeView,
  typePageHref,
} from "@/lib/type-page-views";
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
// 哪一类画哪个开关由 lib/type-page-views.ts 的两张白名单说了算（重定向路由也读同一份）。
// 最要紧的一条纪律就在那两张表里：**没有上游就不画开关**。

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
                href={typePageHref(type, t.view, cat)}
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
