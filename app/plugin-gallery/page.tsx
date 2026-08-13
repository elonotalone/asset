import { SiteShell } from "@/components/SiteShell";
import { PluginGallery } from "@/components/PluginGallery";
import { runtimePluginIds } from "./runtime-plan";

// OceanLeo 自家工具的陈列。与 `/plugins` 不是一回事：那一格是阿里云市场的
// MCP 连接器目录（外部连接器），这一格是我们自己的工具能力。
//
// server component：只有 manifest 与 F9 plan 侧车对得上、且 URL 逐字满足命名空间 C
// 的条目才算“可以打开”。缺侧车时返回空集，不在浏览器里猜，也不回退本站。
export default function PluginGalleryPage() {
  return (
    <SiteShell>
      <PluginGallery runtimeIds={runtimePluginIds()} />
    </SiteShell>
  );
}
