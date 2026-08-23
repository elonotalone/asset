"use client";

import { useState } from "react";
import { useUI } from "@oceanleo/ui/i18n";
import {
  EXTRACT_SOURCE_LABELS,
  isActiveRuntimeUrl,
  type DeckSlide,
  type DocBlock,
  type ExtractedContent,
  type ExtractedSheet,
  type PdfPage,
  type WorkEntry,
  type WorkSheet,
} from "@/components/WorksKinds";

// 成品查看器。**每一类都要真的把东西打开给人看**，不是把封面放大，
// 更不是把字节当文字摆出来（那正是这一波在修的病：网站预览一屏乱码）。
//
// 打不开的时候诚实说打不开 + 给下载，不编造画面。
//
// 安全：主动内容在这里一律不 iframe、不 srcdoc。game / website 只显示结构化源与
// cover；运行按钮必须再次通过精确 namespace-C URL 校验，并在新窗口打开。
// 可执行 HTML/JS/CSS 只由 *.oceanleo.app 提供，见 UC-1。

export type WorkPayload = unknown;

function Fallback({ work, reason }: { work: WorkEntry; reason: string }) {
  const tt = useUI();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={work.cover} alt={work.title} className="max-h-[60vh] w-auto rounded-lg shadow-sm" />
      <p className="text-center text-xs text-zinc-500">{tt(reason)}</p>
    </div>
  );
}

/* ---------------- design-document：逐元素渲染成画面 ---------------- */

interface DesignElement {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z?: number;
  rotationDeg?: number;
  opacity?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  text?: string;
  fontFamily?: string;
  fontSizePx?: number;
  fontWeight?: number;
  lineHeight?: number;
  align?: "left" | "center" | "right" | "justify";
  assetId?: string;
  alt?: string;
  fit?: "cover" | "contain" | "fill";
  pathData?: string;
}

interface DesignDoc {
  width?: number;
  height?: number;
  background?: string;
  elements?: DesignElement[];
}

function designDocOf(payload: WorkPayload): DesignDoc | null {
  if (!payload || typeof payload !== "object") return null;
  const doc = (payload as Record<string, unknown>).document;
  if (!doc || typeof doc !== "object") return null;
  const d = doc as DesignDoc;
  if (!Array.isArray(d.elements)) return null;
  return d;
}

// 工程文件里没有 fontFamily、或指名的美术字缺这个字（拉丁 display 字没有汉字）时
// 落到这一族。光栅器的默认脸就是 Noto Sans CJK SC（assemblers/composite/font.mjs 的
// PREFERRED_FACES），`Source Han Sans CN` 是同一副字、且是字体台账里 approved 的那个名 ——
// 两边兜底到同一副脸，才不会「站内是系统 UI 字、封面是思源黑」。
const POSTER_FALLBACK_STACK = '"Source Han Sans CN", sans-serif';

