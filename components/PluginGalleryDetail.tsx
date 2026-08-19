"use client";

import Link from "next/link";
import { useUI } from "@oceanleo/ui/i18n";
import {
  OPEN_HINT,
  PLUGIN_GALLERY_POLICY,
  PLUGIN_GALLERY_TITLE,
  categoryLabel,
  editorAccessForPlugin,
  isEditorEntrypointUrl,
  type PluginEditorAccess,
  type PluginEntry,
} from "@/lib/plugin-gallery";

// 一件编辑器的说明页。只有逐条核验过的第一方产品页才显示新窗口“打开使用”；
// 其余的如实说明为什么暂时不能匿名直达，并给出从「我的库」进入的下一步。
//
// 这一页没有下载或安装入口：编辑器是打开就用的东西，不是能存到硬盘的素材。
// 这一格也不再有任何在隔离域里跑的运行字节——22 件独立小工具已于 2026-08-19 下架，
// 所以这里没有 iframe、没有 `oceanleo.app` 入口、没有本站运行 fallback。

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

function EditorAccessPanel({
  access,
}: {
  access: PluginEditorAccess;
}) {
  const tt = useUI();
  const safeEntryUrl = isEditorEntrypointUrl(access.entryUrl)
    ? access.entryUrl
    : null;

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          {tt("现在从哪里开始")}
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            safeEntryUrl
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
          }`}
        >
          {safeEntryUrl ? tt("可以直接打开") : tt("暂不能匿名直达")}
        </span>
      </div>

      {safeEntryUrl ? (
        <>
          <p className="mt-3 text-sm leading-7 text-zinc-600">
            {tt("这个入口已用登出状态与被调用方代码逐项核验；会在 OceanLeo 第一方编辑器的新窗口中打开。")}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={safeEntryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              {tt("打开使用")}
            </a>
            <Link
              href={access.demoHref}
              className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200"
            >
              {tt("查看真实示例：{name}", { name: tt(access.demoName) })}
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm leading-7 text-zinc-600">
            {tt(access.unavailableReason)}
          </p>
          <p className="mt-2 text-sm leading-7 text-zinc-600">
            {tt(access.nextStep)}
          </p>
          <Link
            href={access.demoHref}
            className="mt-4 inline-flex rounded-full bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-100"
          >
            {tt("先查看真实素材：{name}", { name: tt(access.demoName) })}
          </Link>
        </>
      )}
    </section>
  );
}

export function PluginGalleryDetail({ item }: { item: PluginEntry }) {
  const tt = useUI();
  const editorAccess = editorAccessForPlugin(item);
  const available = isEditorEntrypointUrl(editorAccess?.entryUrl);

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
              available ? "bg-white/25" : "bg-black/25"
            }`}
          >
            {available ? tt("现在可以使用") : tt("入口尚未接通")}
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
            {tt("打开一件素材来用")}
          </span>
        </div>
      </header>

      <div className="mt-4 grid gap-4">
        {editorAccess ? (
          <EditorAccessPanel access={editorAccess} />
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
          <p className="mt-2 text-xs text-zinc-500">{tt(OPEN_HINT)}</p>
        </Section>

        {item.caution ? (
          <Section title="有一个前提要说清">{tt(item.caution)}</Section>
        ) : null}

        <Section title="它现在到底能不能用">
          <p
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
              available
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
            }`}
          >
            {available
              ? tt("能用：已有经过核验的编辑器入口")
              : tt("暂不可用：入口尚未接通")}
          </p>
          {/* 编辑器入口与平台入口是两件事：能从这一页打开，不等于 app 里已经有它的入口。
              两句都说，才不会把「能试」说成「已上线」。 */}
          {available ? (
            <p className="mt-2">
              {tt("它会在经过核验的第一方编辑器中打开，不与其他运行入口混用。")}
            </p>
          ) : editorAccess ? (
            <>
              <p className="mt-2">{tt(editorAccess.unavailableReason)}</p>
              <p className="mt-2">{tt(editorAccess.nextStep)}</p>
            </>
          ) : (
            <p className="mt-2">
              {tt("经过核验的入口出现后，这一页会自动显示「打开使用」；在此之前不会回退到本站运行。")}
            </p>
          )}
          <p className="mt-2 text-xs leading-6 text-zinc-500">
            {tt("能力与接入依据：")}
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
