"use client";

export const dynamic = "force-dynamic";

import { SiteShell } from "@/components/SiteShell";
import { GeneralPage } from "@oceanleo/ui/pages";

// 统一通用（外观：语言 + 主题）页 —— 内容来自 @oceanleo/ui 的 GeneralPage。
// oceanleo.com/account 完全对齐），外层保留本站功能侧栏 SiteShell。
export default function GeneralPageRoute() {
  return (
    <SiteShell>
      <GeneralPage />
    </SiteShell>
  );
}
