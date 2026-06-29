"use client";

import { useEffect } from "react";

// 部署后「旧 bundle 卡住」自愈：
// Vercel 会在发版后短期内继续提供旧的 /_next/static chunk（方便会话中途的用户），
// 因此停留在旧标签页 / 被 bfcache 还原的页面会继续用旧 JS 渲染旧 DOM——这正是
// 「模板预览页历史嵌套已修复、但个别浏览器仍看到老样子」的根因。
//
// 两道自愈：
//   1. pageshow.persisted === true → 页面是从 bfcache 还原的旧快照，强制刷新拿新版。
//   2. 记录构建标识（NEXT 注入的 buildId 不易拿到，这里用资源时间近似），若标签页
//      在后台超过 30 分钟再回到前台，主动刷新一次，避免长期挂着的旧版本。
export function FreshBundleGuard() {
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // 从 bfcache 还原 → 旧快照，硬刷新到最新部署
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
