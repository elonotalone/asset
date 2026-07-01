import type { Metadata } from "next";
import "./globals.css";
// 全家桶统一样式预编译产物（JS 方式 import，避开 pnpm git 依赖路径含 # 的问题）。
import "@oceanleo/ui/theme/ui.css";
import { LeoAssistant } from "@oceanleo/ui/shell";
import { FreshBundleGuard } from "@/components/FreshBundleGuard";
import { I18nProvider } from "@oceanleo/ui/i18n";
import { getLocale, getMessages, normalizeLocale, htmlLang, localeDir } from "@oceanleo/ui/i18n/server";
import { ThemeScript, ThemeProvider } from "@oceanleo/ui/theme";
import { getThemeClass } from "@oceanleo/ui/theme/server";


export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "免费开源素材库 · 图片/视频/音乐/音效/3D | asset.oceanleo.com",
  description:
    "一站浏览来自 Openverse / Pexels / Pixabay / Poly Haven / Freesound / Jamendo 的免费开源授权素材，默认只展示可商用素材，下载后可直接拿去 PPT / 设计 / 视频 / 3D 创作。",
};

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
        <LeoAssistant siteId="asset" docType="doc" />
                </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
