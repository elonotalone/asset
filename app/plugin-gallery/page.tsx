import { SiteShell } from "@/components/SiteShell";
import { PluginGallery } from "@/components/PluginGallery";

// 平台自己能干的活。与 `/plugins` 不是一回事：那一格是阿里云市场的 MCP 连接器目录
// （外部连接器），这一格是我们自己的编辑器。
//
// 2026-08-19 起这里只有编辑器：22 件独立小工具连同它们的运行字节一起下架，
// 所以页面不再读 runtime manifest 与 F9 plan 侧车，也不存在任何隔离域运行入口。
export default function PluginGalleryPage() {
  return (
    <SiteShell>
      <PluginGallery />
    </SiteShell>
  );
}
