"use client";

import { useMemo, useState } from "react";
import { DESIGN_FILTER_GROUPS } from "@/lib/assets";
import { DESIGN_TEMPLATES, editUrl, filterTemplates, type DesignTemplate } from "@/lib/design-templates";

// 设计模板专区：AI 自动拼版批量生成的成品海报模板。按 渠道/物料/行业 筛选，
// 点卡片看大图，可"拿去编辑"深链到 design.oceanleo.com 继续微调。
// 模板由 design 站的 AI 拼版工作流生成（见 docs/architecture/oceanleo-design-ai-layout.md）。

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
  return (
    <div className="min-w-0">
      <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-400">{label}</div>
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
              {opt}
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
            拿去编辑
          </a>
          <a
            href={t.preview}
            download={`${t.id}.png`}
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            下载预览图
          </a>
          {t.attributions.length > 0 && (
            <div className="mt-1 border-t border-zinc-100 pt-3 text-[11px] leading-relaxed text-zinc-400">
              <div className="mb-1 font-medium text-zinc-500">配图来源（可商用）</div>
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
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export function DesignZone() {
  const [sel, setSel] = useState<Record<string, string>>(
    Object.fromEntries(DESIGN_FILTER_GROUPS.map((g) => [g.key, g.options[0]])),
  );
  const [input, setInput] = useState("");
  const [active, setActive] = useState<DesignTemplate | null>(null);

  const results = useMemo(
    () =>
      filterTemplates(DESIGN_TEMPLATES, {
        channel: sel.channel,
        material: sel.material,
        industry: sel.industry,
        q: input,
      }),
    [sel, input],
  );

  const activeChips = DESIGN_FILTER_GROUPS.flatMap((g) =>
    sel[g.key] && sel[g.key] !== g.options[0] ? [{ key: g.key, label: g.label, value: sel[g.key] }] : [],
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-900">设计模板</h1>
        <p className="mt-1 text-sm text-zinc-500">
          AI 自动拼版生成的成品海报。按渠道、物料、行业筛选，点「拿去编辑」即可在 OceanLeo 设计器里继续修改。
        </p>
      </header>

      <form onSubmit={(e) => e.preventDefault()} className="mb-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="搜索设计模板…"
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        />
      </form>

      <div className="mb-5 space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
        {DESIGN_FILTER_GROUPS.map((g) => (
          <FilterColumn
            key={g.key}
            label={g.label}
            options={g.options}
            value={sel[g.key] ?? g.options[0]}
            onChange={(v) => setSel((prev) => ({ ...prev, [g.key]: v }))}
          />
        ))}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            <span>已选：</span>
            {activeChips.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700"
              >
                {c.value}
                <button
                  type="button"
                  onClick={() =>
                    setSel((prev) => ({
                      ...prev,
                      [c.key]: DESIGN_FILTER_GROUPS.find((g) => g.key === c.key)!.options[0],
                    }))
                  }
                  className="text-sky-400 hover:text-sky-600"
                  aria-label="清除"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSel(Object.fromEntries(DESIGN_FILTER_GROUPS.map((g) => [g.key, g.options[0]])))}
              className="ml-1 text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline"
            >
              清空
            </button>
          </div>
        )}
      </div>

      <div className="mb-3 text-xs text-zinc-400">共 {results.length} 个模板</div>

      {results.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((t) => (
            <TemplateCard key={t.id} t={t} onOpen={setActive} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 py-20 text-center">
          <div className="text-sm font-medium text-zinc-500">没有符合筛选的模板</div>
          <p className="mt-1 max-w-sm text-xs text-zinc-400">试试调整或清空筛选条件。</p>
        </div>
      )}

      {active && <DetailModal t={active} onClose={() => setActive(null)} />}
    </div>
  );
}
