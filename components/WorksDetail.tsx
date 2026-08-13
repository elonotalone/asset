"use client";

import Link from "next/link";
import { useUI } from "@oceanleo/ui/i18n";
import {
  ARTIFACT_TYPE_LABELS,
  VIEW_KINDS,
  downloadHref,
  familiesFor,
  familyAnchor,
  familyOf,
  type ExtractedContent,
  type WorkEntry,
} from "@/components/WorksKinds";
import { WorksViewer, type WorkPayload } from "@/components/WorksViewer";

// 一件成品的详情页：左边是**真的打开看**，右边是它是什么、谁做的、读数多少。
// `downloadable: false` 的条目这里不会出现任何下载入口（插件板块要靠这条）。

function readingRows(readings: Record<string, unknown> | undefined): [string, string][] {
  if (!readings) return [];
  return Object.entries(readings)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => [k, String(v)] as [string, string]);
}

export function WorksDetail({
  work,
  payload,
  extracted,
}: {
  work: WorkEntry;
  payload: WorkPayload;
  extracted?: ExtractedContent | null;
}) {
  const tt = useUI();
  const href = downloadHref(work);
  const rows = readingRows(work.readings);
  const kind = VIEW_KINDS[work.view.kind];
  // 设计稿这一格里有四种物料，面包屑要能跳回它自己那一族，不是跳回混装的大格。
  const family = familiesFor(work.artifactType) ? familyOf(work) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-zinc-500">
        <Link href="/works" className="hover:text-zinc-800">
          {tt("成品")}
        </Link>
        <span>/</span>
        <Link href={`/works#${work.artifactType}`} className="hover:text-zinc-800">
          {tt(ARTIFACT_TYPE_LABELS[work.artifactType])}
        </Link>
        {family ? (
          <>
            <span>/</span>
            <Link
              href={`/works#${familyAnchor(work.artifactType, family.id)}`}
              className="hover:text-zinc-800"
            >
              {tt(family.label)}
            </Link>
          </>
        ) : null}
      </nav>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <WorksViewer work={work} payload={payload} extracted={extracted} />
        </div>

        <aside className="w-full shrink-0 lg:w-80">
          <h1 className="text-xl font-semibold text-zinc-900">{work.title}</h1>
          {work.summary && <p className="mt-2 text-sm leading-relaxed text-zinc-600">{work.summary}</p>}

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-zinc-400">{tt("类型")}</dt>
            <dd className="text-zinc-700">{tt(ARTIFACT_TYPE_LABELS[work.artifactType])}</dd>
            <dt className="text-zinc-400">{tt("查看方式")}</dt>
            <dd className="text-zinc-700">{tt(kind.label)}</dd>
            {work.styleId ? (
              <>
                <dt className="text-zinc-400">{tt("版面风格")}</dt>
                <dd className="text-zinc-700">{work.styleId}</dd>
              </>
            ) : null}
          </dl>

          {href ? (
            <a
              href={href}
              download
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              {tt("下载")}
            </a>
          ) : (
            <p className="mt-5 rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-center text-xs text-zinc-500">
              {tt("这一件只供站内查看，不提供下载。")}
            </p>
          )}

          {rows.length > 0 && (
            <section className="mt-6">
              <h2 className="text-xs font-semibold tracking-wide text-zinc-400">{tt("产线读数")}</h2>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-zinc-400">{k}</dt>
                    <dd className="text-zinc-700">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="mt-6">
            <h2 className="text-xs font-semibold tracking-wide text-zinc-400">{tt("署名与许可")}</h2>
            <ul className="mt-2 space-y-1.5 text-xs text-zinc-600">
              {work.attribution.map((a, i) => (
                <li key={i}>
                  {a.text} ·{" "}
                  {a.licenseUrl ? (
                    <a
                      href={a.licenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-700 hover:underline"
                    >
                      {a.licenseCode}
                    </a>
                  ) : (
                    a.licenseCode
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
