"use client";

export const dynamic = "force-dynamic";

import { SiteShell } from "@/components/SiteShell";
import { AccountCenter } from "@/components/AccountCenter";

// 统一账户中心 —— 主内容由全家桶共享组件 AccountCenter 渲染（与主站
// oceanleo.com/account 完全对齐），外层保留本站功能侧栏 SiteShell。
export default function AccountPage() {
  return (
    <SiteShell>
      <AccountCenter />
    </SiteShell>
  );
}
