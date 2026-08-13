"use client";

import { useState } from "react";
import { useUI } from "@oceanleo/ui/i18n";
import {
  EXTRACT_SOURCE_LABELS,
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
// 安全：这里有两个 iframe，sandbox 值都是**写死的字面量**，不是算出来的。
//   website → sandbox=""              零权能：脚本不跑、拿不到同源
//   game    → sandbox="allow-scripts" 游戏要跑脚本；**绝不加 allow-same-origin**
// 两者同给等于把 asset.oceanleo.com 的源交给被嵌内容（SSO cookie 失守），
// 见 tests/untrusted-render-surface.test.mjs UC-3 与
// docs/architecture/oceanleo-untrusted-content-isolation.md。

export type WorkPayload = unknown;

function Frame({ children, aspect }: { children: React.ReactNode; aspect?: number }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-white"
      style={{ aspectRatio: aspect && aspect > 0 ? String(aspect) : "16 / 10" }}
    >
      {children}
    </div>
  );
}

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

// 画布尺寸按容器宽度自适应：所有尺寸换算成百分比，字号换算成 cqw
// （1cqw = 容器宽度的 1%），这样缩放时版面比例与字号级差同时守住。
function DesignDocumentViewer({ work, payload }: { work: WorkEntry; payload: WorkPayload }) {
  const tt = useUI();
  const doc = designDocOf(payload);
  if (!doc) return <Fallback work={work} reason="这份设计稿的结构读不出来，先看封面。" />;

  const W = typeof doc.width === "number" && doc.width > 0 ? doc.width : 1240;
  const H = typeof doc.height === "number" && doc.height > 0 ? doc.height : 1754;
  const elements = [...(doc.elements ?? [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const pct = (v: number, base: number) => `${(v / base) * 100}%`;

  return (
    <div
      className="mx-auto w-full overflow-hidden rounded-xl border border-zinc-200 shadow-sm"
      style={{
        containerType: "inline-size",
        aspectRatio: `${W} / ${H}`,
        background: doc.background ?? "#FFFFFF",
        position: "relative",
        maxWidth: "min(100%, 56rem)",
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
                fontFamily: el.fontFamily,
                fontSize: `${(size / W) * 100}cqw`,
                fontWeight: el.fontWeight ?? 400,
                lineHeight: el.lineHeight ?? 1.35,
                textAlign: el.align ?? "left",
                whiteSpace: "pre-wrap",
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
            return (
              <div
                key={key}
                style={{ ...box, background: "#EEF1F5", borderRadius: el.radius ?? 0 }}
                className="flex items-center justify-center overflow-hidden text-[10px] text-zinc-400"
                title={el.alt}
              >
                {el.alt ?? tt("图片")}
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
                borderRadius: el.radius ?? 0,
              }}
            />
          );
        }

        if (el.type === "path") {
          return (
            <svg
              key={key}
              style={box}
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
        return (
          <div
            key={key}
            style={{
              ...box,
              background: el.fill ?? "transparent",
              border:
                el.stroke && (el.strokeWidth ?? 0) > 0
                  ? `${el.strokeWidth}px solid ${el.stroke}`
                  : undefined,
              borderRadius: el.type === "ellipse" ? "50%" : el.radius ?? 0,
            }}
          />
        );
      })}
    </div>
  );
}

/* ---------------- chart / workflow：站内渲染结构化 JSON ---------------- */

function ChartViewer({ work, payload }: { work: WorkEntry; payload: WorkPayload }) {
  if (work.view.src.endsWith(".svg")) {
    return (
      <div className="flex justify-center rounded-xl border border-zinc-200 bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={work.view.src} alt={work.title} className="max-h-[70vh] w-auto" />
      </div>
    );
  }

  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const chart = (body.chart && typeof body.chart === "object" ? body.chart : body) as Record<string, unknown>;
  const categories = Array.isArray(chart.categories) ? chart.categories.map((c) => String(c)) : [];
  const rawSeries = Array.isArray(chart.series) ? chart.series : [];
  const series = rawSeries
    .map((s) => {
      const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const values = Array.isArray(o.values ?? o.data)
        ? ((o.values ?? o.data) as unknown[]).map((v) => (typeof v === "number" ? v : Number(v)))
        : [];
      return { name: String(o.name ?? ""), values: values.filter((v) => Number.isFinite(v)) };
    })
    .filter((s) => s.values.length > 0);

  if (series.length === 0) return <Fallback work={work} reason="这份图表没有可画的数列，先看封面。" />;

  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const palette = ["#1F6FEB", "#E5484D", "#12A594", "#F76808", "#8E4EC6"];
  const groups = Math.max(...series.map((s) => s.values.length));

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex h-72 items-end gap-3">
        {Array.from({ length: groups }, (_, gi) => (
          <div key={gi} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <div className="flex h-full items-end justify-center gap-0.5">
              {series.map((s, si) => (
                <div
                  key={si}
                  title={`${s.name} ${s.values[gi] ?? 0}`}
                  style={{
                    height: `${((s.values[gi] ?? 0) / max) * 100}%`,
                    background: palette[si % palette.length],
                  }}
                  className="w-full max-w-8 rounded-t"
                />
              ))}
            </div>
            <div className="truncate text-center text-[10px] text-zinc-500">{categories[gi] ?? gi + 1}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 border-t border-zinc-100 pt-3">
        {series.map((s, si) => (
          <span key={si} className="flex items-center gap-1.5 text-xs text-zinc-600">
            <i className="h-2.5 w-2.5 rounded-sm" style={{ background: palette[si % palette.length] }} />
            {s.name || `series ${si + 1}`}
          </span>
        ))}
      </div>
    </div>
  );
}

interface FlowNode {
  id: string;
  label: string;
  x?: number;
  y?: number;
}

function WorkflowViewer({ work, payload }: { work: WorkEntry; payload: WorkPayload }) {
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const graph = (body.workflow && typeof body.workflow === "object" ? body.workflow : body) as Record<
    string,
    unknown
  >;
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];

  const nodes: FlowNode[] = rawNodes
    .map((n, i) => {
      const o = (n && typeof n === "object" ? n : {}) as Record<string, unknown>;
      const id = String(o.id ?? i);
      return {
        id,
        label: String(o.label ?? o.title ?? o.name ?? id),
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
    <div className="overflow-auto rounded-xl border border-zinc-200 bg-white p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" style={{ maxHeight: "72vh" }} role="img">
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="#7D8590" />
          </marker>
        </defs>
        {edges.map((e, i) => (
          <path
            key={i}
            d={`M ${e.from.x + 110} ${e.from.y + 56} C ${e.from.x + 110} ${e.from.y + 80}, ${e.to.x + 110} ${
              e.to.y - 20
            }, ${e.to.x + 110} ${e.to.y}`}
            fill="none"
            stroke="#7D8590"
            strokeWidth="1.6"
            markerEnd="url(#wf-arrow)"
          />
        ))}
        {laid.map((n) => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width="220" height="56" rx="10" fill="#F5F7FA" stroke="#D0D7DE" />
            <text x={n.x + 110} y={n.y + 33} textAnchor="middle" fontSize="14" fill="#1F2328">
              {n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ---------------- game：没有解包入口时的可读说明 ---------------- */

// `oceanleo.game-bundle.v1` 信封里那段 `source` 是整份 HTML。它**不进 DOM**：
// 既不 srcdoc、也不 dangerouslySetInnerHTML —— 见上方安全说明。
// 装载器已在服务端把 `source` 摘掉，这里拿到的 payload 里根本没有源码。

function GameBriefViewer({ work, payload }: { work: WorkEntry; payload: WorkPayload }) {
  const tt = useUI();
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
      <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
        {tt(
          "这一件交上来的是游戏信封（整份网页打包成一个 JSON），站内不解包运行：可运行的网页必须由沙箱域取回并在那边合成，塞进本页的 iframe 会让它继承本站身份。要试玩请下载后本地打开，或等这一件补上解包后的入口页。",
        )}
      </p>
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
      // sandbox="" 是零权能：脚本不跑、拿不到同源。**一个 token 都不许加。**
      if (!/\.html?$/i.test(v.src)) {
        return <Fallback work={work} reason="这一件只有打包字节，站内不解包运行；请下载后本地打开。" />;
      }
      return (
        <Frame aspect={v.aspect}>
          <iframe
            src={v.src}
            title={work.title}
            sandbox=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full border-0 bg-white"
          />
        </Frame>
      );

    case "game":
      // 游戏要跑脚本，所以给 allow-scripts —— **绝不与 allow-same-origin 同给**。
      if (!/\.html?$/i.test(v.src)) {
        // `.game.json` 信封（正文是整份 HTML）不在这里跑：把源码塞进 srcdoc 会让
        // iframe 继承本站 origin，域隔离当场作废（GameRoute.tsx:101-102 明令禁止，
        // 也是安全内核 security.untrusted-content-domain 的直接要求）。
        // 所以站内给的是这一件**看得懂的说明**，跑要到沙箱域或下载后本地打开。
        return <GameBriefViewer work={work} payload={payload} />;
      }
      return (
        <Frame aspect={v.aspect}>
          <iframe
            src={v.src}
            title={work.title}
            sandbox="allow-scripts"
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full border-0 bg-white"
          />
        </Frame>
      );

    case "grid":
      // 片段自带 sheets[] 最准（产线位知道哪几张表要给人看）；
      // 没给就用构建期从 .xlsx 解出来的表；再没有才是预览图 / 封面。
      if (v.sheets?.length) return <SheetsViewer sheets={v.sheets} />;
      if (textView) return textView;
      if (v.pages?.length) return <Pager pages={v.pages} title={work.title} />;
      return <Fallback work={work} reason="这份表格打不开：既不是能解开的 .xlsx，也没有分页预览图。请下载后本地打开。" />;

    case "deck":
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
