"use client";

import { useState } from "react";
import type { TemplateMeta } from "@/lib/template-taxonomy";
import { paletteFor, photo, photoFallback, skeletonIndexFor } from "@/lib/template-engine";

// 轻量缩略图：用「迷你浏览器框 + 行业配图 + 与该模板同色系的迷你版式」表现
// 每个模板的真实观感，而不是在网格里塞 525 个重量级 iframe。点开才渲染整页。
export function TemplateThumb({
  meta,
  href,
}: {
  meta: TemplateMeta;
  href: string;
}) {
  const p = paletteFor(meta.paletteKey);
  const [loaded, setLoaded] = useState(false);
  const skel = skeletonIndexFor(meta);
  const img = photo(meta.photo, meta.hot, 600, 400);

  return (
    // 真链接 + target=_blank：点开后浏览器整页加载这个模板网站本身（route.ts
    // 返回的纯 HTML 文档），完全独立、可深链、可分享，不再嵌在素材库壳里。
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
    >
      {/* 迷你浏览器预览 */}
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-50">
        {/* 顶部地址栏 */}
        <div className="flex items-center gap-1.5 bg-white px-3 py-2 border-b border-zinc-100">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="h-2 w-2 rounded-full bg-green-400" />
          <span className="ml-2 h-3 flex-1 rounded bg-zinc-100" />
        </div>

        {/* 迷你站点内容（按骨架变体微调版式） */}
        <MiniLayout meta={meta} skel={skel} p={p} img={img} loaded={loaded} onLoad={() => setLoaded(true)} />

        {/* 多页徽标 */}
        <span className="absolute right-2 top-[41px] z-10 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-emerald-600 shadow-sm">
          多页 · {meta.layoutLabel}
        </span>

        {/* 悬停遮罩 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
          <span className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-900 shadow-lg">预览模板</span>
        </div>
      </div>

      {/* 卡片底部信息 */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-800">{meta.subLabel}</div>
          <div className="truncate text-xs text-zinc-400">{meta.industryLabel}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs text-zinc-400">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          {meta.hot.toLocaleString()}
        </div>
      </div>
    </a>
  );
}

function MiniLayout({
  meta,
  skel,
  p,
  img,
  loaded,
  onLoad,
}: {
  meta: TemplateMeta;
  skel: number;
  p: ReturnType<typeof paletteFor>;
  img: string;
  loaded: boolean;
  onLoad: () => void;
}) {
  const grad = `linear-gradient(135deg, ${p.gradFrom}, ${p.gradTo})`;

  // 骨架 1 (hero image) / 3 (split) → 大图主导；骨架 0/2 → 渐变/留白主导。
  const heroImage = skel === 1 || skel === 3;

  return (
    <div className="absolute inset-0 top-[33px] flex flex-col">
      {/* 迷你导航条 */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ background: heroImage ? "transparent" : "#fff" }}>
        <span className="h-2 w-2 rounded-sm" style={{ background: p.primary }} />
        <span className="text-[7px] font-bold" style={{ color: heroImage ? "#fff" : p.ink }}>{meta.subLabel}</span>
        <span className="ml-auto flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-3 rounded-full" style={{ background: heroImage ? "rgba(255,255,255,.6)" : "#e5e7eb" }} />
          ))}
        </span>
      </div>

      {/* hero */}
      <div className="relative flex-1">
        <img
          src={img}
          alt={meta.subLabel}
          loading="lazy"
          onLoad={onLoad}
          onError={(e) => {
            const el = e.currentTarget;
            if (el.dataset.fb) {
              el.style.visibility = "hidden";
            } else {
              el.dataset.fb = "1";
              el.src = photoFallback(meta.hot, 600, 400);
            }
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
        {!heroImage && <div className="absolute inset-0 thumb-grad-anim" style={{ background: grad, opacity: 0.88 }} />}
        {heroImage && <div className="absolute inset-0 thumb-grad-anim" style={{ background: grad, opacity: 0.5 }} />}
        <div className={`absolute inset-0 flex flex-col justify-center gap-1 px-3 ${skel === 3 ? "items-start" : "items-center text-center"}`}>
          <div className="text-[9px] font-extrabold leading-tight text-white drop-shadow">{shortTitle(meta.subLabel)}</div>
          <div className="h-1 w-16 rounded-full bg-white/70" />
          <div className="h-1 w-10 rounded-full bg-white/50" />
          <span className="mt-1 rounded-full px-2 py-0.5 text-[6px] font-semibold text-white" style={{ background: p.primary }}>立即咨询</span>
        </div>
      </div>

      {/* 迷你内容条（特色卡片） */}
      <div className="flex gap-1 px-2.5 py-1.5" style={{ background: p.soft }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 rounded-sm bg-white p-1 shadow-sm">
            <span className="block h-1.5 w-1.5 rounded-sm" style={{ background: p.primary }} />
            <span className="mt-0.5 block h-0.5 w-full rounded bg-zinc-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

function shortTitle(s: string): string {
  return s.length > 6 ? s.slice(0, 6) : s;
}
