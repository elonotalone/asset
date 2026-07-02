"use client";

export const dynamic = "force-dynamic";

import { SiteShell } from "@/components/SiteShell";
import { CostPage } from "@oceanleo/ui/pages";

// 「Cost」页（操作员 2026-07-02）：近 30 天用量柱状图（悬停显示各模型 token 与
// 金额）+ 用量记录明细（从 settings/api 迁来，列表内部滚动）。内容来自
// @oceanleo/ui 的 CostPage（全家桶单一事实源），外层保留本站侧栏 SiteShell。
export default function CostRoute() {
  return (
    <SiteShell>
      <CostPage />
    </SiteShell>
  );
}
