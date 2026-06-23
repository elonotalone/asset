"use client";

export const dynamic = "force-dynamic";

import { SiteShell } from "@/components/SiteShell";
import { ApiGuidePage } from "@oceanleo/ui/pages";

export default function GuidePage() {
  return (
    <SiteShell>
      <ApiGuidePage />
    </SiteShell>
  );
}
