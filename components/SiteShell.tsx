"use client";

import { ReactNode, Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AppShell, ShellNavItem } from "@/components/AppShell";
import { browserClient, getCredits, signOutEverywhere } from "@/lib/oceanleo-auth";
import { AssetType, TYPE_LABELS, TYPE_ORDER } from "@/lib/assets";

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

function IconBookmark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 4h12v16l-6-4-6 4z" strokeLinejoin="round" />
    </svg>
  );
}

function IconDesign() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
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
  };
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={D[type]} />
    </svg>
  );
}

function useEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const c = browserClient();
    if (!c) return;
    void c.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const sub = c.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email ?? null));
    return () => sub.data.subscription.unsubscribe();
  }, []);
  return email;
}

// useSearchParams 必须包在 Suspense 里（Next 16 CSR bailout）。外层 SiteShell
// 负责提供边界，内层 SiteShellInner 才真正读 query —— 这样每个引用 SiteShell 的
// 页面都自动被覆盖，无需逐页再包一层。
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-400">加载中…</div>}>
      <SiteShellInner>{children}</SiteShellInner>
    </Suspense>
  );
}

function SiteShellInner({ children }: { children: ReactNode }) {
  const email = useEmail();
  const pathname = usePathname() || "/";
  const search = useSearchParams();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    getCredits().then((r) => {
      if (r.ok && r.data) setCredits(r.data.balance_yuan);
    });
  }, []);

  const onLibrary = pathname === "/";
  const activeType = (search.get("type") as AssetType) || "image";

  // 左侧栏分区：素材类别（图片/视频/音乐/音效/3D/矢量/PPT）→ 跳 /?type=<t>。
  // 用 href（Next <Link>）而非 onClick(router.push)：<Link> 会预取目标路由、点击即
  // 客户端瞬时切换并高亮，不必等网络。这是消除「按按键要等很久才跳页」的关键。
  const categoryItems: ShellNavItem[] = TYPE_ORDER.map((t) => ({
    label: TYPE_LABELS[t],
    icon: <TypeIcon type={t} />,
    href: t === "image" ? "/" : `/?type=${t}`,
    match: () => onLibrary && activeType === t,
  }));

  const nav: ShellNavItem[] = [
    {
      label: "我的素材库",
      icon: <IconBookmark />,
      href: "/collection",
      match: (p) => p === "/collection",
    },
    {
      label: "设计模板",
      icon: <IconDesign />,
      href: "/design",
      match: (p) => p === "/design",
    },
    ...categoryItems,
    { label: "授权说明", href: "/licenses", icon: <IconLicense /> },
  ];

  return (
    <AppShell
      brand={{ name: "LeoAsset", accent: "#0ea5e9", logo: <LeoAssetLogo /> }}
      collapseKey="asset_sidebar_collapsed"
      siteId="asset"
      nav={nav}
      userEmail={email}
      credits={credits}
      onSignOut={() => signOutEverywhere()}
    >
      {children}
    </AppShell>
  );
}
