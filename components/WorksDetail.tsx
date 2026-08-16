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
  workflowDocRows,
  type ExtractedContent,
  type WorkEntry,
  type WorkWorkflow,
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

/**
 * 这条产线的三到四份文档摆在哪里。
 *
 * **故意不是链接。** 这些文档在文档仓（`/opt/cursor-workspaces/oceandino`）里，
 * 不在本站的 public 下，做成 `<a href>` 点开必然 404。给路径文本，是为了能直接
 * 拿去打开文件 —— 一个点了没反应的链接比一段可复制的路径更糟。
 */
function WorkflowDocs({ workflow }: { workflow: WorkWorkflow }) {
  const tt = useUI();
  return (
    <section className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 py-2.5">
      <h2 className="text-xs font-semibold tracking-wide text-zinc-500">
        {tt("这条产线的文档")}
      </h2>
      <dl className="mt-1.5 space-y-1.5">
        {workflowDocRows(workflow).map(([label, path]) => (
          <div key={label}>
            <dt className="text-[11px] text-zinc-400">{tt(label)}</dt>
            <dd className="break-all font-mono text-[10px] leading-4 text-zinc-600">{path}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] leading-5 text-zinc-400">
        {tt("这几份文档在文档仓里，不在本站，所以只给路径、不做成链接。")}
      </p>
    </section>
  );
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

          {/* 直接落到详情页的用户看不到类型页那条横幅，同一件事在这里再说一次。
              说的是「这一类不再自产」，不是「这一件下架了」——它照常可看可下。 */}
          {work.production ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-6 text-amber-900">
              <span className="mr-1.5 rounded bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-medium">
                {tt("存量")}
              </span>
              {tt(work.production.notice)}
              {tt("这一件本身没有变化，照常查看与下载。")}
            </p>
          ) : null}

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
            {work.workflow ? (
              <>
                <dt className="text-zinc-400">{tt("工作流")}</dt>
                <dd className="text-zinc-700">
                  {tt(work.workflow.name)}
                  <span className="mt-0.5 block break-all font-mono text-[10px] text-zinc-400">
                    {work.workflow.id}
                  </span>
                </dd>
              </>
            ) : null}
          </dl>

          {work.workflow ? <WorkflowDocs workflow={work.workflow} /> : null}

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
