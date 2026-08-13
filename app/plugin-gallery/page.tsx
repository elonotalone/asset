"use client";

import { SiteShell } from "@/components/SiteShell";
import { PluginGallery } from "@/components/PluginGallery";

// OceanLeo 自家工具的陈列。与 `/plugins` 不是一回事：那一格是阿里云市场的
// MCP 连接器目录（外部连接器），这一格是我们自己的工具能力。
export default function PluginGalleryPage() {
  return (
    <SiteShell>
      <PluginGallery />
    </SiteShell>
  );
}