/** 工程文件的 fontFamily 后面接同一条兜底链。已经自带兜底链的原样用。 */
function posterFontFamily(family?: string): string {
  const named = family?.trim();
  if (!named) return POSTER_FALLBACK_STACK;
  const bare = named.replace(/^["']|["']$/g, "");
  // 指名的就是兜底那一款时不再重复接一遍（`"X", "X", sans-serif` 是同一个意思，
  // 但读起来像有人把兜底链拼了两次）。
  if (`"${bare}", sans-serif` === POSTER_FALLBACK_STACK) return POSTER_FALLBACK_STACK;
  const first = named.includes(",") ? named : `"${bare}"`;
  return `${first}, ${POSTER_FALLBACK_STACK}`;
}

// 画布尺寸按容器宽度自适应：所有尺寸换算成百分比，字号与**所有绝对像素量**
// （圆角、描边宽）换算成 cqw（1cqw = 容器宽度的 1%）。
// 圆角与描边不换算是真会看出来的错：容器 896px、画布 1240px 时，
// radius:40 在站内画成 40 屏幕像素，在封面上却是 40 画布单位（≈29 屏幕像素）。
function FlatDocumentViewer({ work, payload }: { work: WorkEntry; payload: WorkPayload }) {
  const tt = useUI();
  const doc = designDocOf(payload);
  if (!doc) return <Fallback work={work} reason="这份设计稿的结构读不出来，先看封面。" />;

  const W = typeof doc.width === "number" && doc.width > 0 ? doc.width : 1240;
  const H = typeof doc.height === "number" && doc.height > 0 ? doc.height : 1754;
  const elements = [...(doc.elements ?? [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const pct = (v: number, base: number) => `${(v / base) * 100}%`;
  /** 画布单位 → 随容器缩放的长度。0 保持 0，别写成 "0cqw" 让人以为是别的东西。 */
  const cq = (v: number) => (v > 0 ? `${(v / W) * 100}cqw` : 0);

  return (
    <div
      className="mx-auto w-full overflow-hidden rounded-xl border border-zinc-200 shadow-sm"
      style={{
        containerType: "inline-size",
        aspectRatio: `${W} / ${H}`,
        background: doc.background ?? "#FFFFFF",
        position: "relative",
        maxWidth: "min(100%, 56rem)",
        // 排字复位。文字与它背后的高亮块严丝合缝，靠的是「站内量出来的字宽
        // 等于 W1 量出来的字宽」；下面任何一项被祖先或 Tailwind preflight 改动，
        // 块和字就错开，所以在这里显式钉死，不靠继承。
        fontFamily: POSTER_FALLBACK_STACK,
        letterSpacing: "normal",
        wordSpacing: "normal",
        textTransform: "none",
        fontKerning: "normal",
        fontFeatureSettings: "normal",
        fontVariationSettings: "normal",
        fontVariantLigatures: "normal",
        // 不许浏览器用合成粗体假冒 900 字重 —— 合成出来的字比光栅器胖一圈。
        fontSynthesis: "none",
        // 光栅器（napi-rs canvas / Skia）落的是灰度反锯齿，这里跟着要灰度，
        // 不要子像素。body 上那个 antialiased 恰好是灰度，但那是别人的类名，
        // 不能当依据，所以在这里自己写一遍。
        WebkitFontSmoothing: "antialiased",
        textRendering: "auto",
      }}
    >
      {elements.map((el, i) => {
        if (el.type === "group") return null;
        const x = typeof el.x === "number" ? el.x : 0;
        const y = typeof el.y === "number" ? el.y : 0;
        // width/height 缺失是已知的上游缺陷（合同 §1.4）。缺了不丢元素：
        // 横向铺到画布右边，纵向按字号给一行的高度。
        const w = typeof el.width === "number" && el.width > 0 ? el.width : Math.max(W - x, 1);
        const h =
          typeof el.height === "number" && el.height > 0
            ? el.height
            : Math.max((el.fontSizePx ?? 24) * (el.lineHeight ?? 1.35), 1);

        const box: React.CSSProperties = {
          position: "absolute",
          left: pct(x, W),
          top: pct(y, H),
          width: pct(w, W),
          height: pct(h, H),
          opacity: typeof el.opacity === "number" ? el.opacity : 1,
          transform: el.rotationDeg ? `rotate(${el.rotationDeg}deg)` : undefined,
          transformOrigin: "center",
        };

        const key = el.id ?? `el-${i}`;

        if (el.type === "text") {
          const size = el.fontSizePx ?? 24;
          return (
            <div
              key={key}
              style={{
                ...box,
                color: el.fill ?? "#1F2328",
                fontFamily: posterFontFamily(el.fontFamily),
                fontSize: `${(size / W) * 100}cqw`,
                fontWeight: el.fontWeight ?? 400,
                lineHeight: el.lineHeight ?? 1.35,
                textAlign: el.align ?? "left",
                whiteSpace: "pre-wrap",
                // 换行点必须和光栅器一致：拉丁词整体挪行、不拆词
                // （raster.mjs 的 tokenize 就是这么断的）。祖先上一个
                // break-words 会被继承下来把词拆开，所以显式复位。
                overflowWrap: "normal",
                wordBreak: "normal",
                overflow: "hidden",
              }}
            >
              {el.text}
            </div>
          );
        }

        if (el.type === "image" || el.type === "icon") {
          const src = el.assetId ? work.view.assets?.[el.assetId] : undefined;
          if (!src) {
            // 占位块看起来像一块设计，是已知的误判源：所以一定带上文案说明
            // 「这里本该有图、图没跟着文档来」，而不是留一块干净的浅灰。
            const missing = el.alt?.trim() || tt("图片");
            return (
              <div
                key={key}
                style={{
                  ...box,
                  background: "#EEF1F5",
                  borderRadius: cq(el.radius ?? 0),
                  paddingInline: "1cqw",
                }}
                className="flex items-center justify-center overflow-hidden text-center text-[10px] leading-tight text-zinc-400"
                role="img"
                aria-label={tt("{alt}（这一格的图没有随文档提供）", { alt: missing })}
                title={tt("{alt}（这一格的图没有随文档提供）", { alt: missing })}
              >
                {missing}
              </div>
            );
          }
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={key}
              src={src}
              alt={el.alt ?? ""}
              style={{
                ...box,
                objectFit: el.fit === "fill" ? "fill" : el.fit === "contain" ? "contain" : "cover",
                borderRadius: cq(el.radius ?? 0),
              }}
            />
          );
        }

        if (el.type === "path") {
          return (
            <svg
              key={key}
              style={{
                ...box,
                // svg 默认是 inline：这里虽然 position:absolute 已经把它变成块级，
                // 还是写明白，免得以后有人去掉定位就多出一段 baseline 间隙。
                display: "block",
                // **裁到盒子**，这是与光栅器约好的口径：`raster.mjs` 的 path 分支
                // 按 `rect(x,y,w,h)` 做 clip，理由是「svg viewport 默认 overflow:hidden」。
                // 这里显式写成 hidden，就是把那条默认变成写下来的契约 ——
                // 两边同裁，一份 `d` 画出盒子外的部分两边一起没有，不会一边有一边没。
                // ⇒ 骨架给 path 的盒子必须真的框住它的 `d`（见 W3 交付单给 W1/W5 的接口说明）。
                overflow: "hidden",
              }}
              viewBox={`${x} ${y} ${w} ${h}`}
              preserveAspectRatio="none"
              aria-label={el.alt}
            >
              <path
                d={el.pathData ?? ""}
                fill={el.fill ?? "none"}
                stroke={el.stroke ?? "none"}
                strokeWidth={el.strokeWidth ?? 0}
              />
            </svg>
          );
        }

        if (el.type === "line") {
          return (
            <div
              key={key}
              style={{
                ...box,
                height: pct(Math.max(el.strokeWidth ?? 2, 1), H),
                background: el.stroke ?? el.fill ?? "#7D8590",
              }}
            />
          );
        }

        // rect / ellipse / chart-embed 以及未知类型：按矩形块画，别把元素丢了。
        // 描边走 border-box（Tailwind preflight）压在盒子内侧，与光栅器一致。
        return (
          <div
            key={key}
            style={{
              ...box,
              background: el.fill ?? "transparent",
              border:
                el.stroke && (el.strokeWidth ?? 0) > 0
                  ? `${cq(el.strokeWidth ?? 0)} solid ${el.stroke}`
                  : undefined,
              borderRadius: el.type === "ellipse" ? "50%" : cq(el.radius ?? 0),
            }}
          />
        );
      })}
    </div>
  );
}

/* ---------------- props 形：站内 684 张模板与用户编辑器共用的那一套 ---------------- */

// 仲裁 01：统一流水线产的是这一套 —— 顶层 `spec` + `document.elements[].props`，
// `type ∈ {shape,text,image}`，几何键 `x/y/w/h/rotation/z/opacity`，图用 `props.src`。
// 上面那套 flat 形没有作废（存量四件封面还在用），所以这里是**多认一套**，不是替换。
// 两套都自称 `oceanleo.design-document.v1` ⇒ 只能按形状判，不能按版本号判。
//
// 几何、效果、常数**逐处对齐 `/root/projects/design/lib/render.ts`
// 的 `exportDocumentToSVG`**（684 张模板与用户真正的编辑器都走它，光栅器那侧
// 也要落到同一套口径）。对齐到「同样的 SVG 标签、同样的属性、同样的数字」这一级，
// 是为了让「站内点开看到的」与「货架封面」不各画一套 —— 两边错开半个字，
// 一眼就看出是机器拼的。
//
// 安全：`props.src` 只收 `https://` 与 `data:image/`；颜色、字体名、`d` 一律
// 走 React 属性，不拼 HTML、不 `dangerouslySetInnerHTML`（UC-1）。

interface PropsElement {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotation?: number;
  z?: number;
  opacity?: number;
  hidden?: boolean;
  props?: Record<string, unknown>;
}

interface PropsBackground {
  color?: string;
  gradient?: string;
  image?: string;
  opacity?: number;
  overlay?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  crop?: { x?: number; y?: number; w?: number; h?: number };
}

interface PropsDoc {
  width?: number;
  height?: number;
  background?: PropsBackground;
  elements?: PropsElement[];
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function strOf(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 文字渐变预设。取值与 `render.ts:33` 的 `TEXT_GRADIENTS` 逐条相同。 */
const TEXT_GRADIENTS: Record<string, string> = {
  sunset: "linear-gradient(90deg, #f97316, #ef4444, #db2777)",
  ocean: "linear-gradient(90deg, #06b6d4, #2563eb)",
  forest: "linear-gradient(90deg, #16a34a, #065f46)",
  gold: "linear-gradient(180deg, #fef08a, #fbbf24 45%, #d97706)",
  candy: "linear-gradient(90deg, #f472b6, #a855f7)",
  flame: "linear-gradient(180deg, #fde047, #f97316 55%, #dc2626)",
};

const SHAPE_DASH = "8 8";
const TAPE_FILL_OPACITY = 0.72;
const TAPE_HIGHLIGHT_OPACITY = 0.22;

/** 顶层逗号拆分（`rgba()` 里的逗号不算）。`render.ts:918` 的同一份逻辑。 */
function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseStop(raw: string): { color: string; pos?: number } {
  const t = raw.trim();
  const m = t.match(/^(.*?)\s+(-?\d+(?:\.\d+)?)%$/);
  if (m) return { color: m[1].trim(), pos: Number.parseFloat(m[2]) };
  return { color: t };
}

interface GradientSpec {
  kind: "linear" | "radial";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  stops: { color: string; pos?: number }[];
}

/**
 * `linear-gradient(<deg>, c1, c2[, ...])` / `radial-gradient(...)` → SVG 渐变。
 * ⚠️ 与渲染端同一条口径：线性渐变**少了角度那一段就整条丢掉**（`render.ts:963`
 * 的 `parts.length < 3`）。所以这里也返回 null 而不是自己补一个角度 ——
 * 补了就会出现「站内有渐变、封面没有」。
 */
function parseGradient(spec: string): GradientSpec | null {
  const text = spec.trim();
  if (/^radial-gradient\(/i.test(text)) {
    const inner = text.match(/radial-gradient\(([\s\S]+)\)$/i);
    if (!inner) return null;
    const parts = splitTopLevel(inner[1]);
    if (parts[0] && /circle|ellipse|at |closest|farthest|%|px/i.test(parts[0]) && !/#|rgb|hsl/i.test(parts[0])) {
      parts.shift();
    }
    const stops = parts.map(parseStop);
    return stops.length >= 2 ? { kind: "radial", stops } : null;
  }
  if (!/^linear-gradient\(/i.test(text)) return null;
  const inner = text.match(/linear-gradient\(([\s\S]+)\)$/i);
  if (!inner) return null;
  const parts = splitTopLevel(inner[1]);
  if (parts.length < 3) return null;
  const angle = Number.parseFloat(parts[0].trim());
  const deg = Number.isFinite(angle) ? angle : 135;
  const rad = ((deg - 90) * Math.PI) / 180;
  return {
    kind: "linear",
    x1: (50 - Math.cos(rad) * 50) / 100,
    y1: (50 - Math.sin(rad) * 50) / 100,
    x2: (50 + Math.cos(rad) * 50) / 100,
    y2: (50 + Math.sin(rad) * 50) / 100,
    stops: parts.slice(1).map(parseStop),
  };
}

function isGradient(v?: string): boolean {
  return !!v && /(linear|radial)-gradient\(/i.test(v);
}

function GradientDef({ id, spec }: { id: string; spec: GradientSpec }) {
  const stops = spec.stops.map((st, i) => (
    <stop
      key={i}
      offset={`${(st.pos != null ? st.pos : (i / Math.max(1, spec.stops.length - 1)) * 100).toFixed(1)}%`}
      stopColor={st.color}
    />
  ));
  if (spec.kind === "radial") {
    return (
      <radialGradient id={id} cx="0.5" cy="0.42" r="0.85">
        {stops}
      </radialGradient>
    );
  }
  return (
    <linearGradient
      id={id}
      gradientUnits="objectBoundingBox"
      x1={spec.x1?.toFixed(4)}
      y1={spec.y1?.toFixed(4)}
      x2={spec.x2?.toFixed(4)}
      y2={spec.y2?.toFixed(4)}
    >
      {stops}
    </linearGradient>
  );
}

/** `shape-geometry.ts:48`：圆角不许超过短边一半。 */
function clampedRadius(w: number, h: number, radius = 0): number {
  return Math.min(Math.max(0, radius), Math.min(Math.max(0, w), Math.max(0, h)) / 2);
}

function starPoints(w: number, h: number, spikes: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.min(w, h) / 2;
  const inner = outer * 0.45;
  const step = Math.PI / spikes;
  let rot = (Math.PI / 2) * 3;
  const pts: string[] = [];
  for (let i = 0; i < spikes; i += 1) {
    pts.push(`${cx + Math.cos(rot) * outer},${cy + Math.sin(rot) * outer}`);
    rot += step;
    pts.push(`${cx + Math.cos(rot) * inner},${cy + Math.sin(rot) * inner}`);
    rot += step;
  }
  return pts.join(" ");
}

function burstPoints(w: number, h: number, spikes: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.min(w, h) / 2;
  const inner = outer * 0.78;
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(" ");
}

function sparklePath(w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2;
  const r = R * 0.16;
  return (
    `M ${cx} ${cy - R} C ${cx + r} ${cy - r}, ${cx + r} ${cy - r}, ${cx + R} ${cy} ` +
    `C ${cx + r} ${cy + r}, ${cx + r} ${cy + r}, ${cx} ${cy + R} ` +
    `C ${cx - r} ${cy + r}, ${cx - r} ${cy + r}, ${cx - R} ${cy} ` +
    `C ${cx - r} ${cy - r}, ${cx - r} ${cy - r}, ${cx} ${cy - R} Z`
  );
}

function tapePoints(w: number, h: number): string {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  const teeth = Math.max(4, Math.min(14, Math.round(width / 28)));
  const depth = Math.max(1, Math.min(height * 0.18, 6));
  const pts: string[] = [];
  for (let i = 0; i <= teeth; i += 1) pts.push(`${(i / teeth) * width},${i % 2 === 0 ? depth : 0}`);
  for (let i = teeth; i >= 0; i -= 1) pts.push(`${(i / teeth) * width},${height - (i % 2 === 0 ? 0 : depth)}`);
  return pts.join(" ");
}

/** `editor-interactions.ts:382`：裁剪框（归一化）→ 铺在裁剪窗下面的整张图。 */
function cropGeometry(crop: PropsBackground["crop"], w: number, h: number) {
  const cw = Math.min(1, Math.max(0.01, numOr(crop?.w, 1)));
  const ch = Math.min(1, Math.max(0.01, numOr(crop?.h, 1)));
  const cx = Math.min(1 - cw, Math.max(0, numOr(crop?.x, 0)));
  const cy = Math.min(1 - ch, Math.max(0, numOr(crop?.y, 0)));
  return { x: (-cx / cw) * w, y: (-cy / ch) * h, width: w / cw, height: h / ch };
}

const IMAGE_CSS_FILTER: Record<string, string> = {
  bw: "grayscale(1)",
  vintage: "sepia(.7) contrast(1.1)",
  vivid: "saturate(1.5) contrast(1.05)",
  cool: "hue-rotate(18deg) saturate(1.1)",
  warm: "sepia(.2) saturate(1.3)",
};

/**
 * `props.src` 只许 `https://` 与 `data:image/<png|jpeg|webp>;base64,`。
 * 前半条是入库校验 B1/B6 的闸；后半条与光栅器 `props-raster.mjs:648` 收的形状
 * 一模一样 —— 站内能显示而光栅器解不开（或反过来），就又是一处「两边不是同一张图」。
 */
function safeImageSrc(src?: string): string | null {
  if (!src) return null;
  const value = src.trim();
  if (/^https:\/\//i.test(value)) return value;
  return /^data:image\/(png|jpeg|webp);base64,/i.test(value) ? value : null;
}

interface RenderCtx {
  defs: React.ReactNode[];
  notes: Set<string>;
}

function domId(el: PropsElement, index: number): string {
  return String(el.id ?? `el-${index}`).replace(/[^A-Za-z0-9_-]/g, "_");
}

function PropsShape(el: PropsElement, w: number, h: number, ctx: RenderCtx, id: string) {
  const p = el.props ?? {};
  const kind = strOf(p.kind) ?? "rect";
  const rawFill = strOf(p.fill) ?? "transparent";
  let fill = kind === "line" || kind === "arrow" ? "none" : rawFill;
  const stroke = strOf(p.stroke) ?? "transparent";
  const strokeWidth = Math.max(0, numOr(p.strokeWidth, 0));
  const dash = p.strokeStyle === "dashed" ? SHAPE_DASH : undefined;

  if (isGradient(rawFill) && kind !== "line" && kind !== "arrow") {
    const spec = parseGradient(rawFill);
    if (spec) {
      ctx.defs.push(<GradientDef key={`sg-${id}`} id={`sg-${id}`} spec={spec} />);
      fill = `url(#sg-${id})`;
    }
  }

  const common = { fill, stroke, strokeWidth, strokeDasharray: dash };

  if (!SHAPE_KINDS.has(kind)) {
    // 认不出的图形不许悄悄画成一块矩形（矩形会被当成设计），也不许丢掉
    // （丢掉会被当成没做）：照矩形画出来，同时在画布下面把它点名。
    ctx.notes.add(`这份文档里有本站还没有几何实现的图形：kind=${kind}，先按矩形块画，形状与货架封面会不一样。`);
  }

  // 色块的落影三档。数字与渲染端 `render.ts:1168-1180` 逐个相同 ——
  // 差一档就是「站内的块浮起来、封面的块贴着」。
  const preset = strOf(p.shadowPreset);
  if (preset && preset !== "none") {
    const sh =
      preset === "hard"
        ? { dy: 12, blur: 2, opacity: 0.4 }
        : preset === "medium"
          ? { dy: 10, blur: 6, opacity: 0.32 }
          : { dy: 8, blur: 9, opacity: 0.26 };
    ctx.defs.push(
      <filter key={`shape-shadow-${id}`} id={`shape-shadow-${id}`} x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx={0} dy={sh.dy} stdDeviation={sh.blur} floodColor="rgb(15,23,42)" floodOpacity={sh.opacity} />
      </filter>,
    );
    return (
      <g filter={`url(#shape-shadow-${id})`}>
        {PropsShapeGeometry(w, h, kind, common, rawFill, stroke, strokeWidth, dash, fill, p)}
      </g>
    );
  }

  return PropsShapeGeometry(w, h, kind, common, rawFill, stroke, strokeWidth, dash, fill, p);
}

type ShapeCommon = { fill: string; stroke: string; strokeWidth: number; strokeDasharray?: string };

/** 站内在用的 `ShapeKind`（`design/lib/shape-geometry.ts` 那一套的子集 + 全部实测用量）。 */
const SHAPE_KINDS = new Set([
  "rect",
  "circle",
  "triangle",
  "line",
  "arrow",
  "star",
  "burst",
  "sparkle",
  "polygon",
  "ribbon",
  "banner",
  "tape",
  "seal",
]);

function PropsShapeGeometry(
  w: number,
  h: number,
  kind: string,
  common: ShapeCommon,
  rawFill: string,
  stroke: string,
  strokeWidth: number,
  dash: string | undefined,
  fill: string,
  p: Record<string, unknown>,
) {
  if (kind === "circle") return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />;
  if (kind === "triangle") return <polygon points={`${w / 2},0 ${w},${h} 0,${h}`} {...common} />;
  if (kind === "line") {
    return (
      <line
        x1={0}
        y1={h / 2}
        x2={w}
        y2={h / 2}
        stroke={stroke !== "transparent" ? stroke : rawFill}
        strokeWidth={Math.max(2, strokeWidth)}
        strokeDasharray={dash}
      />
    );
  }
  if (kind === "arrow") {
    return (
      <g>
        <line
          x1={0}
          y1={h / 2}
          x2={w - 24}
          y2={h / 2}
          stroke={stroke !== "transparent" ? stroke : rawFill}
          strokeWidth={Math.max(2, strokeWidth)}
          strokeDasharray={dash}
        />
        <polygon
          points={`${w - 24},6 ${w},${h / 2} ${w - 24},${h - 6}`}
          fill={rawFill}
          stroke={stroke}
          strokeWidth={Math.max(2, strokeWidth)}
          strokeDasharray={dash}
        />
      </g>
    );
  }
  if (kind === "star") {
    return <polygon points={starPoints(w, h, Math.max(4, Math.min(32, Math.round(numOr(p.points, 5)))))} {...common} />;
  }
  if (kind === "burst") {
    return <polygon points={burstPoints(w, h, Math.max(4, Math.min(32, Math.round(numOr(p.points, 12)))))} {...common} />;
  }
  if (kind === "sparkle") return <path d={sparklePath(w, h)} {...common} />;
  if (kind === "polygon") {
    return (
      <polygon points={`${w * 0.5},0 ${w},${h * 0.38} ${w * 0.82},${h} ${w * 0.18},${h} 0,${h * 0.38}`} {...common} />
    );
  }
  if (kind === "ribbon") {
    return <polygon points={`0,0 ${w},0 ${w - 24},${h / 2} ${w},${h} 0,${h} 24,${h / 2}`} {...common} />;
  }
  if (kind === "banner") {
    const notch = Math.min(h * 0.5, w * 0.08);
    return (
      <polygon points={`0,0 ${w},0 ${w - notch},${h * 0.5} ${w},${h} 0,${h} ${notch},${h * 0.5}`} {...common} />
    );
  }
  if (kind === "tape") {
    return (
      <g>
        <polygon points={tapePoints(w, h)} fill={fill} fillOpacity={TAPE_FILL_OPACITY} stroke={stroke} strokeWidth={strokeWidth} />
        <path
          d={`M ${w * 0.18} ${h * 0.12} L ${w * 0.72} ${h * 0.88}`}
          stroke="white"
          strokeOpacity={TAPE_HIGHLIGHT_OPACITY}
          strokeWidth={Math.max(1, h * 0.12)}
        />
      </g>
    );
  }
  if (kind === "seal") {
    const cx = w / 2;
    const cy = h / 2;
    const rOuter = Math.min(w, h) / 2;
    const sw = strokeWidth || Math.max(3, rOuter * 0.08);
    const ring = stroke !== "transparent" ? stroke : rawFill;
    const sealText = strOf(p.sealText);
    return (
      <g>
        <circle cx={cx} cy={cy} r={Number((rOuter - sw / 2).toFixed(1))} fill={fill} stroke={ring} strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={Number((rOuter * 0.78).toFixed(1))} fill="none" stroke={ring} strokeWidth={Number((sw * 0.6).toFixed(1))} />
        {sealText ? (
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={stroke !== "transparent" ? stroke : "#ffffff"}
            fontSize={Math.max(12, rOuter * 0.45)}
            fontWeight={800}
          >
            {sealText}
          </text>
        ) : null}
      </g>
    );
  }
  return <rect x={0} y={0} width={w} height={h} rx={clampedRadius(w, h, numOr(p.radius, 0))} {...common} />;
}

function PropsText(el: PropsElement, w: number, h: number, ctx: RenderCtx, id: string) {
  const p = el.props ?? {};
  const fs = numOr(p.fontSize, 24);
  const lineStep = numOr(p.lineHeight, 1.2) * fs;
  const align = p.textAlign === "center" ? "center" : p.textAlign === "right" ? "right" : "left";
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const x = align === "center" ? w / 2 : align === "right" ? w : 0;
  const lines = String(strOf(p.text) ?? "").split("\n");
  const effect = strOf(p.effect) ?? "none";
  const decoration = strOf(p.textDecoration);

  // 排字属性一次给全，三层（描边层 / 长影层 / 主字层）用同一份，
  // 否则叠出来的层会错位半个字。
  const face = {
    fontSize: fs,
    fontFamily: posterFontFamily(strOf(p.fontFamily)),
    fontWeight: numOr(p.fontWeight, 400),
    fontStyle: strOf(p.fontStyle) ?? "normal",
    textAnchor: anchor,
    letterSpacing: numOr(p.letterSpacing, 0),
    ...(decoration && decoration !== "none" ? { textDecoration: decoration } : {}),
  } as const;

  const tspans = lines.map((line, i) => (
    <tspan key={i} x={x} y={fs + i * lineStep}>
      {line}
    </tspan>
  ));

  // 仲裁 03：高亮块宽由引擎按真实字体度量显式给（甲案 = 引擎发一个 `shape`
  // 矩形 + 文字 `effect: "none"`）。**所以这一侧不再叠估算块** ——
  // 渲染端那套「全角≈1.0em、ASCII≈0.55em」的估算对美术字大幅失真，
  // 叠上去就是重影加错位。遇到还写着 highlight 的文档，把它点名，
  // 不静默吃掉（静默吃掉 = 用户看不到本该有的荧光块，却没人知道）。
  if (effect === "highlight" || effect === "background") {
    ctx.notes.add(
      "这份文档的文字写了 effect: highlight，而块宽按仲裁 03 由引擎显式给成一个 shape 矩形：" +
        "站内不再自己估算叠块，所以这段字后面没有荧光块就说明引擎没给。",
    );
  }

  let fillPaint = strOf(p.color) ?? "#111827";
  const gradSpec =
    strOf(p.fillGradient) ??
    (strOf(p.gradientPreset) && p.gradientPreset !== "none" ? TEXT_GRADIENTS[String(p.gradientPreset)] : undefined) ??
    (effect === "gradient" ? TEXT_GRADIENTS.gold : undefined);
  if (gradSpec) {
    const spec = parseGradient(gradSpec);
    if (spec) {
      ctx.defs.push(<GradientDef key={`tg-${id}`} id={`tg-${id}`} spec={spec} />);
      fillPaint = `url(#tg-${id})`;
    }
  }

  let strokeProps: React.SVGProps<SVGTextElement> = {};
  const under: React.ReactNode[] = [];
  if (effect === "outline2") {
    const sc = numOr(p.strokeScale, 0.12);
    const inner = Math.max(1, fs * sc);
    const outer = Math.max(2, fs * sc * 2.1);
    const c1 = strOf(p.strokeColor) ?? "#7f1d1d";
    const c2 = strOf(p.strokeColor2) ?? "#ffffff";
    under.push(
      <text key="o2-outer" {...face} fill={c2} stroke={c2} strokeWidth={Number(outer.toFixed(1))} paintOrder="stroke" strokeLinejoin="round">
        {tspans}
      </text>,
      <text key="o2-inner" {...face} fill={c1} stroke={c1} strokeWidth={Number(inner.toFixed(1))} paintOrder="stroke" strokeLinejoin="round">
        {tspans}
      </text>,
    );
  } else if (effect === "stroke" || effect === "outline" || effect === "hollow" || effect === "splice" || effect === "neon") {
    const sc = numOr(p.strokeScale, 1 / 9);
    strokeProps = {
      stroke: strOf(p.strokeColor) ?? "#0f172a",
      strokeWidth: Number(Math.max(1, fs * sc).toFixed(1)),
      paintOrder: "stroke",
      strokeLinejoin: "round",
    };
  }

  if (effect === "longshadow" || effect === "echo" || effect === "splice") {
    const shColor = strOf(p.shadowColorHex) ?? "rgba(0,0,0,0.28)";
    const steps = Math.min(14, Math.max(6, Math.round(fs * 0.14)));
    for (let s = steps; s >= 1; s -= 1) {
      const d = Number((s * fs * 0.02).toFixed(1));
      under.unshift(
        <g key={`ls-${s}`} transform={`translate(${d} ${d})`}>
          <text {...face} fill={shColor}>
            {tspans}
          </text>
        </g>,
      );
    }
  }

  let filter: string | undefined;
  if (effect === "shadow" || effect === "drop" || effect === "glow" || effect === "neon") {
    const soft = effect === "glow" || effect === "neon";
    ctx.defs.push(
      <filter key={`sh-${id}`} id={`sh-${id}`} x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow
          dx={0}
          dy={soft ? 0 : Number((fs * 0.05).toFixed(1))}
          stdDeviation={Number((soft ? fs * 0.14 : fs * 0.06).toFixed(1))}
          floodColor={strOf(p.shadowColorHex) ?? "rgba(15,23,42,0.5)"}
        />
      </filter>,
    );
    filter = `url(#sh-${id})`;
  }

  const known = new Set([
    "none",
    "highlight",
    "background",
    "shadow",
    "drop",
    "glow",
    "neon",
    "longshadow",
    "echo",
    "splice",
    "outline",
    "outline2",
    "stroke",
    "hollow",
    "gradient",
  ]);
  if (!known.has(effect)) {
    ctx.notes.add(`这份文档的文字写了 effect: ${effect}，本站还不认它，这段字按无效果画，与货架封面会不一样。`);
  }

  return (
    <>
      {under}
      <text {...face} {...strokeProps} fill={effect === "hollow" ? "none" : fillPaint} filter={filter}>
        {tspans}
      </text>
    </>
  );
}

function PropsImage(
  el: PropsElement,
  w: number,
  h: number,
  ctx: RenderCtx,
  id: string,
  alt: string,
  missingLabel: string,
) {
  const p = el.props ?? {};
  const src = safeImageSrc(strOf(p.src));
  const radius = Math.max(0, numOr(p.radius, 0));

  if (!src) {
    // 拒掉的 src 一个字都不回显：回显等于把不可信内容搬进页面，
    // 而「这一格为什么是空的」用不着把那串东西念出来。
    ctx.notes.add(
      strOf(p.src)
        ? "有一格的图 src 不是 https:// 或 data:image/，本站不加载它，所以这一格是占位块。"
        : "有一格的 image 元素没有 props.src，这一格的图没跟着文档来。",
    );
    // 缺图不画一块干净的浅灰（干净的灰块会被当成设计），带上文案说明缺的是什么。
    return (
      <g>
        <rect x={0} y={0} width={w} height={h} rx={radius} fill="#EEF1F5" />
        <text
          x={w / 2}
          y={h / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#9AA4B2"
          fontSize={Math.max(12, Math.min(w, h) * 0.09)}
        >
          {missingLabel}
        </text>
      </g>
    );
  }

  const geo = cropGeometry(p.crop as PropsBackground["crop"], w, h);
  ctx.defs.push(
    <clipPath key={`clip-${id}`} id={`clip-${id}`}>
      <rect x={0} y={0} width={w} height={h} rx={radius} />
    </clipPath>,
  );

  // 抠图主体的接地投影 / 描边：与渲染端同一组常数（`render.ts:1211-1242`），
  // 都基于图片自身 alpha，对透明 PNG 有效。
  const shadow = strOf(p.dropShadow) && p.dropShadow !== "none" ? String(p.dropShadow) : "";
  const outlineC = strOf(p.outlineColor);
  let imgFilter: string | undefined;
  if (shadow || outlineC) {
    const dim = Math.min(w, h);
    const outlineW = numOr(p.outlineWidth, Math.max(3, dim * 0.012));
    const pieces: React.ReactNode[] = [];
    let inner = "SourceGraphic";
    if (outlineC) {
      pieces.push(
        <feMorphology key="dil" in="SourceAlpha" operator="dilate" radius={Number(outlineW.toFixed(1))} result="dil" />,
        <feFlood key="oc" floodColor={outlineC} result="oc" />,
        <feComposite key="cmp" in="oc" in2="dil" operator="in" result="outline" />,
        <feMerge key="mrg" result="outlineMerged">
          <feMergeNode in="outline" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>,
      );
      inner = "outlineMerged";
    }
    if (shadow) {
      const cfg =
        shadow === "hard"
          ? { dy: dim * 0.03, blur: dim * 0.02, a: 0.4 }
          : shadow === "medium"
            ? { dy: dim * 0.022, blur: dim * 0.03, a: 0.32 }
            : { dy: dim * 0.015, blur: dim * 0.035, a: 0.26 };
      pieces.push(
        <feDropShadow
          key="ds"
          in={inner}
          dx={0}
          dy={Number(cfg.dy.toFixed(1))}
          stdDeviation={Number(cfg.blur.toFixed(1))}
          floodColor={`rgba(15,23,42,${cfg.a})`}
        />,
      );
    }
    ctx.defs.push(
      <filter key={`imf-${id}`} id={`imf-${id}`} x="-25%" y="-25%" width="150%" height="150%">
        {pieces}
      </filter>,
    );
    imgFilter = `url(#imf-${id})`;
  }

  const flipX = p.flipX === true;
  const flipY = p.flipY === true;
  const cssFilter = IMAGE_CSS_FILTER[strOf(p.filter) ?? ""];

  return (
    <g filter={imgFilter}>
      <g
        clipPath={`url(#clip-${id})`}
        transform={
          flipX || flipY
            ? `translate(${flipX ? w : 0} ${flipY ? h : 0}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`
            : undefined
        }
      >
        <image
          href={src}
          x={geo.x}
          y={geo.y}
          width={geo.width}
          height={geo.height}
          preserveAspectRatio="none"
          style={cssFilter ? { filter: cssFilter } : undefined}
          aria-label={alt || undefined}
        />
      </g>
    </g>
  );
}

/**
 * 背景纹理叠层。取值与常数逐条对齐 `render.ts:1448-1533` 的 `bgOverlaySvg`。
 *
 * ⚠️ 这里是普通函数、不是组件：`pattern` / `radialGradient` 要在 `<defs>` 被
 * React 读到之前就压进 `ctx.defs`。写成组件的话它在 `<defs>` 之后才执行，
 * 纹理就会引用一个不存在的 id —— 站内背景干净一片，封面上有纹理。
 */
function propsOverlay(bg: PropsBackground, W: number, H: number, ctx: RenderCtx) {
  const ov = strOf(bg.overlay);
  if (!ov || ov === "none") return null;
  const c = strOf(bg.overlayColor) ?? "#ffffff";
  const op = numOr(bg.overlayOpacity, 0.18);

  if (ov === "rays") {
    const n = 24;
    const R = Math.hypot(W, H);
    const cx = W / 2;
    const cy = H * 0.42;
    const wedges: React.ReactNode[] = [];
    for (let i = 0; i < n; i += 2) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      wedges.push(
        <polygon
          key={i}
          points={`${cx.toFixed(1)},${cy.toFixed(1)} ${(cx + Math.cos(a0) * R).toFixed(1)},${(cy + Math.sin(a0) * R).toFixed(1)} ${(cx + Math.cos(a1) * R).toFixed(1)},${(cy + Math.sin(a1) * R).toFixed(1)}`}
          fill={c}
        />,
      );
    }
    return <g opacity={op}>{wedges}</g>;
  }
  if (ov === "vignette") {
    ctx.defs.push(
      <radialGradient key="ov-vig" id="ov-vig" cx="0.5" cy="0.45" r="0.75">
        <stop offset="55%" stopColor="rgba(0,0,0,0)" />
        <stop offset="100%" stopColor={c} />
      </radialGradient>,
    );
    return <rect x={0} y={0} width={W} height={H} fill="url(#ov-vig)" opacity={op} />;
  }
  if (ov === "dots") {
    const gap = Math.max(36, W * 0.05);
    ctx.defs.push(
      <pattern key="ov-dots" id="ov-dots" width={gap} height={gap} patternUnits="userSpaceOnUse">
        <circle cx={Number((gap / 2).toFixed(1))} cy={Number((gap / 2).toFixed(1))} r={Number((gap * 0.09).toFixed(1))} fill={c} />
      </pattern>,
    );
    return <rect x={0} y={0} width={W} height={H} fill="url(#ov-dots)" opacity={op} />;
  }
  if (ov === "grid") {
    const gap = Math.max(48, W * 0.06);
    ctx.defs.push(
      <pattern key="ov-grid" id="ov-grid" width={gap} height={gap} patternUnits="userSpaceOnUse">
        <path d={`M ${gap} 0 L 0 0 0 ${gap}`} fill="none" stroke={c} strokeWidth={1.5} />
      </pattern>,
    );
    return <rect x={0} y={0} width={W} height={H} fill="url(#ov-grid)" opacity={op} />;
  }
  if (ov === "diagonal") {
    const gap = Math.max(28, W * 0.035);
    ctx.defs.push(
      <pattern key="ov-diag" id="ov-diag" width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect x={0} y={0} width={Number((gap / 2).toFixed(1))} height={gap} fill={c} />
      </pattern>,
    );
    return <rect x={0} y={0} width={W} height={H} fill="url(#ov-diag)" opacity={op} />;
  }
  if (ov === "noise") {
    ctx.defs.push(
      <filter key="ov-noise" id="ov-noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>,
    );
    return <rect x={0} y={0} width={W} height={H} filter="url(#ov-noise)" opacity={Math.min(op, 0.08)} />;
  }
  if (ov === "confetti") {
    const cols = ["#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#f87171"];
    let s = 987654321;
    const rnd = () => {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    const bits: React.ReactNode[] = [];
    const count = Math.round((W * H) / 26000);
    for (let i = 0; i < count; i += 1) {
      const px = Number((rnd() * W).toFixed(1));
      const py = Number((rnd() * H).toFixed(1));
      const sz = 6 + rnd() * 12;
      const rot = Number((rnd() * 90).toFixed(1));
      const col = cols[Math.floor(rnd() * cols.length)];
      bits.push(
        <rect
          key={i}
          x={px}
          y={py}
          width={Number(sz.toFixed(1))}
          height={Number((sz * 0.5).toFixed(1))}
          rx={2}
          fill={col}
          transform={`rotate(${rot} ${px} ${py})`}
        />,
      );
    }
    return <g opacity={op}>{bits}</g>;
  }
  ctx.notes.add(`这份文档的背景纹理 overlay=${ov} 本站还不认，背景少一层纹理。`);
  return null;
}

function PropsDocumentViewer({ work, doc }: { work: WorkEntry; doc: PropsDoc }) {
  const tt = useUI();
  // 缺尺寸时的兜底画布要与光栅器同一组数（`props-raster.mjs:50-51`）：
  // 兜底不一致 = 同一份没写尺寸的文档，站内和封面连长宽比都不是一个。
  const W = numOr(doc.width, 0) > 0 ? numOr(doc.width, 1242) : 1242;
  const H = numOr(doc.height, 0) > 0 ? numOr(doc.height, 1656) : 1656;
  const bg = doc.background ?? {};
  const ctx: RenderCtx = { defs: [], notes: new Set() };

  let bgFill = strOf(bg.color) ?? "#ffffff";
  if (strOf(bg.gradient)) {
    const spec = parseGradient(String(bg.gradient));
    if (spec) {
      ctx.defs.push(<GradientDef key="bg-gradient" id="bg-gradient" spec={spec} />);
      bgFill = "url(#bg-gradient)";
    }
  }

  const bgSrc = safeImageSrc(strOf(bg.image));
  const bgGeo = cropGeometry(bg.crop, W, H);

  const body = [...(doc.elements ?? [])]
    .filter((el) => el.hidden !== true)
    .sort((a, b) => numOr(a.z, 0) - numOr(b.z, 0))
    .map((el, index) => {
      const x = numOr(el.x, 0);
      const y = numOr(el.y, 0);
      const w = Math.max(numOr(el.w, 0), 0);
      const h = Math.max(numOr(el.h, 0), 0);
      const id = domId(el, index);
      const alt = strOf(el.props?.alt) ?? "";
      let inner: React.ReactNode = null;

      if (el.type === "shape") inner = PropsShape(el, w, h, ctx, id);
      else if (el.type === "text") inner = PropsText(el, w, h, ctx, id);
      else if (el.type === "image") {
        inner = PropsImage(el, w, h, ctx, id, alt, alt || tt("这一格的图没有随文档提供"));
      } else {
        // `type` 只有三值（入库校验 B1）。多出来的一律点名，不悄悄丢。
        ctx.notes.add(`这份文档里有本站不认的元素 type=${String(el.type)}，这一层没有画出来。`);
        return null;
      }

      // 旋转绕元素中心，与渲染端同一条 transform（`render.ts:1142`）。
      return (
        <g
          key={`${id}-${index}`}
          transform={`translate(${x + w / 2} ${y + h / 2}) rotate(${numOr(el.rotation, 0)}) translate(${-w / 2} ${-h / 2})`}
          opacity={typeof el.opacity === "number" ? clamp01(el.opacity) : undefined}
        >
          {inner}
        </g>
      );
    });

  const overlay = propsOverlay(bg, W, H, ctx);
  if (bgSrc) {
    ctx.defs.push(
      <clipPath key="background-crop" id="background-crop">
        <rect x={0} y={0} width={W} height={H} />
      </clipPath>,
    );
  }
  const notes = [...ctx.notes];

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto w-full rounded-xl border border-zinc-200 shadow-sm"
        style={{
          display: "block",
          maxWidth: "min(100%, 56rem)",
          aspectRatio: `${W} / ${H}`,
          // 排字复位：下面这几项被祖先或 Tailwind preflight 改动一项，
          // 字宽就与光栅器量出来的不一样，字和它背后的块就错开。
          fontFamily: POSTER_FALLBACK_STACK,
          fontSynthesis: "none",
          fontKerning: "normal",
          fontFeatureSettings: "normal",
          fontVariationSettings: "normal",
          fontVariantLigatures: "normal",
          // 光栅器（resvg / Skia）按未经 hinting 的 advance 摆字；
          // geometricPrecision 是浏览器这一侧同样不吃 hinting 的那一档。
          textRendering: "geometricPrecision",
          WebkitFontSmoothing: "antialiased",
        }}
        role="img"
        aria-label={work.title}
      >
        <defs>{ctx.defs}</defs>
        <rect x={0} y={0} width={W} height={H} fill={bgFill} />
        {bgSrc ? (
          <g clipPath="url(#background-crop)">
            <image
              href={bgSrc}
              x={bgGeo.x}
              y={bgGeo.y}
              width={bgGeo.width}
              height={bgGeo.height}
              preserveAspectRatio="none"
              opacity={numOr(bg.opacity, 1)}
            />
          </g>
        ) : null}
        {overlay}
        {body}
      </svg>
      {notes.length > 0 ? (
        <ul className="mx-auto flex w-full max-w-[56rem] flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          {notes.map((note) => (
            <li key={note}>{tt(note)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------------- 判形：props 形 / flat 形 / 认不出来 ---------------- */

type DocForm =
  | { form: "props"; doc: PropsDoc }
  | { form: "flat" }
  | { form: "unknown"; why: string };

/**
 * 两套序列化都自称 `oceanleo.design-document.v1`（`W6` 已记为已知缺陷），
 * 所以只能按形状判：
 * - 顶层有 `spec`、或元素带 `props` 对象 ⇒ props 形（仲裁 01 裁定的那一套）；
 * - 元素带 flat 形独有的键（`width` / `fontSizePx` / `pathData` / `assetId`）⇒ flat 形；
 * - 都判不出来 ⇒ **说认不出**，不许静默渲成空白或一堆灰块。
 */
export function documentFormOf(payload: WorkPayload): DocForm {
  if (!payload || typeof payload !== "object") return { form: "unknown", why: "这份文档不是一个对象。" };
  const doc = (payload as Record<string, unknown>).document;
  if (!doc || typeof doc !== "object") {
    return { form: "unknown", why: "这份文档里没有 document 这一节。" };
  }
  const d = doc as Record<string, unknown>;
  if (!Array.isArray(d.elements)) {
    return { form: "unknown", why: "这份文档的 document.elements 不是一个数组。" };
  }
  const elements = d.elements as Record<string, unknown>[];
  const hasProps = elements.some((el) => el && typeof el === "object" && typeof el.props === "object" && el.props !== null);
  const hasSpec = typeof (payload as Record<string, unknown>).spec === "object" && (payload as Record<string, unknown>).spec !== null;
  if (hasProps || (hasSpec && elements.some((el) => el && typeof el.w === "number"))) {
    return { form: "props", doc: d as PropsDoc };
  }
  const hasFlat = elements.some(
    (el) =>
      el &&
      typeof el === "object" &&
      (typeof el.width === "number" ||
        typeof el.fontSizePx === "number" ||
        typeof el.pathData === "string" ||
        typeof el.assetId === "string"),
  );
  if (hasFlat) return { form: "flat" };
  if (elements.length === 0) return { form: "unknown", why: "这份文档一个元素都没有。" };
  return {
    form: "unknown",
    why: "这份文档的元素既没有 props 形的 props 对象，也没有 flat 形的 width / fontSizePx / pathData / assetId。",
  };
}

/** 认不出来的时候把话说明白：空白页会被当成没做，灰块会被当成设计。 */
function UnknownDocument({ work, why }: { work: WorkEntry; why: string }) {
  const tt = useUI();
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-5">
      <p className="text-sm font-medium text-amber-900">{tt("这份文档我认不出，所以没有把它画出来。")}</p>
      <p className="text-xs leading-relaxed text-amber-800">{tt(why)}</p>
      <p className="text-xs leading-relaxed text-amber-800">
        {tt("本站认两套：props 形（顶层 spec + 元素 props）与 flat 形（元素 width / fontSizePx / pathData / assetId）。下面这张是货架封面，不是站内渲染的结果。")}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={work.cover} alt={work.title} className="max-h-[52vh] w-auto self-center rounded-lg shadow-sm" />
    </div>
  );
}

function DesignDocumentViewer({ work, payload }: { work: WorkEntry; payload: WorkPayload }) {
  const detected = documentFormOf(payload);
  if (detected.form === "props") return <PropsDocumentViewer work={work} doc={detected.doc} />;
  if (detected.form === "flat") return <FlatDocumentViewer work={work} payload={payload} />;
  return <UnknownDocument work={work} why={detected.why} />;
}

/* ---------------- chart / workflow：站内渲染结构化 JSON ---------------- */

const PALETTE = ["#1F6FEB", "#C47323", "#2E8B6F", "#8E5BA6", "#CF222E", "#57606A", "#0A7EA4", "#B45309"];

interface ChartSeries {
  name: string;
  type: "line" | "bar" | "scatter";
  color: string;
  points: { x: number; y: number }[];
}

interface ChartSpec {
  title: string;
  subtitle: string;
  xName: string;
  yName: string;
  xType: "category" | "value";
  categories: string[];
  series: ChartSeries[];
  yMin?: number;
  yMax?: number;
  yInterval?: number;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * `oceanleo.chart.v1` 的正文是 `dataset`（维度 + 行矩阵）+ `option`（谁画成什么）。
 * 这里把它摊平成「几条数列、每条几组点」，站内自己用 SVG 画出来。
 * 老形状 `{categories, series:[{values}]}` 也照收。
 */
export function chartSpecOf(payload: WorkPayload): ChartSpec | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const root = (body.chart && typeof body.chart === "object" ? body.chart : body) as Record<string, unknown>;
  const option = (root.option && typeof root.option === "object" ? root.option : {}) as Record<string, unknown>;
  const title = (option.title ?? {}) as Record<string, unknown>;
  const xAxis = (option.xAxis ?? {}) as Record<string, unknown>;
  const yAxis = (option.yAxis ?? {}) as Record<string, unknown>;
  const palette = Array.isArray(option.color) ? option.color.map((c) => String(c)) : PALETTE;

  const base: ChartSpec = {
    title: String(title.text ?? root.title ?? ""),
    subtitle: String(title.subtext ?? ""),
    xName: String(xAxis.name ?? ""),
    yName: String(yAxis.name ?? ""),
    xType: xAxis.type === "value" ? "value" : "category",
    categories: [],
    series: [],
    yMin: num(yAxis.min) ?? undefined,
    yMax: num(yAxis.max) ?? undefined,
    yInterval: num(yAxis.interval) ?? undefined,
  };

  const dataset = (root.dataset ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(dataset.source) ? dataset.source : null;

  if (rows && rows.length > 0) {
    const dims = Array.isArray(dataset.dimensions)
      ? dataset.dimensions.map((d) =>
          d && typeof d === "object" ? String((d as Record<string, unknown>).name ?? "") : String(d),
        )
      : [];
    const cell = (row: unknown, key: string | number): unknown => {
      if (Array.isArray(row)) return row[typeof key === "number" ? key : dims.indexOf(key)];
      if (row && typeof row === "object") return (row as Record<string, unknown>)[String(key)];
      return undefined;
    };

    const declared = Array.isArray(option.series) ? option.series : [];
    const specs: Record<string, unknown>[] =
      declared.length > 0
        ? declared.map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
        : dims.slice(1).map((name) => ({ name, encode: { x: dims[0], y: name } }));

    base.categories =
      base.xType === "category"
        ? rows.map((r) => {
            const encode = (specs[0]?.encode ?? {}) as Record<string, unknown>;
            const xKey = encode.x !== undefined ? String(encode.x) : dims[0] ?? 0;
            return String(cell(r, xKey) ?? "");
          })
        : [];

    base.series = specs.map((s, si) => {
      const encode = (s.encode && typeof s.encode === "object" ? s.encode : {}) as Record<string, unknown>;
      const xKey = encode.x !== undefined ? String(encode.x) : dims[0] ?? 0;
      const yKey = encode.y !== undefined ? String(encode.y) : dims[si + 1] ?? 1;
      const itemStyle = (s.itemStyle ?? {}) as Record<string, unknown>;
      const type = s.type === "line" || s.type === "scatter" ? s.type : "bar";
      const points: { x: number; y: number }[] = [];
      rows.forEach((r, ri) => {
        const y = num(cell(r, yKey));
        if (y === null) return;
        const x = base.xType === "value" ? num(cell(r, xKey)) : ri;
        if (x === null) return;
        points.push({ x, y });
      });
      return {
        name: String(s.name ?? yKey),
        type,
        color: String(itemStyle.color ?? palette[si % palette.length]),
        points,
      };
    });
  } else {
    // 老形状：categories[] + series[].values[]
    base.categories = Array.isArray(root.categories) ? root.categories.map((c) => String(c)) : [];
    const legacy = Array.isArray(root.series) ? root.series : [];
    base.series = legacy.map((s, si) => {
      const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const values = Array.isArray(o.values ?? o.data) ? ((o.values ?? o.data) as unknown[]) : [];
      const points: { x: number; y: number }[] = [];
      values.forEach((v, i) => {
        const y = num(v);
        if (y !== null) points.push({ x: i, y });
      });
      return {
        name: String(o.name ?? `数列 ${si + 1}`),
        type: (o.type === "line" || o.type === "scatter" ? o.type : "bar") as ChartSeries["type"],
        color: palette[si % palette.length],
        points,
      };
    });
  }

  base.series = base.series.filter((s) => s.points.length > 0);
  return base.series.length > 0 ? base : null;
}

function niceTicks(min: number, max: number, want = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / want;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1000; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

// 站内自己画图，不引图表库：条形 / 折线 / 散点三种够覆盖 oceanleo.chart.v1 今天的产物，
// 而多一个运行时依赖就多一份要跟着升级的东西。
function ChartViewer({ work, payload }: { work: WorkEntry; payload: WorkPayload }) {
  const tt = useUI();
  if (work.view.src.endsWith(".svg")) {
    return (
      <div className="flex justify-center rounded-xl border border-zinc-200 bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={work.view.src} alt={work.title} className="max-h-[70vh] w-auto" />
      </div>
    );
  }

  const spec = chartSpecOf(payload);
  if (!spec) return <Fallback work={work} reason="这份图表没有可画的数列，先看封面。" />;

  const W = 920;
  const H = 460;
  const pad = { top: 16, right: 24, bottom: 56, left: 72 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const ys = spec.series.flatMap((s) => s.points.map((p) => p.y));
  const yMin = spec.yMin ?? Math.min(0, ...ys);
  const yMax = spec.yMax ?? Math.max(...ys) * 1.05;
  const yTicks = spec.yInterval
    ? Array.from({ length: Math.floor((yMax - yMin) / spec.yInterval) + 1 }, (_, i) => yMin + i * spec.yInterval!)
    : niceTicks(yMin, yMax);
  const yAt = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const isCategory = spec.xType === "category";
  const xs = spec.series.flatMap((s) => s.points.map((p) => p.x));
  const xMin = isCategory ? 0 : Math.min(...xs);
  const xMax = isCategory ? Math.max(spec.categories.length - 1, 1) : Math.max(...xs);
  const band = isCategory ? plotW / Math.max(spec.categories.length, 1) : 0;
  const xAt = (v: number) =>
    isCategory ? pad.left + band * (v + 0.5) : pad.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;

  const bars = spec.series.filter((s) => s.type === "bar");
  const barW = bars.length > 0 ? Math.min((band * 0.72) / bars.length, 42) : 0;
  const labelEvery = Math.ceil(spec.categories.length / 14) || 1;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-5">
      {spec.title && <h3 className="text-base font-semibold text-zinc-900">{spec.title}</h3>}
      {spec.subtitle && <p className="text-xs leading-relaxed text-zinc-500">{spec.subtitle}</p>}

      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={spec.title || work.title}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={yAt(t)} y2={yAt(t)} stroke="#E6EAF0" strokeWidth="1" />
            <text x={pad.left - 10} y={yAt(t) + 4} textAnchor="end" fontSize="12" fill="#57606A">
              {t}
            </text>
          </g>
        ))}
        <line x1={pad.left} x2={W - pad.right} y1={yAt(yMin)} y2={yAt(yMin)} stroke="#B8C2CC" />
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + plotH} stroke="#B8C2CC" />
        {spec.yName && (
          <text x={pad.left - 58} y={pad.top + plotH / 2} fontSize="12" fill="#57606A" transform={`rotate(-90 ${pad.left - 58} ${pad.top + plotH / 2})`} textAnchor="middle">
            {spec.yName}
          </text>
        )}

        {isCategory
          ? spec.categories.map((c, i) =>
              i % labelEvery === 0 ? (
                <text key={i} x={xAt(i)} y={pad.top + plotH + 20} textAnchor="middle" fontSize="11" fill="#57606A">
                  {c.length > 10 ? `${c.slice(0, 9)}…` : c}
                </text>
              ) : null,
            )
          : niceTicks(xMin, xMax).map((t) => (
              <text key={t} x={xAt(t)} y={pad.top + plotH + 20} textAnchor="middle" fontSize="11" fill="#57606A">
                {t}
              </text>
            ))}
        {spec.xName && (
          <text x={pad.left + plotW / 2} y={H - 22} textAnchor="middle" fontSize="12" fill="#57606A">
            {spec.xName}
          </text>
        )}

        {spec.series.map((s, si) => {
          if (s.type === "bar") {
            const slot = bars.indexOf(s);
            return (
              <g key={si}>
                {s.points.map((p, pi) => {
                  const x = xAt(p.x) - (barW * bars.length) / 2 + slot * barW;
                  const y = yAt(Math.max(p.y, yMin));
                  return (
                    <rect key={pi} x={x} y={y} width={Math.max(barW - 2, 1)} height={Math.max(yAt(yMin) - y, 0)} fill={s.color}>
                      <title>{`${s.name} ${spec.categories[p.x] ?? p.x}：${p.y}`}</title>
                    </rect>
                  );
                })}
              </g>
            );
          }
          if (s.type === "line") {
            const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(p.x)} ${yAt(p.y)}`).join(" ");
            return (
              <g key={si}>
                <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
                {s.points.length <= 40 &&
                  s.points.map((p, pi) => <circle key={pi} cx={xAt(p.x)} cy={yAt(p.y)} r="2.6" fill={s.color} />)}
              </g>
            );
          }
          return (
            <g key={si}>
              {s.points.map((p, pi) => (
                <circle key={pi} cx={xAt(p.x)} cy={yAt(p.y)} r="4" fill={s.color} fillOpacity="0.75">
                  <title>{`${s.name} (${p.x}, ${p.y})`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-3 border-t border-zinc-100 pt-3">
        {spec.series.map((s, si) => (
          <span key={si} className="flex items-center gap-1.5 text-xs text-zinc-600">
            <i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.name || tt("数列 {n}", { n: si + 1 })}
          </span>
        ))}
      </div>
    </div>
  );
}

interface FlowNode {
  id: string;
  label: string;
  kind: string;
  x?: number;
  y?: number;
}

interface WorkflowTheme {
  surface: string;
  node: string;
  nodeBorder: string;
  text: string;
  muted: string;
  edge: string;
  accent: string;
  warning: string;
}

const DEFAULT_WORKFLOW_THEME: WorkflowTheme = {
  surface: "#FFFFFF",
  node: "#F5F7FA",
  nodeBorder: "#D0D7DE",
  text: "#1F2328",
  muted: "#57606A",
  edge: "#7D8590",
  accent: "#0969DA",
  warning: "#CF222E",
};

const WORKFLOW_THEME_KEYS = [
  "surface",
  "node",
  "nodeBorder",
  "text",
  "muted",
  "edge",
  "accent",
  "warning",
] as const;

/** I4 carrier 已把 theme 收成闭合八角色；查看器仍在边界再验一次，绝不接任意 CSS。 */
function workflowThemeOf(value: unknown): WorkflowTheme {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_WORKFLOW_THEME;
  }
  const raw = value as Record<string, unknown>;
  const actual = Object.keys(raw).sort();
  const expected = [...WORKFLOW_THEME_KEYS].sort();
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index]) ||
    !WORKFLOW_THEME_KEYS.every(
      (key) => typeof raw[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(raw[key]),
    )
  ) {
    return DEFAULT_WORKFLOW_THEME;
  }
  return Object.fromEntries(
    WORKFLOW_THEME_KEYS.map((key) => [key, raw[key]]),
  ) as unknown as WorkflowTheme;
}

function WorkflowViewer({ work, payload }: { work: WorkEntry; payload: WorkPayload }) {
  const tt = useUI();
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const graph = (body.workflow && typeof body.workflow === "object" ? body.workflow : body) as Record<
    string,
    unknown
  >;
  const theme = workflowThemeOf(graph.theme ?? body.theme);
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];

  const nodes: FlowNode[] = rawNodes
    .map((n, i) => {
      const o = (n && typeof n === "object" ? n : {}) as Record<string, unknown>;
      const id = String(o.id ?? i);
      return {
        id,
        label: String(o.label ?? o.title ?? o.name ?? id),
        kind: String(o.kind ?? o.type ?? ""),
        x: typeof o.x === "number" ? o.x : undefined,
        y: typeof o.y === "number" ? o.y : undefined,
      };
    })
    .filter((n) => n.id);

  if (nodes.length === 0) return <Fallback work={work} reason="这份工作流没有可画的节点，先看封面。" />;

  // 节点自带坐标就照画；没有坐标时按顺序竖排（一列一步），不猜布局。
  const laid = nodes.map((n, i) => ({
    ...n,
    x: n.x ?? 40,
    y: n.y ?? i * 92 + 20,
  }));
  const W = Math.max(...laid.map((n) => n.x + 220)) + 40;
  const H = Math.max(...laid.map((n) => n.y + 64)) + 24;
  const at = new Map(laid.map((n) => [n.id, n]));

  const edges = rawEdges
    .map((e) => {
      const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
      return { from: at.get(String(o.from ?? o.source)), to: at.get(String(o.to ?? o.target)) };
    })
    .filter((e): e is { from: FlowNode & { x: number; y: number }; to: FlowNode & { x: number; y: number } } =>
      Boolean(e.from && e.to),
    );

  return (
    <div
      className="overflow-auto rounded-xl border p-4"
      style={{ backgroundColor: theme.surface, borderColor: theme.nodeBorder }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" style={{ maxHeight: "72vh" }} role="img">
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill={theme.edge} />
          </marker>
        </defs>
        {edges.map((e, i) => (
          <path
            key={i}
            d={`M ${e.from.x + 110} ${e.from.y + 56} C ${e.from.x + 110} ${e.from.y + 80}, ${e.to.x + 110} ${
              e.to.y - 20
            }, ${e.to.x + 110} ${e.to.y}`}
            fill="none"
            stroke={theme.edge}
            strokeWidth="1.6"
            markerEnd="url(#wf-arrow)"
          />
        ))}
        {laid.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x}
              y={n.y}
              width="220"
              height="56"
              rx="10"
              fill={theme.node}
              stroke={theme.nodeBorder}
            />
            <rect
              x={n.x + 9}
              y={n.y + 12}
              width="4"
              height="32"
              rx="2"
              fill={/(?:gate|review|approval|decision|condition|warning|error)/i.test(n.kind)
                ? theme.warning
                : theme.accent}
            />
            <text x={n.x + 116} y={n.y + 28} textAnchor="middle" fontSize="14" fill={theme.text}>
              {n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}
            </text>
            {n.kind ? (
              <text x={n.x + 116} y={n.y + 44} textAnchor="middle" fontSize="9" fill={theme.muted}>
                {n.kind.length > 28 ? `${n.kind.slice(0, 27)}…` : n.kind}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-[11px]" style={{ color: theme.muted }}>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.accent }} />
          {tt("执行节点")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.warning }} />
          {tt("门槛或提醒")}
        </span>
      </div>
    </div>
  );
}

/* ---------------- game / website：结构化说明 + 隔离域新窗口入口 ---------------- */

// `oceanleo.game-bundle.v1` 信封里那段 `source` 是整份 HTML。它**不进 DOM**：
// 既不 srcdoc、也不 dangerouslySetInnerHTML —— 见上方安全说明。
// 装载器已在服务端把 `source` 摘掉，这里拿到的 payload 里根本没有源码。

function RuntimeAction({
  runtime,
  label,
  unavailable,
}: {
  runtime?: string;
  label: string;
  unavailable: string;
}) {
  const tt = useUI();
  if (!isActiveRuntimeUrl(runtime)) {
    return (
      <span className="inline-flex rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500">
        {tt(unavailable)}
      </span>
    );
  }
  return (
    <a
      href={runtime}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
    >
      {tt(label)}
    </a>
  );
}

function HtmlDeckViewer({ work }: { work: WorkEntry }) {
  const tt = useUI();
  return (
    <div className="flex flex-col gap-4">
      {work.view.pages?.length ? (
        <Pager pages={work.view.pages} title={work.title} />
      ) : (
        <Fallback work={work} reason="这份网页演示暂时没有逐页静态预览。" />
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-4">
        <RuntimeAction
          runtime={work.view.runtime}
          label="播放网页版"
          unavailable="网页版播放暂不可用"
        />
        {work.view.source ? (
          <a
            href={work.view.source}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            {tt("查看结构稿")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function GameBriefViewer({ work, payload }: { work: WorkEntry; payload: WorkPayload }) {
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const manifest = (body.manifest && typeof body.manifest === "object" ? body.manifest : {}) as Record<
    string,
    unknown
  >;
  const summary = typeof manifest.summary === "string" ? manifest.summary : work.summary;
  const tags = Array.isArray(manifest.tags) ? manifest.tags.map((t) => String(t)) : [];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={work.cover} alt={work.title} className="w-full rounded-lg border border-zinc-100" />
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-zinc-900">
          {typeof manifest.title === "string" && manifest.title ? manifest.title : work.title}
        </h3>
        {summary && <p className="text-sm leading-relaxed text-zinc-600">{summary}</p>}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <RuntimeAction runtime={work.view.runtime} label="打开试玩" unavailable="试玩暂不可用" />
      </div>
    </div>
  );
}

function WebsiteBriefViewer({ work, payload }: { work: WorkEntry; payload: WorkPayload }) {
  const tt = useUI();
  const site = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const purpose =
    work.readings?.purpose &&
    typeof work.readings.purpose === "object" &&
    !Array.isArray(work.readings.purpose)
      ? (work.readings.purpose as Record<string, unknown>)
      : {};
  const purposeRows = [
    ["给谁使用", purpose.who],
    ["要解决什么", purpose.problem],
    ["希望访客做什么", purpose.wantVisitorToDo],
    ["怎样算有效", purpose.successMetric],
  ].filter((row): row is [string, string] => typeof row[1] === "string" && row[1].length > 0);
  const siteName = typeof site.siteName === "string" ? site.siteName : work.title;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={work.cover} alt={work.title} className="w-full rounded-lg border border-zinc-100" />
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-zinc-900">{siteName}</h3>
        {work.summary ? <p className="text-sm leading-relaxed text-zinc-600">{work.summary}</p> : null}
      </div>
      {purposeRows.length > 0 ? (
        <dl className="grid gap-3 rounded-lg bg-zinc-50 p-4 text-sm">
          {purposeRows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-zinc-500">{tt(label)}</dt>
              <dd className="mt-0.5 leading-relaxed text-zinc-800">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <RuntimeAction runtime={work.view.runtime} label="打开网站" unavailable="网站暂不可用" />
        {work.view.source ? (
          <a
            href={work.view.source}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {tt("查看 site.json")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- paged：分页预览图 / 表格 ---------------- */

function Pager({ pages, title }: { pages: string[]; title: string }) {
  const tt = useUI();
  const [i, setI] = useState(0);
  const go = (d: number) => setI((v) => Math.min(pages.length - 1, Math.max(0, v + d)));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pages[i]} alt={`${title} · ${i + 1}`} className="max-h-[70vh] w-auto rounded shadow-sm" />
      </div>
      <div className="flex items-center justify-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={i === 0}
          className="rounded-full border border-zinc-200 px-3 py-1 text-zinc-600 disabled:opacity-40"
        >
          {tt("上一页")}
        </button>
        <span className="text-xs text-zinc-500">
          {i + 1} / {pages.length}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={i === pages.length - 1}
          className="rounded-full border border-zinc-200 px-3 py-1 text-zinc-600 disabled:opacity-40"
        >
          {tt("下一页")}
        </button>
      </div>
      {pages.length > 1 && (
        <div className="flex flex-wrap justify-center gap-2">
          {pages.map((p, pi) => (
            <button key={p} type="button" onClick={() => setI(pi)} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p}
                alt=""
                className={`h-14 w-auto rounded border ${pi === i ? "border-sky-500" : "border-zinc-200 opacity-70"}`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- 从真字节抽出来的正文：幻灯片 / 文档 / PDF 页 ---------------- */

// 这几个查看器是「打开」这件事的落点：deck / document / pdf / grid 交上来的是
// .pptx / .docx / .xlsx / .pdf 裸字节，产线位没有额外给每页预览图。
// 以前这种情况一律落回封面 —— 用户点开只看到一张放大的图，等于打不开。
// 现在构建期把字节真的解开（lib/works-extract.ts），这里渲染解出来的**文档结构**：
// 不是把字节当文字摆出来，是把 OOXML / PDF 里的段落、幻灯片、单元格取出来重排。

function ExtractNote({ from }: { from: string }) {
  const tt = useUI();
  const label = EXTRACT_SOURCE_LABELS[from] ?? from;
  return (
    <p className="text-[11px] text-zinc-400">
      {tt("站内文字版：由 {format} 原件在构建期解出，版式为站内重排，与原件排版不完全一致。", {
        format: tt(label),
      })}
    </p>
  );
}

function SlidesViewer({ slides }: { slides: DeckSlide[] }) {
  const tt = useUI();
  const [i, setI] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const at = Math.min(i, slides.length - 1);
  const slide = slides[at];

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-col justify-center gap-4 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm"
        style={{ aspectRatio: "16 / 9", containerType: "inline-size", overflow: "auto" }}
      >
        {slide.title && (
          <h3 className="whitespace-pre-wrap text-[3.6cqw] font-semibold leading-snug text-zinc-900">
            {slide.title}
          </h3>
        )}
        {slide.lines.length > 0 && (
          <ul className="flex flex-col gap-2">
            {slide.lines.map((line, li) => (
              <li
                key={li}
                className="flex gap-2 whitespace-pre-wrap text-[2.1cqw] leading-relaxed text-zinc-700"
              >
                <span className="mt-[0.7cqw] h-[0.6cqw] w-[0.6cqw] shrink-0 rounded-full bg-zinc-300" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
        {!slide.title && slide.lines.length === 0 && (
          <p className="text-center text-xs text-zinc-400">{tt("这一页只有图，没有文字。")}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => setI(Math.max(0, at - 1))}
          disabled={at === 0}
          className="rounded-full border border-zinc-200 px-3 py-1 text-zinc-600 disabled:opacity-40"
        >
          {tt("上一页")}
        </button>
        <span className="text-xs text-zinc-500">
          {at + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={() => setI(Math.min(slides.length - 1, at + 1))}
          disabled={at === slides.length - 1}
          className="rounded-full border border-zinc-200 px-3 py-1 text-zinc-600 disabled:opacity-40"
        >
          {tt("下一页")}
        </button>
        {slide.notes.length > 0 && (
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600"
          >
            {showNotes ? tt("收起演讲备注") : tt("演讲备注")}
          </button>
        )}
      </div>

      {showNotes && slide.notes.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600">
          {slide.notes.map((n, ni) => (
            <p key={ni} className="whitespace-pre-wrap">
              {n}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-1.5">
        {slides.map((s, si) => (
          <button
            key={s.index}
            type="button"
            onClick={() => setI(si)}
            title={s.title}
            className={`h-7 min-w-7 rounded border px-1.5 text-[11px] ${
              si === at ? "border-sky-500 bg-sky-50 text-sky-700" : "border-zinc-200 text-zinc-500"
            }`}
          >
            {s.index}
          </button>
        ))}
      </div>
    </div>
  );
}

function DocViewer({ blocks }: { blocks: DocBlock[] }) {
  const headingClass = (level: number) =>
    level <= 1
      ? "text-xl font-semibold text-zinc-900"
      : level === 2
        ? "text-base font-semibold text-zinc-800"
        : "text-sm font-semibold text-zinc-700";

  return (
    <div
      className="mx-auto w-full max-w-3xl overflow-auto rounded-xl border border-zinc-200 bg-white px-8 py-10 shadow-sm"
      style={{ maxHeight: "78vh" }}
    >
      <article className="flex flex-col gap-3">
        {blocks.map((b, i) =>
          b.kind === "table" ? (
            <div key={i} className="overflow-auto">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri} className={ri === 0 ? "bg-zinc-50" : ""}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border border-zinc-200 px-2.5 py-1.5 text-zinc-700">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : b.kind === "heading" ? (
            <h3 key={i} className={`mt-3 whitespace-pre-wrap ${headingClass(b.level)}`}>
              {b.text}
            </h3>
          ) : (
            <p
              key={i}
              className={`whitespace-pre-wrap text-sm leading-7 text-zinc-700 ${
                b.kind === "list" ? "pl-5 before:-ml-3.5 before:text-zinc-400 before:content-['·_']" : ""
              }`}
            >
              {b.text}
            </p>
          ),
        )}
      </article>
    </div>
  );
}

function PdfTextViewer({ pages }: { pages: PdfPage[] }) {
  const tt = useUI();
  const [i, setI] = useState(0);
  const at = Math.min(i, pages.length - 1);
  return (
    <div className="flex flex-col gap-3">
      <div
        className="mx-auto w-full max-w-3xl overflow-auto rounded-xl border border-zinc-200 bg-white px-8 py-10 shadow-sm"
        style={{ minHeight: "40vh", maxHeight: "72vh" }}
      >
        {pages[at].lines.map((line, li) => (
          <p key={li} className="whitespace-pre-wrap text-sm leading-7 text-zinc-700">
            {line}
          </p>
        ))}
      </div>
      <div className="flex items-center justify-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => setI(Math.max(0, at - 1))}
          disabled={at === 0}
          className="rounded-full border border-zinc-200 px-3 py-1 text-zinc-600 disabled:opacity-40"
        >
          {tt("上一页")}
        </button>
        <span className="text-xs text-zinc-500">
          {pages[at].index} / {pages.length}
        </span>
        <button
          type="button"
          onClick={() => setI(Math.min(pages.length - 1, at + 1))}
          disabled={at === pages.length - 1}
          className="rounded-full border border-zinc-200 px-3 py-1 text-zinc-600 disabled:opacity-40"
        >
          {tt("下一页")}
        </button>
      </div>
    </div>
  );
}

/** 既有分页预览图又有文字版时，让用户自己挑；两者都是「真的打开了」。 */
function PagesOrText({
  pages,
  title,
  text,
}: {
  pages: string[];
  title: string;
  text: React.ReactNode;
}) {
  const tt = useUI();
  const [mode, setMode] = useState<"image" | "text">("image");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-1.5">
        {(["image", "text"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              mode === m ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {m === "image" ? tt("原版式") : tt("文字版")}
          </button>
        ))}
      </div>
      {mode === "image" ? <Pager pages={pages} title={title} /> : text}
    </div>
  );
}

function SheetsViewer({ sheets }: { sheets: (WorkSheet | ExtractedSheet)[] }) {
  const [active, setActive] = useState(0);
  const sheet = sheets[Math.min(active, sheets.length - 1)];
  return (
    <div className="flex flex-col gap-2">
      {sheets.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-full px-2.5 py-1 text-xs ${
                i === active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {"caption" in sheet && sheet.caption?.length ? (
        <div className="text-sm font-medium text-zinc-800">
          {sheet.caption.map((c, i) => (
            <p key={i} className={i === 0 ? "" : "text-xs font-normal text-zinc-500"}>
              {c}
            </p>
          ))}
        </div>
      ) : null}
      <div className="overflow-auto rounded-xl border border-zinc-200 bg-white" style={{ maxHeight: "70vh" }}>
        <table className="w-full border-collapse text-sm">
          {sheet.header && (
            <thead className="sticky top-0 bg-zinc-50">
              <tr>
                {sheet.header.map((h, i) => (
                  <th key={i} className="border-b border-zinc-200 px-3 py-2 text-left font-medium text-zinc-700">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {(sheet.rows ?? []).map((row, ri) => (
              <tr key={ri} className={ri % 2 ? "bg-zinc-50/60" : ""}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border-b border-zinc-100 px-3 py-1.5 text-zinc-700">
                    {cell ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- 主入口 ---------------- */

export function WorksViewer({
  work,
  payload,
  extracted,
}: {
  work: WorkEntry;
  payload: WorkPayload;
  /** 构建期从 .pptx / .docx / .xlsx / .pdf 真字节解出来的正文，解不出为 null。 */
  extracted?: ExtractedContent | null;
}) {
  const tt = useUI();
  const v = work.view;

  // 抽出来的正文按形状挑查看器。这一段是 deck / document / pdf / grid
  // 「点开只是放大的封面」那条缺陷的正解：不等产线位补预览图，直接开原件。
  const textView =
    extracted?.form === "slides" ? (
      <div className="flex flex-col gap-2">
        <SlidesViewer slides={extracted.slides} />
        <ExtractNote from={extracted.from} />
      </div>
    ) : extracted?.form === "doc" ? (
      <div className="flex flex-col gap-2">
        <DocViewer blocks={extracted.blocks} />
        <ExtractNote from={extracted.from} />
      </div>
    ) : extracted?.form === "pages" ? (
      <div className="flex flex-col gap-2">
        <PdfTextViewer pages={extracted.pages} />
        <ExtractNote from={extracted.from} />
      </div>
    ) : extracted?.form === "sheets" ? (
      <div className="flex flex-col gap-2">
        <SheetsViewer sheets={extracted.sheets} />
        <ExtractNote from={extracted.from} />
      </div>
    ) : null;

  switch (v.kind) {
    case "design-document":
      return <DesignDocumentViewer work={work} payload={payload} />;

    case "chart":
      return <ChartViewer work={work} payload={payload} />;

    case "workflow":
      return <WorkflowViewer work={work} payload={payload} />;

    case "vector":
      return (
        <div className="flex justify-center rounded-xl border border-zinc-200 bg-white p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.src} alt={work.title} className="max-h-[70vh] w-auto" />
        </div>
      );

    case "website":
      return <WebsiteBriefViewer work={work} payload={payload} />;

    case "game":
      return <GameBriefViewer work={work} payload={payload} />;

    case "grid":
      // 片段自带 sheets[] 最准（产线位知道哪几张表要给人看）；
      // 没给就用构建期从 .xlsx 解出来的表；再没有才是预览图 / 封面。
      if (v.sheets?.length) return <SheetsViewer sheets={v.sheets} />;
      if (textView) return textView;
      if (v.pages?.length) return <Pager pages={v.pages} title={work.title} />;
      return <Fallback work={work} reason="这份表格打不开：既不是能解开的 .xlsx，也没有分页预览图。请下载后本地打开。" />;

    case "deck":
      if (work.deliveryFamily === "html") return <HtmlDeckViewer work={work} />;
      // 两样都有就让用户挑：原版式（预览图）保真，文字版可选可搜。
      if (v.pages?.length && textView) {
        return <PagesOrText pages={v.pages} title={work.title} text={textView} />;
      }
      if (v.pages?.length) return <Pager pages={v.pages} title={work.title} />;
      if (textView) return textView;
      return (
        <Fallback
          work={work}
          reason="这一件的原件解不出可读正文（可能是扫描件或加密文档），也没有分页预览图。请下载后本地打开。"
        />
      );

    case "document":
    case "pdf":
      // 两样都有就让用户挑：原版式（预览图）保真，文字版可选可搜。
      if (v.pages?.length && textView) {
        return <PagesOrText pages={v.pages} title={work.title} text={textView} />;
      }
      if (v.pages?.length) return <Pager pages={v.pages} title={work.title} />;
      if (textView) return textView;
      return (
        <Fallback
          work={work}
          reason="这一件的原件解不出可读正文（可能是扫描件或加密文档），也没有分页预览图。请下载后本地打开。"
        />
      );

    case "image":
      return (
        <div className="flex justify-center rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.src} alt={work.title} className="max-h-[75vh] w-auto rounded shadow-sm" />
        </div>
      );

    case "video":
      return (
        <div className="flex flex-col gap-3">
          <video
            src={v.src}
            poster={v.poster}
            controls
            playsInline
            className="w-full rounded-xl border border-zinc-200 bg-black"
            style={{ maxHeight: "70vh" }}
          />
          {v.frames?.length ? (
            <div className="flex flex-wrap gap-2">
              {v.frames.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f} src={f} alt="" className="h-16 w-auto rounded border border-zinc-200" />
              ))}
            </div>
          ) : null}
        </div>
      );

    case "audio":
      return (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
          {v.waveform ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.waveform} alt={tt("波形")} className="w-full rounded bg-zinc-50" />
          ) : null}
          <audio src={v.src} controls className="w-full" />
        </div>
      );

    case "model-3d":
      return (
        <div className="flex flex-col gap-3">
          {v.stills?.length || v.poster ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[...(v.poster ? [v.poster] : []), ...(v.stills ?? [])].map((s) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s} src={s} alt={work.title} className="w-full rounded-lg border border-zinc-200" />
              ))}
            </div>
          ) : (
            <Fallback work={work} reason="站内暂无三维查看器，也还没有多视角静帧，先看封面。" />
          )}
          <p className="text-xs text-zinc-500">{tt("站内以多视角静帧呈现；模型本体请下载后用三维软件打开。")}</p>
        </div>
      );

    default:
      return <Fallback work={work} reason="这一类还没有站内查看器。" />;
  }
}
