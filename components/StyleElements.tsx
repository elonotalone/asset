"use client";

import { useMemo, useState } from "react";
import { useUI } from "@oceanleo/ui/i18n";
import { PALETTES_V2, type PaletteV2 } from "@/lib/template-dna";
import {
  decorLayer,
  effectsStyles,
  type AccentFx,
} from "@/lib/template-effects";

// 网站风格元素专区 —— 把模板引擎里那套确定性动效（AccentFx）做成一个「灵感墙」：
// 每张卡片就是一个特效的实时渲染（复用 template-effects.ts 的同一份 CSS + 装饰 HTML），
// 用户切配色即可预览，按气质分「华丽 / 极简 / 卡通可爱」三档。给用户建站找灵感用，
// 不新造第三方运行时依赖（纯 CSS，规避 animate.css/Hover.css 的许可证坑）。

type Mood = "flashy" | "minimal" | "cute";

interface FxInfo {
  fx: AccentFx;
  name: string; // 中文名
  en: string;
  mood: Mood;
  desc: string;
  source: string; // 灵感来源（开源项目/流派）
}

// 与 template-effects.ts 的 AccentFx 家族一一对应，附上气质分组 + 灵感出处。
const FX_INFOS: FxInfo[] = [
  // —— 华丽 flashy ——
  { fx: "aurora", name: "极光流幕", en: "Aurora", mood: "flashy", desc: "多层大径向渐变缓慢漂移融合，像北极光在背后流动", source: "react-bits / Aurora" },
  { fx: "blobs", name: "有机色块", en: "Morphing Blobs", mood: "flashy", desc: "边缘不断变形的柔和大色团，现代 SaaS 常用", source: "blobmaker / haikei" },
  { fx: "beams", name: "光束", en: "Light Beams", mood: "flashy", desc: "斜向光束缓慢明灭，营造舞台聚光感", source: "magic-ui / beams" },
  { fx: "mesh", name: "网格光斑", en: "Mesh Glow", mood: "flashy", desc: "细网格叠一团锥形渐变光斑，科技感强", source: "mesh-gradient" },
  { fx: "orbs", name: "浮动光球", en: "Floating Orbs", mood: "flashy", desc: "多个模糊大光球缓慢漂浮，柔和梦幻", source: "hero-patterns" },
  { fx: "waves", name: "波浪", en: "Waves", mood: "flashy", desc: "底部 SVG 波浪左右轻摆，适合餐饮/生活类", source: "getwaves.io" },
  { fx: "neon-grid", name: "霓虹网格", en: "Neon Grid", mood: "flashy", desc: "会平移的发光网格 + 光晕，深色霓虹专用", source: "arc-animations" },
  // —— 极简 minimal ——
  { fx: "grid", name: "极简网格", en: "Fine Grid", mood: "minimal", desc: "淡淡的等距网格，径向遮罩淡出，克制专业", source: "tailwind-patterns" },
  { fx: "dots", name: "点阵", en: "Dot Grid", mood: "minimal", desc: "均匀圆点阵列，安静有秩序", source: "hero-patterns" },
  { fx: "constellation", name: "星座连线", en: "Constellation", mood: "minimal", desc: "疏密两层点阵缓慢平移，暗示星座连线", source: "particles.js 观感" },
  { fx: "shimmer", name: "光泽扫过", en: "Shimmer", mood: "minimal", desc: "一道柔和高光斜向扫过整块，精致微交互", source: "shiny-text / react-bits" },
  { fx: "rings", name: "同心环", en: "Rings", mood: "minimal", desc: "两枚描边圆环轻浮动，几何留白", source: "geometric-bg" },
  { fx: "spotlight", name: "顶光", en: "Spotlight", mood: "minimal", desc: "顶部一束径向柔光，聚焦标题区", source: "aceternity spotlight" },
  { fx: "noise", name: "颗粒质感", en: "Grain", mood: "minimal", desc: "极淡的胶片颗粒噪点，editorial 质感", source: "grainy-gradients" },
  // —— 卡通可爱 cute ——
  { fx: "confetti", name: "五彩纸屑", en: "Confetti", mood: "cute", desc: "彩色小纸片缓缓飘落，庆典/活动氛围", source: "canvas-confetti 观感" },
  { fx: "sparkle", name: "星光闪烁", en: "Sparkle", mood: "cute", desc: "四角星随机呼吸闪烁，灵动可爱", source: "react-bits / sparkles" },
  { fx: "stripes", name: "波普斜纹", en: "Pop Stripes", mood: "cute", desc: "斜向条带缓缓移动，波普活泼", source: "css-stripes" },
];

const MOODS: { key: Mood; label: string; hint: string }[] = [
  { key: "flashy", label: "华丽炫动", hint: "渐变流光 · 有机变形 · 舞台聚光" },
  { key: "minimal", label: "极简克制", hint: "网格点阵 · 微光泽 · 几何留白" },
  { key: "cute", label: "卡通可爱", hint: "纸屑 · 星光 · 波普斜纹" },
];

