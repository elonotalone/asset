"use client";

import { ReactNode, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useUI } from "@oceanleo/ui/i18n";
import { AssetSiteShell, type AssetNavGroup, type AssetNavItem } from "@/components/AssetSiteShell";
import { AssetType, TYPE_LABELS, TYPE_ORDER } from "@/lib/assets";
import { DOCUMENT_ZONES } from "@/lib/document-zones";

function LeoAssetLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 7l9-4 9 4-9 4-9-4z" strokeLinejoin="round" />
      <path d="M3 12l9 4 9-4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M3 17l9 4 9-4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function IconLicense() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 0 0 5M16 9.5a2.5 2.5 0 1 0 0 5" strokeLinecap="round" />
    </svg>
  );
}

// 每个素材类别一个图标（左侧栏分区用）。
function TypeIcon({ type }: { type: AssetType }) {
  const D: Record<AssetType, string> = {
    image: "M4 5h16v14H4zM4 15l4-4 3 3 4-5 5 6",
    vector: "M5 19l7-14 7 14zM5 19h14",
    sticker: "M14 3v5a1 1 0 001 1h5M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h7l7-7V9z",
    video: "M4 6h16v12H4zM10 9l5 3-5 3z",
    audio: "M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4",
    music: "M9 18V6l10-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM19 16a3 3 0 11-6 0 3 3 0 016 0z",
    "3d": "M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7",
    font: "M5 7V5h14v2M9 19h6M12 5v14",
    ppt: "M4 4h16v12H4zM4 16l3 4M20 16l-3 4M9 12V8h3a2 2 0 010 4z",
    document: "M7 3h8l5 5v13H7zM15 3v5h5M9 12h6M9 16h4",
    chart: "M4 4v16h16M8 16v-4M12 16V8M16 16v-6",
    prompt: "M4 5h16v10H4zM8 19h8M12 15v4M7 8h6M7 11h10",
  };
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={D[type]} />
    </svg>
  );
}

// useSearchParams 必须包在 Suspense 里（Next 16 CSR bailout）。外层 SiteShell
// 负责提供边界，内层 SiteShellInner 才真正读 query —— 这样每个引用 SiteShell 的
// 页面都自动被覆盖，无需逐页再包一层。
export function SiteShell({ children }: { children: ReactNode }) {
  const tt = useUI();
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-400">{tt("加载中…")}</div>}>
      <SiteShellInner>{children}</SiteShellInner>
    </Suspense>
  );
}

function IconZone() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h8l5 5v13H7zM15 3v5h5M9 12h6M9 16h4" />
    </svg>
  );
}

function SiteShellInner({ children }: { children: ReactNode }) {
  const tt = useUI();
  const pathname = usePathname() || "/";
  const search = useSearchParams();

  const onLibrary = pathname === "/";
  const onZones = pathname.startsWith("/zones/");
  const activeType = (search.get("type") as AssetType) || "image";

  // 左栏两条轴：文档分区（本轮八个中文分区页）+ 素材类型。
  // 成品 / 插件 / 我的素材库 / 网站模板 / 网页动效 已从本站拿掉：asset 只摆素材让人下载。
  // 账户 / 设置 / 积分入口也不再出现：共享 AppShell 没有关菜单的 prop，本站改走
  // AssetSiteShell（见该文件顶部注释）。

  const documentZones: AssetNavItem[] = DOCUMENT_ZONES.map((z) => ({
    label: tt(z.title),
    icon: <IconZone />,
    href: `/zones/${z.slug}`,
    match: () => onZones && pathname === `/zones/${z.slug}`,
  }));

  const libraryTypes: AssetNavItem[] = TYPE_ORDER.map((t) => ({
    label: tt(TYPE_LABELS[t]),
    icon: <TypeIcon type={t} />,
    href: t === "image" ? "/" : `/?type=${t}`,
    match: () => onLibrary && activeType === t,
  }));

  const navGroups: AssetNavGroup[] = [
    {
      heading: tt("文档分区"),
      items: documentZones,
    },
    {
      heading: tt("素材类型"),
      items: libraryTypes,
    },
    {
      items: [
        { label: tt("授权说明"), href: "/licenses", icon: <IconLicense /> },
      ],
    },
  ];

  return (
    <AssetSiteShell
      brand={{ name: "LeoAsset", accent: "#0ea5e9", logo: <LeoAssetLogo /> }}
      collapseKey="asset_sidebar_collapsed"
      navGroups={navGroups}
    >
      {children}
    </AssetSiteShell>
  );
}
