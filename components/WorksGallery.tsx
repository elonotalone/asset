"use client";

import Link from "next/link";
import { useUI } from "@oceanleo/ui/i18n";
import { VIEW_KINDS, type ArtifactType, type WorkEntry } from "@/components/WorksKinds";

// 成品展厅列表页。按 artifact type 分格，卡片走**真封面**。
// 卡片点进去是详情页（真的能打开看），不是放大封面。

export interface WorksGroup {
  type: ArtifactType;
  label: string;
  works: WorkEntry[];
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
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {g.works.map((w) => (
                    <WorkCard key={w.id} work={w} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
