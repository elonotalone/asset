"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUI } from "@oceanleo/ui/i18n";
import {
  COLOR_SYSTEMS,
  ColorKey,
  INDUSTRIES,
  Industry,
  allTemplates,
  templatesForSub,
  TemplateMeta,
} from "@/lib/template-taxonomy";
import { TemplateThumb } from "@/components/TemplateThumb";

type Sort = "new" | "hot";

export function TemplateGallery({ total, subs }: { total: number; subs: number }) {
  const tt = useUI();
  const router = useRouter();
  const search = useSearchParams();

  const indKey = search.get("ind") || "all";
  const subKey = search.get("sub") || "";
  const color = (search.get("color") as ColorKey | null) || "all";
  const sort = (search.get("sort") as Sort) || "new";
  const q = search.get("q") || "";

  const [query, setQuery] = useState(q);

  const activeIndustry: Industry | undefined = INDUSTRIES.find((i) => i.key === indKey);

  function setParam(patch: Record<string, string | null>) {
    const p = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    router.push(`/templates?${p.toString()}`);
  }

  // 计算当前结果集（确定性、纯前端过滤）。
  const results = useMemo(() => {
    let list: TemplateMeta[] = [];
    if (subKey) {
      // 指定子类
      for (const ind of INDUSTRIES) {
        const sub = ind.subs.find((s) => s.key === subKey);
        if (sub) list = templatesForSub(ind, sub);
      }
    } else if (activeIndustry) {
      for (const sub of activeIndustry.subs) {
        list.push(...templatesForSub(activeIndustry, sub));
      }
    } else {
      list = allTemplates();
    }

    if (color !== "all") list = list.filter((t) => t.color === color);

    if (query.trim()) {
      const kw = query.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.subLabel.includes(query.trim()) ||
          t.industryLabel.includes(query.trim()) ||
          t.title.toLowerCase().includes(kw),
      );
    }

    list = [...list].sort((a, b) =>
      sort === "hot" ? b.hot - a.hot : b.fresh - a.fresh,
    );
    return list;
  }, [activeIndustry, subKey, color, sort, query]);

  const PAGE = 60;
  const [shown, setShown] = useState(PAGE);
  const visible = results.slice(0, shown);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 px-6 py-12 text-center text-white sm:py-16">
        <h1 className="text-2xl font-extrabold sm:text-4xl">
          {tt("OceanLeo 模板库 · 建站无需从零开始")}
        </h1>
        <p className="mt-3 text-sm text-white/85 sm:text-base">
          {tt("内置 {total} 套模板，覆盖 {industries} 大行业 {subs} 个细分类目，每月持续更新，任意选用、自由更换", { total: total.toLocaleString(), industries: INDUSTRIES.length, subs })}
        </p>
        <form
          className="mx-auto mt-7 flex max-w-xl items-center gap-2 rounded-full bg-white p-1.5 shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            setShown(PAGE);
            setParam({ q: query.trim() || null });
          }}
        >
          <svg className="ml-3 h-5 w-5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tt("请输入搜索关键词，如「火锅」「律师」「珠宝」")}
            className="flex-1 bg-transparent px-1 py-2 text-sm text-zinc-800 outline-none"
          />
          <button type="submit" className="rounded-full bg-sky-500 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-600">
            {tt("搜索")}
          </button>
        </form>
      </section>

      {/* 筛选区 */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        {/* 行业 */}
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <span className="mt-1.5 shrink-0 text-sm font-semibold text-zinc-800">{tt("行业")}</span>
          <div className="flex flex-wrap gap-2">
            <Chip active={indKey === "all" && !subKey} onClick={() => { setShown(PAGE); setParam({ ind: null, sub: null }); }}>
              {tt("全部")}
            </Chip>
            {INDUSTRIES.map((ind) => (
              <Chip
                key={ind.key}
                active={indKey === ind.key}
                onClick={() => { setShown(PAGE); setParam({ ind: ind.key, sub: null }); }}
              >
                {tt(ind.label)}
              </Chip>
            ))}
          </div>
        </div>

        {/* 子类（选中行业后出现） */}
        {activeIndustry && (
          <div className="mt-3 flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-zinc-100 pt-3">
            <span className="mt-1.5 shrink-0 text-sm font-semibold text-zinc-800">{tt("细分")}</span>
            <div className="flex flex-wrap gap-2">
              <Chip active={!subKey} onClick={() => { setShown(PAGE); setParam({ sub: null }); }} small>
                {tt("全部{name}", { name: activeIndustry.label.split("/")[0] })}
              </Chip>
              {activeIndustry.subs.map((sub) => (
                <Chip
                  key={sub.key}
                  active={subKey === sub.key}
                  onClick={() => { setShown(PAGE); setParam({ sub: sub.key }); }}
                  small
                >
                  {tt(sub.label)}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* 色系 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-100 pt-3">
          <span className="shrink-0 text-sm font-semibold text-zinc-800">{tt("色系")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setShown(PAGE); setParam({ color: null }); }}
              className={`rounded-full px-3 py-1 text-xs ${color === "all" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}
            >
              {tt("全部")}
            </button>
            {COLOR_SYSTEMS.map((cs) => (
              <button
                key={cs.key}
                title={tt(cs.label)}
                onClick={() => { setShown(PAGE); setParam({ color: cs.key }); }}
                className={`h-6 w-6 rounded-full border-2 transition ${color === cs.key ? "border-zinc-900 scale-110" : "border-white shadow"}`}
                style={
                  cs.swatch === "conic"
                    ? { background: "conic-gradient(from 0deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#8b5cf6,#ef4444)" }
                    : { background: cs.swatch }
                }
              />
            ))}
          </div>
        </div>

        {/* 排序 */}
        <div className="mt-3 flex items-center gap-3 border-t border-zinc-100 pt-3">
          <span className="shrink-0 text-sm font-semibold text-zinc-800">{tt("排序")}</span>
          <button onClick={() => setParam({ sort: "new" })} className={`text-sm ${sort === "new" ? "font-semibold text-sky-600" : "text-zinc-500"}`}>{tt("最新")}</button>
          <button onClick={() => setParam({ sort: "hot" })} className={`text-sm ${sort === "hot" ? "font-semibold text-sky-600" : "text-zinc-500"}`}>{tt("最热")}</button>
          <span className="ml-auto text-xs text-zinc-400">{tt("共 {n} 套模板", { n: results.length.toLocaleString() })}</span>
        </div>
      </section>

      {/* 网格 */}
      <section className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((t) => (
          <TemplateThumb key={t.slug} meta={t} href={`/templates/${t.slug}`} />
        ))}
      </section>

      {shown < results.length && (
        <div className="mt-8 text-center">
          <button
            onClick={() => setShown((s) => s + PAGE)}
            className="rounded-full border border-zinc-300 bg-white px-8 py-2.5 text-sm font-medium text-zinc-700 hover:border-sky-400 hover:text-sky-600"
          >
            {tt("加载更多（还有 {n} 套）", { n: results.length - shown })}
          </button>
        </div>
      )}

      {results.length === 0 && (
        <div className="py-20 text-center text-sm text-zinc-400">{tt("没有匹配的模板，换个关键词或筛选试试。")}</div>
      )}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
  small,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full transition ${small ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"} ${
        active ? "bg-sky-500 text-white shadow-sm" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
