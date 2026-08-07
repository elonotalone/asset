import { SiteShell } from "@/components/SiteShell";
import { AssetLibrary } from "@/components/AssetLibrary";
import { TypePageChrome } from "@/components/TypePageChrome";
import { ttServer } from "@oceanleo/ui/i18n/server";

export async function generateMetadata() {
  const tt = await ttServer();
  return { title: tt("素材库 | LeoAsset") };
}

// 首页就是「本站素材」类型页（`?type=` 选类型）。TypePageChrome 只负责顶部那排
// 「本站素材 / 开源搜索 / 成套」开关；这一类若两个开关都不该画，它原样透传，
// 页面与从前一模一样。AssetLibrary 不受影响。
export default function Home() {
  return (
    <SiteShell>
      <TypePageChrome>
        <AssetLibrary />
      </TypePageChrome>
    </SiteShell>
  );
}
