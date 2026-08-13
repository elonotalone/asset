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
