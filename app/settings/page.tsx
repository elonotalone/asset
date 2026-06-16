"use client";

export const dynamic = "force-dynamic";

import { SiteShell } from "@/components/SiteShell";
import { AccountSettings } from "@/components/AccountSettings";

// 统一账户设置 —— 主内容由全家桶共享组件 AccountSettings 渲染（与主站
// oceanleo.com/settings 对齐），外层保留本站功能侧栏 SiteShell。
export default function SettingsPage() {
  return (
    <SiteShell>
      <AccountSettings />
    </SiteShell>
  );
}
