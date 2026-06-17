"use client";

export const dynamic = "force-dynamic";

import { SiteShell } from "@/components/SiteShell";
import { PluginsPage } from "@oceanleo/ui/pages";

export default function PluginsPageRoute() {
  return (
    <SiteShell>
      <PluginsPage accent="#0ea5e9" />
    </SiteShell>
  );
}
