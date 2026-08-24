"use client";

import { ReactNode, Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useUI } from "@oceanleo/ui/i18n";
import { AppShell, ShellNavGroup, ShellNavItem } from "@/components/AppShell";
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
    chart: "M4 4v16h16M8 16v-4M12 16V8M16 16v-6",
    prompt: "M4 5h16v10H4zM8 19h8M12 15v4M7 8h6M7 11h10",
  };
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={D[type]} />
    </svg>
  );
}

function IconWebsite() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M6.5 6.5h.01M9 6.5h.01" />
    </svg>
  );
}

function IconWorks() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7l8-4 8 4v10l-8 4-8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconPlugin() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 4V2.8M14 4V2.8M6 8h12v6a5 5 0 01-5 5h-2a5 5 0 01-5-5zM10 19v2M14 19v2" />
    </svg>
  );
}

function IconWebMotion() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 15c3-4 5.5-4 8.5 0s5.5 4 9-0.5" />
    </svg>
  );
}

function useEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const c = browserClient();
    if (!c) return;
    void c.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
    const sub = c.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email ?? null));
    return () => sub.data.subscription.unsubscribe();
  }, []);
  return email;
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

function SiteShellInner({ children }: { children: ReactNode }) {
  const tt = useUI();
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

  // 左栏只有一条轴：**素材类型**。一个名称对应一个类型，没有任何「专区」。
  //
  // 「开源专区」「成套素材」不是类型，前者是**即时搜索**这个功能、后者是素材的一种
  // **形态**，两者都降级成类型页里的开关（见 TypePageChrome），不再占左栏一格。
  // 「模板专区 / 风格元素」按素材类型归位：模板专区 → 网站，风格元素 → 网页动效。
  // 「设计模板」十格（/design/<类型>，684 份语料）已按 2026-08-24 裁定下架，左栏不再出入口。
  //
  // 用 href（Next <Link>）而非 onClick(router.push)：<Link> 会预取目标路由、点击即
  // 客户端瞬时切换并高亮，不必等网络。这是消除「按按键要等很久才跳页」的关键。

  // ① 库内素材（platform_assets，走网关实时查）。
  const libraryTypes: ShellNavItem[] = TYPE_ORDER.map((t) => ({
    label: tt(TYPE_LABELS[t]),
    icon: <TypeIcon type={t} />,
    href: t === "image" ? "/" : `/?type=${t}`,
    match: () => onLibrary && activeType === t,
  }));

  // ② 两个来自代码常量的类型。
  const codeTypes: ShellNavItem[] = [
    {
      label: tt("网站"),
      icon: <IconWebsite />,
      href: "/templates",
      match: (p) => p.startsWith("/templates"),
    },
    {
      label: tt("网页动效"),
      icon: <IconWebMotion />,
      href: "/elements",
      match: (p) => p.startsWith("/elements"),
    },
  ];

  const navGroups: ShellNavGroup[] = [
    {
      heading: tt("素材类型"),
      items: [...libraryTypes, ...codeTypes],
    },
    // 这一组也不是类型轴：「成品」是按新工作流做出来的整件作品（14 类都落在这里，
    // 上面那 12 格没有一格装得下），「插件」是能打开素材的工具（可看不可下）。
    // 两者都**不是素材类型**，所以单独成组，不混进「素材类型」那一栏。
    {
      heading: tt("成品与工具"),
      items: [
        {
          label: tt("成品"),
          icon: <IconWorks />,
          href: "/works",
          match: (p) => p.startsWith("/works"),
        },
        {
          label: tt("插件"),
          icon: <IconPlugin />,
          href: "/plugin-gallery",
          match: (p) => p.startsWith("/plugin-gallery"),
        },
      ],
    },
    // 这一组不是类型轴，也不是「专区」：一个是用户自己的收藏，一个是说明页。
    {
      items: [
        {
          label: tt("我的素材库"),
          icon: <IconBookmark />,
          href: "/collection",
          match: (p) => p === "/collection",
        },
        { label: tt("授权说明"), href: "/licenses", icon: <IconLicense /> },
      ],
    },
  ];

  return (
    <AppShell
      brand={{ name: "LeoAsset", accent: "#0ea5e9", logo: <LeoAssetLogo /> }}
      collapseKey="asset_sidebar_collapsed"
      siteId="asset"
      navGroups={navGroups}
      userEmail={email}
      credits={credits}
      onSignOut={() => signOutEverywhere()}
    >
      {children}
    </AppShell>
  );
}
