"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useUI } from "@oceanleo/ui/i18n";
import {
  VIEW_KINDS,
  familiesFor,
  familyAnchor,
  groupByFamily,
  type ArtifactType,
  type WorkEntry,
  type WorkProduction,
} from "@/components/WorksKinds";

// 成品展厅列表页。按 artifact type 分格，卡片走**真封面**。
// 卡片点进去是详情页（真的能打开看），不是放大封面。
//
// 设计稿那一格里装着四种彼此无关的物料（简历 / LOGO / 小红书封面 / 名片），
// 所以有物料族的类型再分一层小节，并给一排筛选钮 —— 四族糊成一个瀑布流时
// 用户要找名片得先滚过所有简历。

export interface WorksGroup {
  type: ArtifactType;
  label: string;
  works: WorkEntry[];
  production?: WorkProduction;
}

/**
 * 「本类已转外接」的横幅。**照实说，两句都要说**：
 * 这一类不再由我们自产（否则用户以为还在更新），成品还在还有效（否则用户以为下架了）。
 * 文案逐字用产线交下来的 `notice`，站上不改写。
 */
function ProductionNotice({ production }: { production: WorkProduction }) {
  const tt = useUI();
  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
      <p className="text-xs leading-6 text-amber-900">
        <span className="mr-1.5 rounded bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-medium">
          {tt("存量")}
        </span>
        {tt(production.notice)}
        {production.agentScope === "design-doc"
          ? tt("平台这边继续出设计文档，模型本身走外接。")
          : ""}
      </p>
      <p className="mt-1 text-[11px] text-amber-700/80">
        {production.retiredOn
          ? tt("{date} 起不再新产；下面这些一件没少，照常查看与下载。", {
              date: production.retiredOn,
            })
          : tt("下面这些一件没少，照常查看与下载。")}
      </p>
    </div>
  );
}

function WorkCard({ work }: { work: WorkEntry }) {
  const tt = useUI();
  return (
    <Link
      href={`/works/${work.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-400"
    >
      <div className="relative w-full overflow-hidden bg-zinc-100" style={{ aspectRatio: "4 / 3" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={work.cover}
          alt={work.title}
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:scale-[1.03]"
        />
        <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {tt(VIEW_KINDS[work.view.kind].label)}
        </span>
        {!work.downloadable && (
          <span className="absolute left-2 top-2 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
            {tt("仅供查看")}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
        <span className="truncate text-sm font-medium text-zinc-800">{work.title}</span>
        {work.summary && <span className="line-clamp-2 text-xs text-zinc-500">{work.summary}</span>}
        {work.styleId && <span className="truncate text-[11px] text-zinc-400">{work.styleId}</span>}
      </div>
    </Link>
  );
}

function CardGrid({ works }: { works: WorkEntry[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {works.map((w) => (
        <WorkCard key={w.id} work={w} />
      ))}
    </div>
  );
}

/** 有物料族的类型（今天只有设计稿）：一排筛选钮 + 逐族小节。 */
function FamilySections({ group }: { group: WorksGroup }) {
  const tt = useUI();
  const [picked, setPicked] = useState<string>("all");
  const families = useMemo(() => groupByFamily(group.type, group.works), [group]);

  // 只剩一族时筛选钮是噪音（点了也是同一批东西），直接出网格。
  if (families.length < 2) return <CardGrid works={group.works} />;

  const shown = picked === "all" ? families : families.filter((f) => f.family.id === picked);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-zinc-400">{tt("物料")}</span>
        <button
          type="button"
          onClick={() => setPicked("all")}
          aria-pressed={picked === "all"}
          className={`rounded-full px-3 py-1 text-xs transition ${
            picked === "all" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          {tt("全部")}
          <span className={`ml-1 ${picked === "all" ? "text-white/70" : "text-zinc-400"}`}>
            {group.works.length}
          </span>
        </button>
        {families.map(({ family, works }) => (
          <button
            key={family.id}
            type="button"
            title={tt(family.hint)}
            onClick={() => setPicked(family.id)}
            aria-pressed={picked === family.id}
            className={`rounded-full px-3 py-1 text-xs transition ${
              picked === family.id
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {tt(family.label)}
            <span className={`ml-1 ${picked === family.id ? "text-white/70" : "text-zinc-400"}`}>
              {works.length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-8">
        {shown.map(({ family, works }) => (
          <section
            key={family.id}
            id={familyAnchor(group.type, family.id)}
            className="scroll-mt-20"
          >
            <div className="mb-2.5">
              <h3 className="flex items-baseline gap-2 text-sm font-semibold text-zinc-700">
                {tt(family.label)}
                <span className="text-xs font-normal text-zinc-400">
                  {tt("{n} 件", { n: works.length })}
                </span>
              </h3>
              <p className="mt-0.5 text-xs text-zinc-400">{tt(family.hint)}</p>
            </div>
            <CardGrid works={works} />
          </section>
        ))}
      </div>
    </>
  );
}

export function WorksGallery({ groups, total }: { groups: WorksGroup[]; total: number }) {
  const tt = useUI();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">{tt("成品")}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-zinc-500">
          {tt(
            "按新工作流做出来的成品：每一件的版面都是当场判断的，不是模板灌数据。点开即可在站内查看内容。",
          )}
        </p>
      </header>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center">
          <p className="text-sm text-zinc-500">{tt("成品还在产线上，这里很快就会有东西。")}</p>
        </div>
      ) : (
        <>
          <nav className="mb-6 flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <a
                key={g.type}
                href={`#${g.type}`}
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100"
              >
                {tt(g.label)}
                <span className="ml-1 text-zinc-400">{g.works.length}</span>
                {g.production ? (
                  <span className="ml-1 text-amber-600">{tt("存量")}</span>
                ) : null}
              </a>
            ))}
          </nav>

          <div className="flex flex-col gap-10">
            {groups.map((g) => (
              <section key={g.type} id={g.type} className="scroll-mt-20">
                <h2 className="mb-3 flex items-baseline gap-2 text-base font-semibold text-zinc-800">
                  {tt(g.label)}
                  <span className="text-xs font-normal text-zinc-400">
                    {tt("{n} 件", { n: g.works.length })}
                  </span>
                </h2>
                {g.production ? <ProductionNotice production={g.production} /> : null}
                {familiesFor(g.type) ? <FamilySections group={g} /> : <CardGrid works={g.works} />}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
