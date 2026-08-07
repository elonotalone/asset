"use client";

import { useMemo, useState } from "react";
import { useUI } from "@oceanleo/ui/i18n";
import { DESIGN_FILTER_GROUPS } from "@/lib/assets";
import {
  DESIGN_TYPE_LABELS,
  DESIGN_TYPE_MATERIALS,
  designTypeOf,
  type DesignAssetType,
} from "@/lib/design-taxonomy";
import { DESIGN_TEMPLATES, editUrl, filterTemplates, type DesignTemplate } from "@/lib/design-templates";

// 平面设计成品的类型页（海报 / 封面 / 卡证 / 简历 …）。曾经这是一个叫「设计模板」的
// 专区，一格塞下全部 684 件；现在按素材类型拆成 10 格，每格只渲染属于自己那个类型的
// 成品。类型内部再按 物料（开本）/ 渠道 / 行业 三条维度横向筛选。
// 模板由 design 站的 AI 拼版工作流生成（见 docs/architecture/oceanleo-design-ai-layout.md）。

const ALL = "全部";

// 只把**这一格里真实存在**的取值做成筛选项，顺序沿用 DESIGN_FILTER_GROUPS 的策划顺序，
// 没被策划过的真实取值接在后面。这样不会出现点了没结果的死选项。
function optionsPresent(values: string[], curated: string[]): string[] {
  const present = new Set(values);
  const ordered = curated.filter((o) => o !== ALL && present.has(o));
  const rest = [...present].filter((v) => !ordered.includes(v)).sort();
  return [ALL, ...ordered, ...rest];
}

function FilterColumn({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const tt = useUI();
  return (
    <div className="min-w-0">
      <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-400">{tt(label)}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`rounded-full px-2.5 py-1 text-xs transition ${
                active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {tt(opt)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TemplateCard({ t, onOpen }: { t: DesignTemplate; onOpen: (t: DesignTemplate) => void }) {
  return (
    <button
      onClick={() => onOpen(t)}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-400"
    >
      <div className="relative w-full overflow-hidden bg-zinc-100" style={{ aspectRatio: `${t.width} / ${t.height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.preview}
          alt={t.title}
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:scale-[1.03]"
        />
        <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {t.material}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
        <span className="truncate text-sm font-medium text-zinc-800">{t.title}</span>
        <span className="truncate text-xs text-zinc-500">
          {t.industry} · {t.channel}
        </span>
      </div>
    </button>
  );
}

function DetailModal({ t, onClose }: { t: DesignTemplate; onClose: () => void }) {
  const tt = useUI();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white sm:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-1 items-center justify-center bg-zinc-100 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.preview} alt={t.title} className="max-h-[70vh] w-auto rounded-lg shadow" />
        </div>
        <div className="flex w-full flex-col gap-3 p-5 sm:w-72">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">{t.title}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {t.industry} · {t.channel} · {t.material}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {t.width} × {t.height} px
            </p>
          </div>
          <a
            href={editUrl(t)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-sky-500 px-4 py-2.5 text-center text-sm font-medium text-white transition hover:bg-sky-600"
          >
            {tt("拿去编辑")}
          </a>
          <a
            href={t.preview}
            target="_blank"
            rel="noopener noreferrer"
            download={`${t.id}.webp`}
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            {tt("下载预览图")}
          </a>
          {t.attributions.length > 0 && (
            <div className="mt-1 border-t border-zinc-100 pt-3 text-[11px] leading-relaxed text-zinc-400">
              <div className="mb-1 font-medium text-zinc-500">{tt("配图来源（可商用）")}</div>
              {t.attributions.slice(0, 3).map((a, i) => (
                <div key={i} className="truncate">
                  {a}
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-auto text-sm text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline"
          >
            {tt("关闭")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DesignZone({ designType }: { designType: DesignAssetType }) {
  const tt = useUI();
  const [sel, setSel] = useState<Record<string, string>>({
    channel: ALL,
    material: ALL,
    industry: ALL,
  });
  const [input, setInput] = useState("");
  const [active, setActive] = useState<DesignTemplate | null>(null);

  // 这一格的全部成品：manifest 里 material 归属本类型的那些。
  const scoped = useMemo(
    () => DESIGN_TEMPLATES.filter((t) => designTypeOf(t.material) === designType),
    [designType],
  );

  // 三条筛选维度的选项都从 scoped 里真实取值生成。「物料」的策划顺序来自本类型的
  // DESIGN_TYPE_MATERIALS；只有一个开本时整列不渲染（一个选项的筛选器是噪音）。
  const groups = useMemo(() => {
    const curated = Object.fromEntries(DESIGN_FILTER_GROUPS.map((g) => [g.key, g.options]));
    const built = [
      {
        key: "material",
        label: "物料",
        options: optionsPresent(
          scoped.map((t) => t.material),
          DESIGN_TYPE_MATERIALS[designType],
        ),
      },
      {
        key: "channel",
        label: "渠道",
        options: optionsPresent(scoped.map((t) => t.channel), curated.channel ?? []),
      },
      {
        key: "industry",
        label: "行业",
        options: optionsPresent(scoped.map((t) => t.industry), curated.industry ?? []),
      },
    ];
    return built.filter((g) => g.options.length > 2);
  }, [scoped, designType]);

  const results = useMemo(
    () =>
      filterTemplates(scoped, {
        channel: sel.channel,
        material: sel.material,
        industry: sel.industry,
        q: input,
      }),
    [scoped, sel, input],
  );

  const label = tt(DESIGN_TYPE_LABELS[designType]);
  const activeChips = groups.flatMap((g) =>
    sel[g.key] && sel[g.key] !== ALL ? [{ key: g.key, label: g.label, value: sel[g.key] }] : [],
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-900">{label}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {tt("可直接套用的{label}成品，共 {n} 件。点「拿去编辑」在 OceanLeo 设计器里继续改。", {
            label,
            n: scoped.length,
          })}
        </p>
      </header>

      <form onSubmit={(e) => e.preventDefault()} className="mb-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tt("在{label}里搜索…", { label })}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        />
      </form>

      <div className="mb-5 space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
        {groups.map((g) => (
          <FilterColumn
            key={g.key}
            label={g.label}
            options={g.options}
            value={sel[g.key] ?? ALL}
            onChange={(v) => setSel((prev) => ({ ...prev, [g.key]: v }))}
          />
        ))}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            <span>{tt("已选：")}</span>
            {activeChips.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700"
              >
                {tt(c.value)}
                <button
                  type="button"
                  onClick={() => setSel((prev) => ({ ...prev, [c.key]: ALL }))}
                  className="text-sky-400 hover:text-sky-600"
                  aria-label={tt("清除")}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSel({ channel: ALL, material: ALL, industry: ALL })}
              className="ml-1 text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline"
            >
              {tt("清空")}
            </button>
          </div>
        )}
      </div>

      <div className="mb-3 text-xs text-zinc-400">{tt("共 {n} 个模板", { n: results.length })}</div>

      {results.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((t) => (
            <TemplateCard key={t.id} t={t} onOpen={setActive} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 py-20 text-center">
          <div className="text-sm font-medium text-zinc-500">{tt("没有符合筛选的模板")}</div>
          <p className="mt-1 max-w-sm text-xs text-zinc-400">{tt("试试调整或清空筛选条件。")}</p>
        </div>
      )}

      {active && <DetailModal t={active} onClose={() => setActive(null)} />}
    </div>
  );
}
