import { SiteShell } from "@/components/SiteShell";
import { SeriesZone } from "@/components/SeriesZone";

export const metadata = {
  title: "成套素材 | LeoAsset",
};

export default function SeriesPage() {
  return (
    <SiteShell>
      <SeriesZone />
    </SiteShell>
  );
}
