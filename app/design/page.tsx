import { SiteShell } from "@/components/SiteShell";
import { DesignZone } from "@/components/DesignZone";

export const metadata = {
  title: "设计模板 | LeoAsset",
};

export default function DesignPage() {
  return (
    <SiteShell>
      <DesignZone />
    </SiteShell>
  );
}
