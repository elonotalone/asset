"use client";

export const dynamic = "force-dynamic";

import { SiteShell } from "@/components/SiteShell";
import { MyDatabasePage } from "@oceanleo/ui/pages";

export default function MyDatabasePageRoute() {
  return (
    <SiteShell>
      <MyDatabasePage accent="#0ea5e9" />
    </SiteShell>
  );
}
