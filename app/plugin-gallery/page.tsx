import { SiteShell } from "@/components/SiteShell";
import { PluginGallery } from "@/components/PluginGallery";
import { runtimePluginIds } from "./runtime-registry";

// OceanLeo 自家工具的陈列。与 `/plugins` 不是一回事：那一格是阿里云市场的
// MCP 连接器目录（外部连接器），这一格是我们自己的工具能力。
//
// server component：哪几件工具在货架上真有实物要读盘才知道（`runtime-registry.ts`），
// 构建期问一次，列表页拿到的就是事实，不必在浏览器里再探一遍。
export default function PluginGalleryPage() {
  return (
    <SiteShell>
      <PluginGallery runtimeIds={runtimePluginIds()} />
    </SiteShell>
  );
}
