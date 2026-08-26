import type { Metadata } from "next";
import "./globals.css";
// 全家桶统一样式预编译产物（JS 方式 import，避开 pnpm git 依赖路径含 # 的问题）。
import "@oceanleo/ui/theme/ui.css";
import { FreshBundleGuard } from "@/components/FreshBundleGuard";
import { I18nProvider } from "@oceanleo/ui/i18n";
import { getLocale, getMessages, normalizeLocale, htmlLang, localeDir, ttServer } from "@oceanleo/ui/i18n/server";
import { ThemeScript, ThemeProvider } from "@oceanleo/ui/theme";
import { getThemeClass } from "@oceanleo/ui/theme/server";


// 境内合规页脚：变量未设时渲染 null，.com 产物逐字节不变。
import { IcpBeianFooter } from "@/app/_components/icp-beian-footer";

import { SITE_HOST } from "@/lib/site-origin";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const tt = await ttServer();
  return {
    title: tt(`免费开源素材库 · 图片/视频/音乐/音效/3D | ${SITE_HOST}`),
    description: tt(
      "一站浏览来自 Openverse / Pexels / Pixabay / Poly Haven / Freesound / Jamendo 的免费开源授权素材，默认只展示可商用素材，下载后可直接拿去 PPT / 设计 / 视频 / 3D 创作。",
    ),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = normalizeLocale(await getLocale());
  const messages = await getMessages();
  const { htmlClass } = await getThemeClass();

  return (
    <html lang={htmlLang(locale)} dir={localeDir(locale)} className={htmlClass} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <I18nProvider locale={locale} messages={messages}>
            <FreshBundleGuard />
            {children}
          </I18nProvider>
        </ThemeProvider>
        <IcpBeianFooter />
      </body>
    </html>
  );
}
