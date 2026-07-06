"use client";

import { useState } from "react";
import { useUI } from "@oceanleo/ui/i18n";
import { PALETTES_V2 } from "@/lib/template-dna";
import { FX_META, type FxMeta, type Mood } from "@/lib/element-showcase";

// 网站风格元素专区 —— 动效灵感墙。
// 每张卡片是一个 <iframe>，实时加载 /elements/<fx> 的「展示级」自包含 HTML
// （全强度特效 + 仿真 hero），点「全屏预览」在弹层里整页打开同一份 HTML。
// 用户可切「预览配色」，所有 iframe 即时换色重载。

const MOODS: { key: Mood | "all"; label: string; hint: string }[] = [
  { key: "all", label: "全部", hint: "" },
  { key: "flashy", label: "华丽炫动", hint: "渐变流光 · 有机变形 · 舞台聚光" },
  { key: "minimal", label: "极简克制", hint: "网格点阵 · 微光泽 · 几何留白" },
  { key: "cute", label: "卡通可爱", hint: "纸屑 · 星光 · 波普斜纹" },
];

export function StyleElements() {
  const tt = useUI();
  const [mood, setMood] = useState<Mood | "all">("all");
  const [paletteKey, setPaletteKey] = useState<string>("");
  const [preview, setPreview] = useState<FxMeta | null>(null);

  const list = FX_META.filter((f) => mood === "all" || f.mood === mood);

  // paletteKey="" 表示「跟随每个特效各自的推荐配色」；否则统一用选中的配色。
  const paletteFor = (m: FxMeta) => paletteKey || m.palette;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-sky-500 px-6 py-12 text-center text-white sm:py-14">
        <h1 className="text-2xl font-extrabold sm:text-4xl">
          {tt("网站风格元素专区 · 动效灵感墙")}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-white/85 sm:text-base">
          {tt(
            "汇集 {n} 种可直接用于建站的网页动态背景效果，分「华丽 / 极简 / 卡通可爱」三档气质。每个都是独立可打开的 HTML 演示页——下方为实时预览，点「全屏预览」整页查看。纯 CSS 实现、无第三方运行时依赖，可放心商用。",
            { n: FX_META.length },
          )}
        </p>
      </section>

      {/* 控制区 */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <span className="mt-1.5 shrink-0 text-sm font-semibold text-zinc-800">{tt("气质")}</span>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m.key}
                title={m.hint ? tt(m.hint) : undefined}
                onClick={() => setMood(m.key)}
                className={`rounded-full px-4 py-1.5 text-sm transition ${
                  mood === m.key ? "bg-violet-500 text-white shadow-sm" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {tt(m.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-100 pt-3">
          <span className="shrink-0 text-sm font-semibold text-zinc-800">{tt("预览配色")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setPaletteKey("")}
              className={`rounded-full px-3 py-1 text-xs transition ${
                paletteKey === "" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {tt("各自推荐")}
            </button>
            {PALETTES_V2.map((p) => (
              <button
                key={p.key}
                title={tt(p.label)}
                onClick={() => setPaletteKey(p.key)}
                className={`h-6 w-6 rounded-full border-2 transition ${
                  paletteKey === p.key ? "scale-110 border-zinc-900" : "border-white shadow"
                }`}
                style={{ background: `linear-gradient(135deg,${p.gradFrom},${p.gradTo})` }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 效果网格：每张卡一个实时 iframe 预览 */}
      <section className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => (
          <FxCard
            key={m.fx}
            meta={m}
            paletteKey={paletteFor(m)}
            onPreview={() => setPreview(m)}
          />
        ))}
      </section>

      <p className="mt-8 text-center text-xs text-zinc-400">
        {tt(
          "以上动效已内置在模板库的每套网站中，由模板自身风格自动匹配；套用模板即拥有，无需手动配置。",
        )}
      </p>

      {preview && (
        <PreviewModal meta={preview} paletteKey={paletteFor(preview)} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function FxCard({
  meta,
  paletteKey,
  onPreview,
}: {
  meta: FxMeta;
  paletteKey: string;
  onPreview: () => void;
}) {
  const tt = useUI();
  const src = `/elements/${meta.fx}?palette=${encodeURIComponent(paletteKey)}&chrome=0`;

  return (
    <div className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 transition hover:shadow-lg">
      {/* 实时 iframe 预览：加载展示级 HTML（chrome=0 只留特效+标题） */}
      <div className="relative h-48 w-full overflow-hidden bg-zinc-100">
        <iframe
          key={src}
          src={src}
          title={meta.name}
          loading="lazy"
          className="pointer-events-none h-full w-full border-0"
          scrolling="no"
        />
        {/* 悬停出「全屏预览」 */}
        <button
          onClick={onPreview}
          className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100"
        >
          <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-zinc-900 shadow-lg">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
            {tt("全屏预览")}
          </span>
        </button>
      </div>

      {/* 说明区 */}
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">
            {tt(meta.name)}
            <span className="ml-1.5 text-xs font-normal text-zinc-400">{meta.en}</span>
          </h3>
          <MoodTag mood={meta.mood} />
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{tt(meta.desc)}</p>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] text-zinc-400">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z" strokeLinejoin="round" />
            </svg>
            {meta.source}
          </span>
          <a
            href={`/elements/${meta.fx}?palette=${encodeURIComponent(paletteKey)}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-medium text-violet-600 hover:text-violet-700"
          >
            {tt("打开 HTML ↗")}
          </a>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({
  meta,
  paletteKey,
  onClose,
}: {
  meta: FxMeta;
  paletteKey: string;
  onClose: () => void;
}) {
  const tt = useUI();
  const src = `/elements/${meta.fx}?palette=${encodeURIComponent(paletteKey)}`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-zinc-900">
              {tt(meta.name)} <span className="text-zinc-400">{meta.en}</span>
            </h3>
            <p className="truncate text-xs text-zinc-400">{tt(meta.desc)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-violet-400 hover:text-violet-600"
            >
              {tt("新标签打开 ↗")}
            </a>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
              aria-label={tt("关闭")}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <iframe key={src} src={src} title={meta.name} className="h-full w-full flex-1 border-0" />
      </div>
    </div>
  );
}

function MoodTag({ mood }: { mood: Mood }) {
  const tt = useUI();
  const map: Record<Mood, { label: string; cls: string }> = {
    flashy: { label: "华丽", cls: "bg-fuchsia-50 text-fuchsia-600" },
    minimal: { label: "极简", cls: "bg-sky-50 text-sky-600" },
    cute: { label: "可爱", cls: "bg-amber-50 text-amber-600" },
  };
  const m = map[mood];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>
      {tt(m.label)}
    </span>
  );
}
