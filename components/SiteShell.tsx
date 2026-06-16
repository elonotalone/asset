"use client";

import { ReactNode, useEffect, useState } from "react";
import { AppShell, ShellNavItem } from "@/components/AppShell";
import { browserClient, getCredits, signOutEverywhere } from "@/lib/oceanleo-auth";

function LeoAssetLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 7l9-4 9 4-9 4-9-4z" strokeLinejoin="round" />
      <path d="M3 12l9 4 9-4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M3 17l9 4 9-4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function IconLibrary() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
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

const NAV: ShellNavItem[] = [
  { label: "素材库", href: "/", icon: <IconLibrary />, exact: true },
  { label: "授权说明", href: "/licenses", icon: <IconLicense /> },
];

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

export function SiteShell({ children }: { children: ReactNode }) {
  const email = useEmail();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    getCredits().then((r) => {
      if (r.ok && r.data) setCredits(r.data.balance_yuan);
    });
  }, []);

  return (
    <AppShell
      brand={{ name: "LeoAsset", accent: "#0ea5e9", logo: <LeoAssetLogo /> }}
      collapseKey="asset_sidebar_collapsed"
      siteId="asset"
      nav={NAV}
      userEmail={email}
      credits={credits}
      onSignOut={() => signOutEverywhere()}
    >
      {children}
    </AppShell>
  );
}
