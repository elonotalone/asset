"use client";

import Link from "next/link";
import { useUI } from "@oceanleo/ui/i18n";
import {
  KIND_HINTS,
  KIND_LABELS,
  PLUGIN_GALLERY_POLICY,
  PLUGIN_GALLERY_TITLE,
  STATUS_HINTS,
  STATUS_LABELS,
  categoryLabel,
  isPluginRuntimeUrl,
  type PluginEntry,
} from "@/lib/plugin-gallery";
import { PluginGalleryRunner } from "@/components/PluginGalleryRunner";

// 一件工具的说明页。有实物的先显示真实 cover；F9 plan 侧车给出严格 `.app` 地址后，
// 再显示新窗口“打开使用”。没有合法地址就明确暂不可用，不在 asset 页面内运行代码。
//
// 这一页同样没有下载或安装入口：工具是打开就用的东西，不是能存到硬盘的素材。
// 没有实物的条目连「打开」都不给，给了就是把用户送去一个不存在的地方。

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const tt = useUI();
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">{tt(title)}</h2>
      <div className="mt-2 text-sm leading-7 text-zinc-600">{children}</div>
    </section>
  );
}

function Bullets({ lines }: { lines: string[] }) {
  const tt = useUI();
  return (
    <ul className="space-y-1.5">
      {lines.map((line) => (
        <li key={line} className="flex gap-2">
          <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-sky-400" />
          <span>{tt(line)}</span>
        </li>
      ))}
    </ul>
  );
}

export function PluginGalleryDetail({
  item,
  previewPath = null,
  runtimeUrl = null,
}: {
  item: PluginEntry;
  /** manifest 中有对应实例时给真实 cover；它本身不可执行，可以安全留在 public。 */
  previewPath?: string | null;
  /** 只来自 F9 plan 侧车；缺失或歪地址时必须保持 null。 */
  runtimeUrl?: string | null;
}) {
  const tt = useUI();
  const shipped = item.status === "shipped";
  const runnable = isPluginRuntimeUrl(runtimeUrl);
  const hasPreview = previewPath !== null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <Link
        href="/plugin-gallery"
        className="text-sm text-sky-600 hover:underline"
      >
        {tt("← 回到{title}", { title: tt(PLUGIN_GALLERY_TITLE) })}
      </Link>

      <header className="mt-3 rounded-3xl bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 px-6 py-8 text-white">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold sm:text-3xl">
            {tt(item.name)}
          </h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              runnable || shipped ? "bg-white/25" : "bg-black/25"
            }`}
          >
            {runnable ? tt("现在可以使用") : tt(STATUS_LABELS[item.status])}
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/90">
          {tt(item.summary)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/85">
          <span className="rounded-full bg-white/15 px-3 py-1">
            {tt(categoryLabel(item.category))}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1">
            {tt(KIND_LABELS[item.kind])}
          </span>
        </div>
      </header>

      <div className="mt-4 grid gap-4">
        {hasPreview ? (
          <PluginGalleryRunner
            item={item}
            previewPath={previewPath}
            runtimeUrl={runtimeUrl}
          />
        ) : null}

        <Section title="你能用它干什么">
          <Bullets lines={item.does} />
        </Section>

        <Section title="什么时候会想要它">
          <Bullets lines={item.scenarios} />
        </Section>

        <Section title="要先准备什么，做完能带走什么">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-zinc-50 p-4">
              <dt className="text-xs font-semibold text-zinc-500">
                {tt("打开它之前")}
              </dt>
              <dd className="mt-1">{tt(item.input)}</dd>
            </div>
            <div className="rounded-xl bg-zinc-50 p-4">
              <dt className="text-xs font-semibold text-zinc-500">
                {tt("做完之后")}
              </dt>
              <dd className="mt-1">{tt(item.output)}</dd>
            </div>
          </dl>
        </Section>

        <Section title="第一次打开会看到什么">{tt(item.firstOpen)}</Section>

        <Section title="在哪儿能用">
          <p>{tt(item.where)}</p>
          <p className="mt-2 text-xs text-zinc-500">{tt(KIND_HINTS[item.kind])}</p>
        </Section>

        {item.caution ? (
          <Section title="有一个前提要说清">{tt(item.caution)}</Section>
        ) : null}

        <Section title="它现在到底能不能用">
          <p
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
              runnable || shipped
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
            }`}
          >
            {runnable
              ? tt("能用：点击上方的「打开使用」进入")
              : hasPreview
                ? tt("暂不可用：安全运行地址尚未生成")
                : tt(STATUS_LABELS[item.status])}
          </p>
          {/* 安全运行入口与平台入口是两件事：能从展厅打开，不等于 app 里已经有它的入口。
              两句都说，才不会把「能试」说成「已上线」。 */}
          {runnable ? (
            <p className="mt-2">
              {tt("它会在隔离的安全站点中打开，不用登录，也不会读取本站登录状态。")}
            </p>
          ) : hasPreview ? (
            <p className="mt-2">
              {tt("可以先看实际界面；安全地址准备好之前，不会回退到本站运行。")}
            </p>
          ) : null}
          <p className="mt-2">{tt(STATUS_HINTS[item.status])}</p>
          <p className="mt-2 text-xs leading-6 text-zinc-500">
            {tt("这么标的依据：")}
            {tt(item.statusNote)}
          </p>
          <p className="mt-2 text-xs leading-6 text-zinc-400">
            {tt("产品目标出处：")}
            {item.specPath}
          </p>
        </Section>

        <Section title="为什么这里没有可以带走的文件">
          {tt(PLUGIN_GALLERY_POLICY.reason)}
        </Section>
      </div>
    </div>
  );
}
