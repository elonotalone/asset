"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useUI } from "@oceanleo/ui/i18n";
import {
  KIND_HINTS,
  KIND_LABELS,
  PLUGIN_GALLERY_INTRO,
  PLUGIN_GALLERY_POLICY,
  PLUGIN_GALLERY_TITLE,
  PLUGIN_ITEMS,
  STATUS_HINTS,
  STATUS_LABELS,
  categoriesForKind,
  categoryLabel,
  countByStatus,
  filterPlugins,
  pluginDetailHref,
  type PluginEntry,
  type PluginKind,
  type PluginStatus,
} from "@/lib/plugin-gallery";

// 工具能力列表。可搜、可按类别与使用方式筛，也可以只看**现在就能试用**的那几件。
//
// 卡片说的是「你能用它干什么」，不是技术名词；状态角标如实标注，
// 未实装的条目**不给任何可点的使用入口**，避免把用户送去一个不存在的地方。
// 全页没有下载或安装入口，这是硬要求（见 lib/plugin-gallery.ts 顶部）。
//
// `runtimeIds` 是读盘结论（`app/plugin-gallery/runtime-registry.ts`），由页面传进来：
// 哪几件在货架上真有可运行实例。它与 `status` 是两条独立的事实 —— 前者说
// 「素材站上能不能试」，后者说「平台 app 里有没有入口」，混成一个会说谎。

const KIND_TABS: { key: PluginKind | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "standalone", label: KIND_LABELS.standalone },
  { key: "editor", label: KIND_LABELS.editor },
];

function StatusBadge({ status }: { status: PluginStatus }) {
  const tt = useUI();
  const shipped = status === "shipped";
  return (
    <span
      title={tt(STATUS_HINTS[status])}
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        shipped
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      }`}
    >
      {tt(STATUS_LABELS[status])}
    </span>
  );
}

function PluginCard({ item, runnable }: { item: PluginEntry; runnable: boolean }) {
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
        {runnable ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            {tt("可以试用")}
          </span>
        ) : (
          <StatusBadge status={item.status} />
        )}
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
        <span className="rounded-full bg-zinc-100 px-2 py-0.5">
          {tt(KIND_LABELS[item.kind])}
        </span>
        <span className="ml-auto text-sky-600 group-hover:underline">
          {runnable ? tt("打开就能用") : tt("看它怎么用")}
        </span>
      </div>
    </Link>
  );
}

export function PluginGallery({ runtimeIds = [] }: { runtimeIds?: string[] }) {
  const tt = useUI();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<PluginKind | "all">("all");
  const [category, setCategory] = useState<string | "all">("all");
  const [onlyRunnable, setOnlyRunnable] = useState(false);

  const runnable = useMemo(() => new Set(runtimeIds), [runtimeIds]);
  const categories = useMemo(() => categoriesForKind(kind), [kind]);
  const list = useMemo(() => {
    const matched = filterPlugins({ text, kind, category });
    return onlyRunnable ? matched.filter((item) => runnable.has(item.id)) : matched;
  }, [text, kind, category, onlyRunnable, runnable]);

  function switchKind(next: PluginKind | "all") {
    setKind(next);
    // 类别是按使用方式分开的两组，换组时旧的选择必然失效。
    setCategory("all");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 px-6 py-12 text-center text-white sm:py-14">
        <h1 className="text-2xl font-extrabold sm:text-4xl">
          {tt(PLUGIN_GALLERY_TITLE)}
        </h1>
        <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-white/90 sm:text-base">
          {tt(PLUGIN_GALLERY_INTRO)}
        </p>
        <p className="mx-auto mt-4 max-w-3xl rounded-2xl bg-white/15 px-4 py-3 text-xs leading-6 text-white/90 sm:text-sm">
          {tt(PLUGIN_GALLERY_POLICY.reason)}
        </p>
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="shrink-0 text-sm font-semibold text-zinc-800">
            {tt("怎么用")}
          </span>
          <div className="flex flex-wrap gap-2">
            {KIND_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                title={
                  tab.key === "all" ? undefined : tt(KIND_HINTS[tab.key])
                }
                onClick={() => switchKind(tab.key)}
                className={`rounded-full px-4 py-1.5 text-sm transition ${
                  kind === tab.key
                    ? "bg-sky-500 text-white shadow-sm"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {tt(tab.label)}
              </button>
            ))}
          </div>
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
          {categories.map((entry) => (
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

        {runnable.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-100 pt-3">
            <span className="shrink-0 text-sm font-semibold text-zinc-800">{tt("能不能试")}</span>
            <button
              type="button"
              onClick={() => setOnlyRunnable((v) => !v)}
              aria-pressed={onlyRunnable}
              className={`rounded-full px-3 py-1 text-xs transition ${
                onlyRunnable ? "bg-emerald-600 text-white" : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {tt("只看现在就能试用的")}
              <span className={`ml-1 ${onlyRunnable ? "text-white/75" : "text-zinc-400"}`}>
                {runnable.size}
              </span>
            </button>
          </div>
        )}

        <p className="mt-3 border-t border-zinc-100 pt-3 text-xs leading-6 text-zinc-500">
          {tt(
            "共 {total} 件：{shipped} 件已上线，从「我的库」打开对应素材即进入；{planned} 件规格已定未实装，产品目标已经定稿但平台上还没有入口，列在这里是为了说清我们要做什么。",
            {
              total: PLUGIN_ITEMS.length,
              shipped: countByStatus("shipped"),
              planned: countByStatus("spec-only"),
            },
          )}
          {runnable.size > 0
            ? tt("其中 {n} 件在这个站上就有可运行的实物，点进去直接输数据试。", {
                n: runnable.size,
              })
            : ""}
        </p>
      </section>

      <section className="mt-6">
        {list.length === 0 ? (
          <p className="rounded-2xl bg-white p-10 text-center text-sm text-zinc-500 shadow-sm">
            {tt("没有匹配的工具。换个说法试试，比如「算账」「排路线」「改 PPT」。")}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((item) => (
              <PluginCard key={item.id} item={item} runnable={runnable.has(item.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
