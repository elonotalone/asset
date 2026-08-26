"use client";

import { ReactNode, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUI } from "@oceanleo/ui/i18n";

/**
 * asset 站本地极简外壳。
 *
 * 为什么不继续用 `@oceanleo/ui` 的 `AppShell`：那个组件没有关掉账户菜单的
 * prop（查过 `AppShellProps`：有 `hideHeader` / `userEmail` / `credits` /
 * `accountHref`，没有 `showUserMenu={false}`）。账户按钮默认链到已删除的账户页，
 * 余额胶囊无条件渲染。asset 站已经删掉账户/设置/积分路由，点进去就是 404。
 * 为此去改共享包会波及全部消费站并触发发布，本轮明确不做。
 */
export type AssetNavItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  match?: () => boolean;
};

export type AssetNavGroup = {
  heading?: string;
  items: AssetNavItem[];
};

export function AssetSiteShell({
  brand,
  collapseKey = "asset_sidebar_collapsed",
  navGroups,
  children,
}: {
  brand: { name: string; accent: string; logo: ReactNode };
  collapseKey?: string;
  navGroups: AssetNavGroup[];
  children: ReactNode;
}) {
  const tt = useUI();
  const pathname = usePathname() || "/";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useLayoutEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(collapseKey) === "1");
    } catch {
      setCollapsed(false);
    }
  }, [collapseKey]);

  function toggleCollapsed(next: boolean) {
    setCollapsed(next);
    try {
      localStorage.setItem(collapseKey, next ? "1" : "0");
    } catch {
      /* ignore quota / private mode */
    }
  }

  function itemIsActive(item: AssetNavItem): boolean {
    if (item.match) return item.match();
    if (item.href === "/") return pathname === "/";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  const brandLink = (
    <Link
      href="/"
      onClick={() => setMobileOpen(false)}
      className="leo-tap-row flex items-center gap-2 text-neutral-900"
    >
      <span className="flex h-5 w-5 items-center justify-center" style={{ color: brand.accent }}>
        {brand.logo}
      </span>
      <span className="text-[15px] font-semibold tracking-tight">{brand.name}</span>
    </Link>
  );

  const navSection = (
    <nav className="px-2 pb-1 pt-1" aria-label={tt("站点导航")}>
      {navGroups.map((group, gi) => (
        <div key={group.heading ?? gi} className="mb-1">
          {group.heading && (
            <div className="px-3 pb-1 pt-3 text-[12px] text-neutral-600">{group.heading}</div>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = itemIsActive(item);
              const cls = `leo-tap-row group/nav flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-all duration-150 ${
                active
                  ? "bg-neutral-200/80 font-medium text-neutral-900"
                  : "text-neutral-800 hover:bg-neutral-200/50 hover:text-neutral-900"
              }`;
              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cls}
                  style={active ? { boxShadow: `inset 3px 0 0 ${brand.accent}` } : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="transition-colors" style={{ color: active ? brand.accent : undefined }}>
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const sidebarBody = (
    <>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        data-oceanleo-scroll-nav
        data-oceanleo-sidebar-scroll="whole"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          {brandLink}
          <button
            type="button"
            onClick={() => {
              toggleCollapsed(true);
              setMobileOpen(false);
            }}
            className="leo-tap-icon hidden rounded-md p-1.5 text-neutral-600 transition hover:bg-neutral-200/70 active:scale-95 md:inline-flex"
            title={tt("收起侧栏")}
          >
            <PanelIcon />
          </button>
        </div>
        {navSection}
      </div>
    </>
  );

  return (
    <div className="leo-safe-shell flex min-h-screen bg-transparent" data-oceanleo-shell>
      <aside
        data-oceanleo-chrome
        className={`hidden h-screen flex-col overflow-hidden border-r border-neutral-200/70 bg-[#f7f7f7]/85 backdrop-blur-sm transition-[width] duration-200 ease-out md:fixed md:start-0 md:top-0 md:z-30 md:flex ${
          collapsed ? "w-0 border-r-0" : "w-[256px]"
        }`}
      >
        <div className="leo-safe-sidebar flex h-full w-[256px] flex-col">{sidebarBody}</div>
      </aside>
      <div
        aria-hidden="true"
        data-oceanleo-chrome
        data-oceanleo-sidebar-spacer
        className={`hidden shrink-0 transition-[width] duration-200 ease-out md:block ${
          collapsed ? "w-0" : "w-[256px]"
        }`}
      />

      {mobileOpen && (
        <div data-oceanleo-chrome className="fixed inset-0 z-[80] md:hidden">
          <div className="v-fade-in absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="leo-safe-drawer absolute left-0 top-0 flex h-full flex-col bg-[#f7f7f7] shadow-xl">
            {sidebarBody}
          </aside>
        </div>
      )}

      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
        {collapsed && (
          <button
            type="button"
            data-oceanleo-chrome
            onClick={() => toggleCollapsed(false)}
            className="leo-chrome-topleft leo-tap-target fixed z-50 hidden items-center justify-center rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-500 shadow-sm transition hover:bg-neutral-50 active:scale-95 md:flex"
            title={tt("展开侧栏")}
          >
            <PanelIcon />
          </button>
        )}
        <button
          type="button"
          data-oceanleo-chrome
          onClick={() => setMobileOpen(true)}
          className="leo-chrome-topleft leo-tap-target fixed z-50 inline-flex items-center justify-center rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-500 shadow-sm transition hover:bg-neutral-50 active:scale-95 md:hidden"
          title={tt("打开菜单")}
        >
          <PanelIcon />
        </button>
        <main
          className={`leo-safe-main leo-safe-main-top flex-1 pl-14 ${collapsed ? "md:pl-14" : "md:pl-0"}`}
        >
          <div data-oceanleo-route-surface className="contents">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function PanelIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}
