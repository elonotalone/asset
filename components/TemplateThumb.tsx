"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { useUI } from "@oceanleo/ui/i18n";
import type { TemplateMeta } from "@/lib/template-taxonomy";
import { paletteFor, photo, photoFallback, skeletonIndexFor } from "@/lib/template-engine";
import { templateThumbUrl } from "@/lib/template-thumb-url";

// 缩略图 = 每个模板整页 HTML 的**真实首屏截图**（离线渲染 → OSS webp，见
// lib/template-thumb-url.ts）。模板库唯一的吸引力来自「让用户直接看到模板长什么样」
// （对标稿定 / 云·速成美站）。截图缺失 / 加载失败时，回退到旧的合成迷你版式
// （下方 MiniSignature / MiniLayout），保证网格永不破图。
export function TemplateThumb({
  meta,
  href,
}: {
  meta: TemplateMeta;
  href: string;
}) {
  const tt = useUI();
  const p = paletteFor(meta.paletteKey);
  const [loaded, setLoaded] = useState(false);
  const [shotLoaded, setShotLoaded] = useState(false);
  const [shotFailed, setShotFailed] = useState(false);
  const skel = skeletonIndexFor(meta);
  const img = photo(meta.subKey, meta.hot, 600, 400);
  const shot = templateThumbUrl(meta.slug);

  // ref 回调：img 从缓存瞬时加载时，onLoad 可能在 React 绑定前就已触发，
  // 导致 shotLoaded 永远为 false、图片卡在 opacity-0（灰占位）。挂载时直接
  // 查 complete/naturalWidth 兜底，覆盖这个经典 race。
  const shotRef = useCallback((el: HTMLImageElement | null) => {
    if (!el) return;
    if (el.complete) {
      if (el.naturalWidth > 0) setShotLoaded(true);
      else setShotFailed(true);
    }
  }, []);

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
        <div className="relative z-10 flex items-center gap-1.5 bg-white px-3 py-2 border-b border-zinc-100">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="h-2 w-2 rounded-full bg-green-400" />
          <span className="ml-2 h-3 flex-1 rounded bg-zinc-100" />
        </div>

        {shotFailed ? (
          // 回退：截图不可用 → 旧的合成迷你版式（特色家族专属 / 通用骨架）。
          SIGNATURE_KEYS.has(meta.layoutKey) ? (
            <MiniSignature meta={meta} p={p} img={img} loaded={loaded} onLoad={() => setLoaded(true)} />
          ) : (
            <MiniLayout meta={meta} skel={skel} p={p} img={img} loaded={loaded} onLoad={() => setLoaded(true)} />
          )
        ) : (
          // 主路径：真实整页首屏截图，填满地址栏下方区域。
          <div className="absolute inset-0 top-[33px]">
            {/* 加载前的占位骨架（避免闪白） */}
            {!shotLoaded && (
              <div
                className="absolute inset-0 animate-pulse"
                style={{ background: `linear-gradient(135deg, ${p.gradFrom}, ${p.gradTo})`, opacity: 0.25 }}
              />
            )}
            <Image
              ref={shotRef}
              src={shot}
              alt={meta.subLabel}
              width={960}
              height={720}
              unoptimized
              loading="lazy"
              decoding="async"
              onLoad={() => setShotLoaded(true)}
              onError={() => setShotFailed(true)}
              className={`h-full w-full object-cover object-top transition-opacity duration-500 ${shotLoaded ? "opacity-100" : "opacity-0"}`}
            />
          </div>
        )}

        {/* 多页徽标 */}
        <span className="absolute right-2 top-[41px] z-10 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-emerald-600 shadow-sm">
          {tt("多页 · {label}", { label: meta.layoutLabel })}
        </span>

        {/* 悬停遮罩 */}
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
          <span className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-900 shadow-lg">{tt("预览模板")}</span>
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
  const tt = useUI();
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
        <Image
          src={img}
          alt={meta.subLabel}
          width={600}
          height={400}
          unoptimized
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
        {/* 无图骨架：渐变主导（本就没照片可保）。有图骨架：方向性暗角保住照片本体，
            只压文字区——对齐整页 hero 的可读性遮罩做法，杜绝「照片被糊成一坨色」。 */}
        {!heroImage && <div className="absolute inset-0 thumb-grad-anim" style={{ background: grad, opacity: 0.82 }} />}
        {heroImage && (
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(ellipse 92% 82% at 50% 50%,rgba(0,0,0,.42),rgba(0,0,0,.2) 48%,rgba(0,0,0,.08))" }}
          />
        )}
        <div className={`absolute inset-0 flex flex-col justify-center gap-1 px-3 ${skel === 3 ? "items-start" : "items-center text-center"}`}>
          <div className="text-[9px] font-extrabold leading-tight text-white drop-shadow">{shortTitle(meta.subLabel)}</div>
          <div className="h-1 w-16 rounded-full bg-white/70" />
          <div className="h-1 w-10 rounded-full bg-white/50" />
          <span className="mt-1 rounded-full px-2 py-0.5 text-[6px] font-semibold text-white" style={{ background: p.primary }}>{tt("立即咨询")}</span>
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

// v3 特色家族的迷你预览：让缩略图在网格里就「一眼不同」，而非全是同款卡片墙。
const SIGNATURE_KEYS = new Set(["editorial", "neon-tech", "fullscreen-scroll", "bento", "brutalist"]);

function MiniSignature({
  meta,
  p,
  img,
  loaded,
  onLoad,
}: {
  meta: TemplateMeta;
  p: ReturnType<typeof paletteFor>;
  img: string;
  loaded: boolean;
  onLoad: () => void;
}) {
  const tt = useUI();
  const grad = `linear-gradient(135deg, ${p.gradFrom}, ${p.gradTo})`;
  const Img = (
    <Image
      src={img}
      alt={meta.subLabel}
      width={600}
      height={400}
      unoptimized
      loading="lazy"
      onLoad={onLoad}
      onError={(e) => {
        const el = e.currentTarget;
        if (el.dataset.fb) el.style.visibility = "hidden";
        else {
          el.dataset.fb = "1";
          el.src = photoFallback(meta.hot, 600, 400);
        }
      }}
      className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );

  // 深色霓虹：黑底 + 荧光大字 + 网格 + 玻璃小卡。
  if (meta.layoutKey === "neon-tech") {
    return (
      <div className="absolute inset-0 top-[33px] flex flex-col overflow-hidden" style={{ background: p.soft }}>
        <div
          className="absolute inset-0 opacity-40"
          style={{ backgroundImage: `linear-gradient(${p.primary}55 1px,transparent 1px),linear-gradient(90deg,${p.primary}55 1px,transparent 1px)`, backgroundSize: "14px 14px" }}
        />
        <div className="relative flex-1 flex flex-col items-center justify-center px-3 text-center">
          <div className="text-[10px] font-extrabold leading-tight" style={{ color: p.ink, textShadow: `0 0 8px ${p.primary}` }}>{shortTitle(meta.subLabel)}</div>
          <div className="mt-1 h-1 w-12 rounded-full" style={{ background: p.primary, boxShadow: `0 0 8px ${p.primary}` }} />
          <span className="mt-1.5 rounded-full px-2 py-0.5 text-[6px] font-semibold text-white" style={{ background: p.primary, boxShadow: `0 0 10px ${p.primary}88` }}>{tt("立即咨询")}</span>
        </div>
        <div className="relative flex gap-1 px-2.5 py-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-1 rounded-sm p-1" style={{ background: "rgba(255,255,255,.08)", border: `1px solid ${p.primary}44` }}>
              <span className="block h-1 w-1 rounded-sm" style={{ background: p.primary }} />
              <span className="mt-0.5 block h-0.5 w-full rounded" style={{ background: `${p.primary}44` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 杂志编辑：白底 + 衬线大标题 + 细横线 + 非对称。
  if (meta.layoutKey === "editorial") {
    return (
      <div className="absolute inset-0 top-[33px] flex flex-col bg-white px-3 py-2">
        <div className="text-[6px] tracking-[0.2em] uppercase" style={{ color: p.sub }}>{meta.industryLabel}</div>
        <div className="mt-1 font-black leading-none" style={{ fontFamily: "Georgia, serif", fontSize: "15px", color: p.ink }}>{shortTitle(meta.subLabel)}</div>
        <div className="mt-1.5 h-[2px] w-full" style={{ background: p.ink }} />
        <div className="mt-1.5 flex-1 overflow-hidden rounded-sm">{Img}</div>
        <div className="mt-1 flex gap-2">
          <span className="h-0.5 flex-1 rounded" style={{ background: "#e5e7eb" }} />
          <span className="h-0.5 w-4 rounded" style={{ background: p.primary }} />
        </div>
      </div>
    );
  }

  // 全屏叙事：整块满图 + 底部大字压图。
  if (meta.layoutKey === "fullscreen-scroll") {
    return (
      <div className="absolute inset-0 top-[33px] overflow-hidden">
        <div className="absolute inset-0">{Img}</div>
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,transparent,rgba(0,0,0,.72))" }} />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="text-[11px] font-extrabold leading-tight text-white drop-shadow">{shortTitle(meta.subLabel)}</div>
          <div className="mt-1 h-1 w-10 rounded-full bg-white/70" />
        </div>
        <span className="absolute right-2 top-2 flex flex-col gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-1 rounded-full" style={{ background: i === 0 ? "#fff" : "rgba(255,255,255,.5)" }} />
          ))}
        </span>
      </div>
    );
  }

  // 便当格栅：不规则圆角块拼贴。
  if (meta.layoutKey === "bento") {
    return (
      <div className="absolute inset-0 top-[33px] grid grid-cols-3 grid-rows-2 gap-1 p-1.5" style={{ background: p.soft }}>
        <div className="col-span-2 row-span-2 relative overflow-hidden rounded-lg text-white" style={{ background: grad }}>
          <div className="absolute inset-0 flex flex-col justify-end p-2">
            <div className="text-[9px] font-extrabold leading-tight drop-shadow">{shortTitle(meta.subLabel)}</div>
            <div className="mt-0.5 h-0.5 w-8 rounded bg-white/70" />
          </div>
        </div>
        <div className="relative overflow-hidden rounded-lg">{Img}</div>
        <div className="rounded-lg flex items-center justify-center" style={{ background: "#fff" }}>
          <span className="text-[10px] font-extrabold" style={{ color: p.primary }}>{meta.hot % 90 + 10}%</span>
        </div>
      </div>
    );
  }

  // 粗野主义：粗黑描边 + 硬阴影 + 撞色 + 直角。
  return (
    <div className="absolute inset-0 top-[33px] flex flex-col p-2" style={{ background: p.gradFrom }}>
      <div className="inline-block self-start px-1 py-0.5 text-[6px] font-black uppercase" style={{ background: p.ink, color: "#fff" }}>{meta.industryLabel}</div>
      <div className="mt-1 font-black uppercase leading-none" style={{ fontSize: "15px", color: p.ink, letterSpacing: "-0.02em" }}>{shortTitle(meta.subLabel)}</div>
      <div className="mt-1.5 flex-1 overflow-hidden" style={{ border: `2px solid ${p.ink}`, boxShadow: `3px 3px 0 ${p.ink}` }}>{Img}</div>
      <div className="mt-1.5 self-start px-2 py-0.5 text-[6px] font-black uppercase text-white" style={{ background: p.primary, border: `2px solid ${p.ink}` }}>{tt("立即咨询")}</div>
    </div>
  );
}
