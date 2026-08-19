"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useUI } from "@oceanleo/ui/i18n";
import {
  PLUGIN_CATEGORIES,
  PLUGIN_GALLERY_INTRO,
  PLUGIN_GALLERY_POLICY,
  PLUGIN_GALLERY_SCOPE_NOTE,
  PLUGIN_GALLERY_TITLE,
  PLUGIN_ITEMS,
  categoryLabel,
  filterAvailablePlugins,
  filterPlugins,
  pluginDetailHref,
  pluginIsAvailable,
  type PluginEntry,
} from "@/lib/plugin-gallery";

// 平台能干的活。可搜、可按类别筛，也可以只看**现在就能直接打开**的那几件。
//
// 卡片说的是「你能用它干什么」，不是技术名词；可用角标只来自数据层逐条核过的
// 第一方编辑器入口白名单，JSON 不参与判定。没有入口的条目会在详情里给真实素材
// 或说清下一步，避免留下纯说明书。
// 全页没有下载或安装入口，这是硬要求（见 lib/plugin-gallery.ts 顶部）。

function AvailabilityBadge({ available }: { available: boolean }) {
  const tt = useUI();
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        available
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      }`}
    >
      {available ? tt("现在可用") : tt("入口准备中")}
    </span>
  );
}

function PluginCard({ item, available }: { item: PluginEntry; available: boolean }) {
  const tt = useUI();
  return (
    <Link
      href={pluginDetailHref(item.id)}
      className="group flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-100 transition hover:shadow-md hover:ring-sky-200"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-zinc-900 group-hover:text-sky-700">
          {tt(item.name)}
        </h3>
        <AvailabilityBadge available={available} />
      </div>

      <p className="mt-2 text-sm leading-6 text-zinc-600">{tt(item.summary)}</p>

      <ul className="mt-3 space-y-1.5">
        {item.does.slice(0, 2).map((line) => (
          <li key={line} className="flex gap-2 text-xs leading-5 text-zinc-500">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sky-400" />
            <span>{tt(line)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5">
          {tt(categoryLabel(item.category))}
        </span>
        <span className="ml-auto text-sky-600 group-hover:underline">
          {available ? tt("打开就能用") : tt("查看下一步")}
        </span>
      </div>
    </Link>
  );
}

export function PluginGallery() {
  const tt = useUI();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<string | "all">("all");
  const [onlyRunnable, setOnlyRunnable] = useState(false);

  const availableCount = useMemo(
    () => filterAvailablePlugins(PLUGIN_ITEMS).length,
    [],
  );
  const list = useMemo(() => {
    const matched = filterPlugins({ text, category });
    return onlyRunnable ? filterAvailablePlugins(matched) : matched;
  }, [text, category, onlyRunnable]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 px-6 py-12 text-center text-white sm:py-14">
        <h1 className="text-2xl font-extrabold sm:text-4xl">
          {tt(PLUGIN_GALLERY_TITLE)}
        </h1>
        <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-white/90 sm:text-base">
          {tt(PLUGIN_GALLERY_INTRO)}
        </p>
        <p className="mx-auto mt-4 max-w-3xl text-xs leading-6 text-white/85 sm:text-sm">
          {tt(PLUGIN_GALLERY_SCOPE_NOTE)}
        </p>
        <p className="mx-auto mt-4 max-w-3xl rounded-2xl bg-white/15 px-4 py-3 text-xs leading-6 text-white/90 sm:text-sm">
          {tt(PLUGIN_GALLERY_POLICY.reason)}
        </p>
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="shrink-0 text-sm font-semibold text-zinc-800">
            {tt("找一件来用")}
          </span>
          <div className="ml-auto w-full sm:w-72">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={tt("搜工具名，或直接搜你想干的事")}
              aria-label={tt("搜索工具")}
              className="w-full rounded-full border border-zinc-200 px-4 py-2 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-100 pt-3">
          <span className="shrink-0 text-sm font-semibold text-zinc-800">
            {tt("类别")}
          </span>
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={`rounded-full px-3 py-1 text-xs transition ${
              category === "all"
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            {tt("全部")}
          </button>
          {PLUGIN_CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setCategory(entry.id)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                category === entry.id
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {tt(entry.label)}
            </button>
          ))}
        </div>

        {availableCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-100 pt-3">
            <span className="shrink-0 text-sm font-semibold text-zinc-800">{tt("能不能用")}</span>
            <button
              type="button"
              onClick={() => setOnlyRunnable((v) => !v)}
              aria-pressed={onlyRunnable}
              className={`rounded-full px-3 py-1 text-xs transition ${
                onlyRunnable ? "bg-emerald-600 text-white" : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {tt("只看现在可用的")}
              <span className={`ml-1 ${onlyRunnable ? "text-white/75" : "text-zinc-400"}`}>
                {availableCount}
              </span>
            </button>
          </div>
        )}

        <p className="mt-3 border-t border-zinc-100 pt-3 text-xs leading-6 text-zinc-500">
          {tt(
            "共 {total} 件，全部是编辑器：{available} 件现在有经过核验的使用入口；{pending} 件入口尚未接通，详情页会如实说明缺口与下一步。",
            {
              total: PLUGIN_ITEMS.length,
              available: availableCount,
              pending: PLUGIN_ITEMS.length - availableCount,
            },
          )}
        </p>
      </section>

      <section className="mt-6">
        {list.length === 0 ? (
          <p className="rounded-2xl bg-white p-10 text-center text-sm text-zinc-500 shadow-sm">
            {tt("没有匹配的。换个说法试试，比如「改 PPT」「剪视频」「调表格」。")}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((item) => (
              <PluginCard
                key={item.id}
                item={item}
                available={pluginIsAvailable(item)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
