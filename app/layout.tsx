import type { Metadata } from "next";
import "./globals.css";
// 全家桶统一样式预编译产物（JS 方式 import，避开 pnpm git 依赖路径含 # 的问题）。
import "@oceanleo/ui/theme/ui.css";
import { LeoAssistant } from "@oceanleo/ui/shell";

export const metadata: Metadata = {
  title: "免费开源素材库 · 图片/视频/音乐/音效/3D | asset.oceanleo.com",
  description:
    "一站浏览来自 Openverse / Pexels / Pixabay / Poly Haven / Freesound / Jamendo 的免费开源授权素材，默认只展示可商用素材，下载后可直接拿去 PPT / 设计 / 视频 / 3D 创作。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
        <LeoAssistant siteId="asset" docType="doc" />
      </body>
    </html>
  );
}
