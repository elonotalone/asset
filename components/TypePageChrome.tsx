"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUI } from "@oceanleo/ui/i18n";
import {
  AssetType,
  loadTypeOriginIndex,
  TYPE_LABELS,
  TYPE_ORDER,
  zoneTotal,
} from "@/lib/assets";
import {
  defaultZone,
  parseZone,
  TYPE_ZONES,
  typePageHref,
  ZONE_LABELS,
  ZONE_LIVE_UNAVAILABLE_NOTE,
  ZONE_NOTES,
  zoneIsUsable,
  type TypeZone,
} from "@/lib/type-page-views";
import { OpenZone } from "@/components/OpenZone";

// 类型页右侧的三分区开关。三格是同一条轴上的三个取值：
//
//   ① OceanLeo 自有        我们做的，在库里
//   ② 开源专区（已入库）    别人做的，在库里
//   ③ 实时搜索             别人做的，还不在库里
//
// 上一版是「本站素材 / 开源搜索 / 成套」：第一格顶着「本站/自有」的名字，装的却是
// 已囤进本站的**开源件**（名实不符，这是操作员点名要改的）；第三格「成套」讲的是
// 形态不是来源，跟前两格不是同一种东西。判据与词汇表都搬进 lib/type-page-views.ts。
//
// **三格永远画出来。** 操作员这次不满的根源就是「看不出到底有没有东西」——
// 藏掉一格，用户分不清是没货还是页面没做。所以：没货就把件数写成 0 并画空态；
// 上游不支持这一类时，③ 那格照画，只是点不动并写明为什么。
//
// 这一层仍然是 AssetLibrary 的**外壳**而不是改 AssetLibrary：①② 都是同一个素材库，
// 只是来源筛选不同，由 AssetLibrary 自己从 ?view= 读分区（它本来就在读 useSearchParams）。

function normType(t: string | null): AssetType {
  return t && TYPE_ORDER.includes(t as AssetType) ? (t as AssetType) : "image";
}

type ZoneCounts = {
  owned: number;
  stocked: number;
  /** 有目录没采到（网关间歇 503）⇒ 数字偏小，页签要说「至少」而不是报个假确数。 */
  incomplete: boolean;
} | null;

export function TypePageChrome({ children }: { children: ReactNode }) {
  const tt = useUI();
  const search = useSearchParams();
  const type = normType(search.get("type"));
  const cat = search.get("cat");
  const typeName = tt(TYPE_LABELS[type]);

  // 页签上的件数。数字全部来自服务端每个目录报的 total（见 loadTypeOriginIndex），
  // 不是前端数出来的。拿到之前页签不显示数字，而不是先显示一个 0 再跳。
  const [counts, setCounts] = useState<ZoneCounts>(null);
  useEffect(() => {
    let alive = true;
    setCounts(null);
    loadTypeOriginIndex(type)
      .then((index) => {
        if (!alive) return;
        setCounts({
          owned: zoneTotal(index, "first-party"),
          stocked: zoneTotal(index, "external"),
          incomplete: index.incomplete,
        });
      })
      .catch(() => {
        /* 网关不可用：页签不显示件数，内容区自己报错 */
      });
    return () => {
      alive = false;
    };
  }, [type]);

  const requested = parseZone(search.get("view"), type);
  // 没写 ?view= 是左栏点进来的落地态：落到这一类真有货的那一区，
  // 但三个页签一个不少（见 defaultZone 的注释）。
  const zone: TypeZone =
    requested ?? (counts ? defaultZone(type, counts) : "owned");

  const countOf = (z: TypeZone): number | null => {
    if (!counts) return null;
    if (z === "owned") return counts.owned;
    if (z === "stocked") return counts.stocked;
    return null; // 实时搜索没有「库里有几件」这回事
  };

  const activeNote = zoneIsUsable(type, zone)
    ? tt(ZONE_NOTES[zone], { type: typeName })
    : tt(ZONE_LIVE_UNAVAILABLE_NOTE, { type: typeName });

  return (
    <div>
      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 pt-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPE_ZONES.map((z) => {
              const usable = zoneIsUsable(type, z);
              const active = z === zone;
              const n = countOf(z);
              const label = tt(ZONE_LABELS[z]);
              const body = (
                <>
                  {label}
                  {n !== null && (
                    <span
                      title={
                        counts?.incomplete
                          ? tt("素材网关刚才有请求没成功，实际件数只会更多，不会更少。")
                          : undefined
                      }
                      className={`ml-1.5 tabular-nums text-xs ${
                        active
                          ? "text-white/70"
                          : n === 0
                            ? "text-zinc-400"
                            : "text-zinc-500"
                      }`}
                    >
                      {counts?.incomplete ? "≥" : ""}
                      {n.toLocaleString("en-US")}
                    </span>
                  )}
                </>
              );
              const shape = "rounded-lg px-3.5 py-1.5 text-sm font-medium transition";
              if (!usable) {
                // 画出来，但点不动 —— 这一类没有可实时搜索的上游，
                // 给一个点下去永远空的搜索框比不给更糟。
                return (
                  <span
                    key={z}
                    aria-disabled="true"
                    title={tt(ZONE_LIVE_UNAVAILABLE_NOTE, { type: typeName })}
                    className={`${shape} cursor-not-allowed bg-zinc-50 text-zinc-400 ring-1 ring-zinc-200`}
                  >
                    {body}
                  </span>
                );
              }
              return (
                <Link
                  key={z}
                  href={typePageHref(type, z, { cat })}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={`${shape} ${
                    active
                      ? "bg-zinc-900 text-white"
                      : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  {body}
                </Link>
              );
            })}
          </div>
          <p className="pb-3 pt-2 text-xs text-zinc-500">{activeNote}</p>
        </div>
      </div>

      {/* key=type：换类型就是换一个全新的浏览上下文，重建组件比在 effect 里逐个
          reset 干净，也不会短暂混用上一类型的搜索词与结果。 */}
      {zone === "live" ? (
        <OpenZone key={type} lockType={type} />
      ) : (
        <>{children}</>
      )}
    </div>
  );
}
