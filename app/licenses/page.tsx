import { SiteShell } from "@/components/SiteShell";
import { LicensesView } from "@/components/LicensesView";
import { ttServer } from "@oceanleo/ui/i18n/server";

export async function generateMetadata() {
  const tt = await ttServer();
  return { title: tt("授权说明 | LeoAsset") };
}

export default function LicensesPage() {
  return (
    <SiteShell>
      <LicensesView />
    </SiteShell>
  );
}
