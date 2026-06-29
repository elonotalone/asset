"use client";

import { useState } from "react";
import { DESIGN_FILTER_GROUPS } from "@/lib/assets";

// 设计模板专区：先把「渠道 / 物料 / 行业」三栏筛选骨架立起来，素材稍后补齐。
// 切到这里不调用素材网关 → 永远瞬时，也不会卡在实时上游搜索的慢路径上。

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
                active
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100"
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

export function DesignZone() {
  const [sel, setSel] = useState<Record<string, string>>(
    Object.fromEntries(DESIGN_FILTER_GROUPS.map((g) => [g.key, g.options[0]])),
  );
  const [input, setInput] = useState("");

  const activeChips = DESIGN_FILTER_GROUPS.flatMap((g) =>
    sel[g.key] && sel[g.key] !== g.options[0] ? [{ key: g.key, label: g.label, value: sel[g.key] }] : [],
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-zinc-900">设计模板</h1>
        <p className="mt-1 text-sm text-zinc-500">
          按渠道、物料、行业快速定位你要的设计模板。模板素材正在持续补充中。
        </p>
      </header>

      {/* Search */}
      <form
        onSubmit={(e) => e.preventDefault()}
        className="mb-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="搜索设计模板…"
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-600"
        >
          搜索
        </button>
      </form>

      {/* 三栏筛选：渠道 / 物料 / 行业 */}
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
              onClick={() =>
                setSel(Object.fromEntries(DESIGN_FILTER_GROUPS.map((g) => [g.key, g.options[0]])))
              }
              className="ml-1 text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline"
            >
              清空
            </button>
          </div>
        )}
      </div>

      {/* 空态：暂无素材（即将上线） */}
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 py-20 text-center">
        <svg
          className="mb-3 h-10 w-10 text-zinc-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M3 14l4-4 3 3 4-5 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="text-sm font-medium text-zinc-500">设计模板即将上线</div>
        <p className="mt-1 max-w-sm text-xs text-zinc-400">
          筛选维度已就绪，模板素材正在补充。敬请期待。
        </p>
      </div>
    </div>
  );
}