export function StyleElements() {
  const tt = useUI();
  const [moodFilter, setMoodFilter] = useState<Mood | "all">("all");
  const [paletteKey, setPaletteKey] = useState<string>("ocean");

  const palette: PaletteV2 =
    PALETTES_V2.find((p) => p.key === paletteKey) || PALETTES_V2[0];

  // 复用模板引擎的完整动效 CSS（配色 token 取自当前预览配色），一次性注入。
  const css = useMemo(() => effectsStyles(palette), [palette]);

  const list = FX_INFOS.filter(
    (f) => moodFilter === "all" || f.mood === moodFilter,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* 动效 CSS：整块作用域，卡片内 .leo-* 类即可生效 */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* Hero */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-sky-500 px-6 py-12 text-center text-white sm:py-14">
        <h1 className="text-2xl font-extrabold sm:text-4xl">
          {tt("网站风格元素专区 · 动效灵感墙")}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-white/85 sm:text-base">
          {tt(
            "汇集 {n} 种可直接用于建站的网页动态背景效果，分「华丽 / 极简 / 卡通可爱」三档气质。全部为纯 CSS 实现、无第三方运行时依赖，可放心商用。切换配色即可实时预览。",
            { n: FX_INFOS.length },
          )}
        </p>
      </section>

      {/* 控制区：气质筛选 + 配色预览 */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <span className="mt-1.5 shrink-0 text-sm font-semibold text-zinc-800">
            {tt("气质")}
          </span>
          <div className="flex flex-wrap gap-2">
            <MoodChip active={moodFilter === "all"} onClick={() => setMoodFilter("all")}>
              {tt("全部")}
            </MoodChip>
            {MOODS.map((m) => (
              <MoodChip
                key={m.key}
                active={moodFilter === m.key}
                onClick={() => setMoodFilter(m.key)}
                title={tt(m.hint)}
              >
                {tt(m.label)}
              </MoodChip>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-100 pt-3">
          <span className="shrink-0 text-sm font-semibold text-zinc-800">
            {tt("预览配色")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {PALETTES_V2.map((p) => (
              <button
                key={p.key}
                title={tt(p.label)}
                onClick={() => setPaletteKey(p.key)}
                className={`h-6 w-6 rounded-full border-2 transition ${
                  paletteKey === p.key
                    ? "scale-110 border-zinc-900"
                    : "border-white shadow"
                }`}
                style={{ background: `linear-gradient(135deg,${p.gradFrom},${p.gradTo})` }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 效果网格 */}
      <section className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((info) => (
          <FxCard key={info.fx} info={info} palette={palette} />
        ))}
      </section>

      <p className="mt-8 text-center text-xs text-zinc-400">
        {tt(
          "以上动效已内置在模板库的每套网站中，由模板自身风格自动匹配；无需手动配置，套用模板即拥有。",
        )}
      </p>
    </div>
  );
}

function FxCard({ info, palette }: { info: FxInfo; palette: PaletteV2 }) {
  const tt = useUI();
  // 每张卡固定 seed，让纸屑/星光布局稳定；用 fx 名 hash 出一个数。
  const seed = useMemo(
    () => info.fx.split("").reduce((a, c) => a + c.charCodeAt(0), 0),
    [info.fx],
  );
  const bg = `linear-gradient(135deg,${palette.gradFrom},${palette.gradTo})`;
  const onDark = palette.heroDark;

  return (
    <div className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 transition hover:shadow-md">
      {/* 实时预览区：与模板 hero 同样的底色 + 装饰层 */}
      <div
        className="relative flex h-44 items-center justify-center overflow-hidden"
        style={{ background: bg, color: onDark ? "#fff" : palette.ink }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          dangerouslySetInnerHTML={{ __html: decorLayer(palette, info.fx, seed) }}
        />
        <div className="relative text-center">
          <span
            className="text-lg font-bold tracking-tight leo-neon-glow"
            style={{ textShadow: onDark ? "0 1px 16px #0006" : "none" }}
          >
            {tt(info.name)}
          </span>
        </div>
      </div>

      {/* 说明区 */}
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">
            {tt(info.name)}
            <span className="ml-1.5 text-xs font-normal text-zinc-400">{info.en}</span>
          </h3>
          <MoodTag mood={info.mood} />
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{tt(info.desc)}</p>
        <p className="mt-2 flex items-center gap-1 text-[11px] text-zinc-400">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z" strokeLinejoin="round" />
          </svg>
          {tt("灵感来源")}：{info.source}
        </p>
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

function MoodChip({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-full px-4 py-1.5 text-sm transition ${
        active ? "bg-violet-500 text-white shadow-sm" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
