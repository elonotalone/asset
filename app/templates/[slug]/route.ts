import {
  INDUSTRIES,
  countForSub,
  subByKey,
  templateBySlug,
} from "@/lib/template-taxonomy";
import { renderTemplateBilingual } from "@/lib/template-engine";
import type { Lang } from "@/lib/template-i18n";

// /templates/<slug> 直接返回**完整独立**的网站 HTML 文档（Content-Type:
// text/html），而不是把它塞进素材库外壳里的 iframe。这样浏览器渲染出来的就是
// 这个模板网站本身——可整页打开、可深链、可分享，页面里没有任何 asset 站点的
// 壳（返回按钮 / 设备切换 / 多页 tab / 同类推荐 / LeoAssistant 浮窗都不存在）。
//
// 选用 Route Handler（route.ts）而非 page.tsx 的原因：page.tsx 永远会被 app 根
// layout.tsx 包住（注入 <html><body> + LeoAssistant + 主题 CSS），无法做到「整个
// 响应体 = 网站本身」。route.ts 绕开 React 渲染树，响应即文档，零嵌套。
//
// v3：
//  - 产物本身**中英双语**（页内「中/EN」开关，离线可切）。`?lang=en` 让首屏直接
//    英文（用于英文语境深链 / 站内 iframe 传参）。
//  - `?download=1` 加 Content-Disposition: attachment，浏览器直接把这份自包含
//    HTML 另存为 `<slug>.html`（一键下载源码，A 档）。

// 全部模板在构建期静态生成 → 详情页纯静态、秒开、可深链。
export function generateStaticParams() {
  const out: { slug: string }[] = [];
  for (const ind of INDUSTRIES) {
    for (const sub of ind.subs) {
      for (let n = 1; n <= countForSub(sub.key); n++) {
        out.push({ slug: `${sub.key}-${n}` });
      }
    }
  }
  return out;
}

export const dynamicParams = true;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const meta = templateBySlug(slug);
  if (!meta) {
    return new Response("Template not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const found = subByKey(meta.subKey);
  if (!found) {
    return new Response("Template not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const url = new URL(req.url);
  const langParam = url.searchParams.get("lang");
  const defaultLang: Lang = langParam === "en" ? "en" : "zh";
  const download = url.searchParams.get("download") === "1";

  const { html } = renderTemplateBilingual(meta, found.ind, found.sub, defaultLang);

  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control":
      "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
  };
  if (download) {
    // 一键下载源码：让浏览器把这份自包含 HTML 另存为文件而非直接渲染。
    headers["content-disposition"] = `attachment; filename="${slug}.html"`;
    headers["cache-control"] = "public, max-age=0, s-maxage=86400";
  }

  return new Response(html, { status: 200, headers });
}
