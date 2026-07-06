import { SiteShell } from "@/components/SiteShell";
import { StyleElements } from "@/components/StyleElements";
import { ttServer } from "@oceanleo/ui/i18n/server";

export async function generateMetadata() {
  const tt = await ttServer();
  return {
    title: tt("网站风格元素专区 · 动效灵感墙 | OceanLeo"),
    description: tt(
      "汇集数十种可直接用于建站的网页动态背景效果，分华丽 / 极简 / 卡通可爱三档气质，纯 CSS 实现、可放心商用，切换配色实时预览。",
    ),
  };
}

export default function ElementsPage() {
  return (
    <SiteShell>
      <StyleElements />
    </SiteShell>
  );
}
