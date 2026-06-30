import {
  INDUSTRIES,
  countForSub,
  subByKey,
  templateBySlug,
} from "@/lib/template-taxonomy";
import { buildContent } from "@/lib/template-content";
import { renderTemplate } from "@/lib/template-engine";
import { buildExt } from "@/lib/template-content-ext";
import { dnaFor } from "@/lib/template-dna";

// /templates/<slug> 直接返回**完整独立**的网站 HTML 文档（Content-Type:
// text/html），而不是把它塞进素材库外壳里的 iframe。这样浏览器渲染出来的就是
// 这个模板网站本身——可整页打开、可深链、可分享，页面里没有任何 asset 站点的
// 壳（返回按钮 / 设备切换 / 多页 tab / 同类推荐 / LeoAssistant 浮窗都不存在）。
//
// 选用 Route Handler（route.ts）而非 page.tsx 的原因：page.tsx 永远会被 app 根
// layout.tsx 包住（注入 <html><body> + LeoAssistant + 主题 CSS），无法做到「整个
// 响应体 = 网站本身」。route.ts 绕开 React 渲染树，响应即文档，零嵌套。

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
  _req: Request,
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

  const content = buildContent(meta, found.ind, found.sub);
  const dna = dnaFor(meta.slug, meta.industryKey, meta.variant, found.ind.color);
  const ext = buildExt(meta.slug, meta.industryKey, meta.subLabel);
  const { html } = renderTemplate(meta, content, ext, dna);

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
