"use client";

import { useSearchParams } from "next/navigation";
import {
  MATERIAL_BOARDS,
  MaterialCatalog,
  type MaterialBoardId,
} from "@oceanleo/ui/shell";
import { useUI } from "@oceanleo/ui/i18n";
import { MATERIALS_BY_BOARD } from "@/lib/material-catalog.generated";

const BOARD_IDS = new Set(MATERIAL_BOARDS.map((board) => board.id));

export function MaterialCatalogPage() {
  const tt = useUI();
  const search = useSearchParams();
  const requested = search.get("board") as MaterialBoardId | null;
  const defaultBoard =
    requested && BOARD_IDS.has(requested) ? requested : "website";

  return (
    <main className="flex min-h-0 flex-1 flex-col px-5 py-5 md:px-7">
      <header className="mb-4 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
          {tt("素材总览")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          {tt(
            "汇集 OceanLeo 全系列各功能的真实参考素材。每个工作台右栏「素材库」都是这里对应板块的子页面。",
          )}
        </p>
      </header>
      <section className="min-h-[620px] flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <MaterialCatalog
          key={defaultBoard}
          byBoard={MATERIALS_BY_BOARD}
          defaultBoard={defaultBoard}
          accent="#0ea5e9"
          className="h-full"
        />
      </section>
    </main>
  );
}
