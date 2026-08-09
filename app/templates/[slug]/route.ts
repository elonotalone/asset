import { readFile } from "node:fs/promises";

import {
  INDUSTRIES,
  countForSub,
  subByKey,
  templateBySlug,
} from "@/lib/template-taxonomy";
import { renderTemplateBilingual } from "@/lib/template-engine";
import { utilitiesFor } from "@/lib/template-css";
import { emitStandaloneSite } from "@/lib/template-emit-site";
import { createSiteZip } from "@/lib/site-zip";
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
//  - `?download=1` 把 HTML / CSS / JS / 本地图片打成 `<slug>.zip`，断网也可打开。

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

  // 本地开发预览覆盖（?fx= / ?herov=），仅在非生产环境生效，用于逐一 review
  // v4 新特效与 hero 版式；生产忽略，行为不变。
  const devOverride =
    process.env.NODE_ENV !== "production"
      ? {
          fx: (url.searchParams.get("fx") as never) || undefined,
          heroV: url.searchParams.has("herov")
            ? Number(url.searchParams.get("herov"))
            : undefined,
        }
      : undefined;

  if (download) {
    const site = emitStandaloneSite(meta, found.ind, found.sub, { defaultLang });
    const entries = await Promise.all(
      site.files.map(async (file) => {
        if (file.text !== undefined) return { path: file.path, data: file.text };
        if (!file.sourcePath || file.sourcePath.startsWith("/") || file.sourcePath.includes("..")) {
          throw new Error(`${slug}: invalid source path for ${file.path}`);
        }
        return { path: file.path, data: await readFile(`${process.cwd()}/${file.sourcePath}`) };
      }),
    );
    const archive = createSiteZip(entries);
    return new Response(archive, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${slug}.zip"`,
        "cache-control": "public, max-age=0, s-maxage=86400",
      },
    });
  }

  const { html: renderedHtml } = renderTemplateBilingual(
    meta,
    found.ind,
    found.sub,
    defaultLang,
    devOverride,
    "preview",
  );
  const utilityCss = utilitiesFor(renderedHtml).trim();
  const html = utilityCss
    ? renderedHtml.replace("<style>", `<style>\n${utilityCss}\n`)
    : renderedHtml;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control":
        "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
