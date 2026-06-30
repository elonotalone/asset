"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { TemplateMeta } from "@/lib/template-taxonomy";

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_W: Record<Device, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

export function TemplatePreview({
  meta,
  html,
  siblings,
  pages,
}: {
  meta: TemplateMeta;
  html: string;
  siblings: TemplateMeta[];
  pages?: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [device, setDevice] = useState<Device>("desktop");
  const [activePage, setActivePage] = useState(pages?.[0]?.key ?? "home");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function goPage(key: string) {
    setActivePage(key);
    iframeRef.current?.contentWindow?.postMessage({ __leoGo: key }, "*");
  }

  // 全屏预览期间锁住页面滚动：避免任何残留的其它路由内容在预览背后被滚出来，
  // 也保证 fixed 覆盖层之外不出现可滚动的空白。
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-100">
      {/* 顶部预览工具条 */}
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/templates")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            返回模板库
          </button>
          <div className="hidden sm:block truncate">
            <span className="text-sm font-semibold text-zinc-800">{meta.title}</span>
            <span className="ml-2 text-xs text-zinc-400">{meta.industryLabel}</span>
          </div>
        </div>

        {/* 设备切换 */}
        <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
          {(["desktop", "tablet", "mobile"] as Device[]).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                device === d ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {d === "desktop" ? "电脑" : d === "tablet" ? "平板" : "手机"}
            </button>
          ))}
        </div>
      </header>

      {/* 多页导航条（点击在预览内切页） */}
      {pages && pages.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-2">
          <span className="mr-1 shrink-0 text-xs text-zinc-400">页面</span>
          {pages.map((pg) => (
            <button
              key={pg.key}
              onClick={() => goPage(pg.key)}
              className={`shrink-0 rounded-full px-3.5 py-1 text-xs font-medium transition ${
                activePage === pg.key
                  ? "bg-sky-500 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {pg.label}
            </button>
          ))}
          <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600">
            {pages.length} 个页面 · 多页模板
          </span>
        </div>
      )}

      {/* 预览画布 */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className="mx-auto h-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all"
          style={{ width: DEVICE_W[device], maxWidth: "100%" }}
        >
          <iframe
            ref={iframeRef}
            title={meta.title}
            srcDoc={html}
            className="h-full w-full"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>

      {/* 同类推荐 */}
      {siblings.length > 0 && (
        <footer className="border-t border-zinc-200 bg-white px-4 py-3">
          <div className="mb-2 text-xs font-medium text-zinc-400">同类模板</div>
          <div className="flex gap-2 overflow-x-auto">
            {siblings.map((s) => (
              <button
                key={s.slug}
                onClick={() => router.push(`/templates/${s.slug}`)}
                className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-sky-400 hover:text-sky-600"
              >
                {s.title}
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
