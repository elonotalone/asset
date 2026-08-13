"use client";

import { useUI } from "@oceanleo/ui/i18n";
import {
  isPluginRuntimeUrl,
  type PluginEntry,
} from "@/lib/plugin-gallery";

// UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
// asset 只显示不可执行的 cover；工具本人只能在 F9 命名空间 C 的新窗口里打开。
// URL 不合法或 plan 侧车缺失时只显示“暂不可用”，没有 iframe 或本站 fallback。
const PREVIEW_PATH =
  /^\/previews\/tools\/[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?\.cover\.webp$/;

export function PluginGalleryRunner({
  item,
  previewPath,
  runtimeUrl,
}: {
  item: PluginEntry;
  previewPath: string | null;
  runtimeUrl: string | null;
}) {
  const tt = useUI();
  const safePreview = previewPath && PREVIEW_PATH.test(previewPath) ? previewPath : null;
  const safeRuntimeUrl = isPluginRuntimeUrl(runtimeUrl) ? runtimeUrl : null;

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">{tt("实际界面预览")}</h2>
      </div>
      {safePreview ? (
        // 这三张已是固定尺寸 WebP 成品；保留直接 public URL，避免预览被改写成可执行代理路径。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safePreview}
          alt={tt("{name}实际界面预览", { name: tt(item.name) })}
          width={1200}
          height={750}
          loading="lazy"
          className="aspect-[8/5] w-full bg-zinc-50 object-contain"
        />
      ) : (
        <div className="grid aspect-[8/5] place-items-center bg-zinc-50 px-5 text-sm text-zinc-500">
          {tt("预览暂不可用")}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 px-5 py-4">
        {safeRuntimeUrl ? (
          <a
            href={safeRuntimeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            {tt("打开使用")}
          </a>
        ) : (
          <span
            role="status"
            className="rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 ring-1 ring-amber-200"
          >
            {tt("暂不可用")}
          </span>
        )}
        <p className="text-xs leading-6 text-zinc-500">
          {safeRuntimeUrl
            ? tt("将在隔离的安全站点中打开，不会读取本网站的登录状态。")
            : tt("安全运行地址尚未生成；不会改用本站地址打开。")}
        </p>
      </div>
    </section>
  );
}
