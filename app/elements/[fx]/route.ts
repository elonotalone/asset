import {
  FX_META,
  buildShowcaseDoc,
  metaFor,
  paletteByKey,
  type ShowcaseFx,
} from "@/lib/element-showcase";

// /elements/<fx> —— 直接返回**完整独立**的自包含 HTML 文档（Content-Type: text/html），
// 即某个网站风格特效的「展示级」全屏演示页。既能整页打开 / 分享 / 另存，也被
// /elements 灵感墙用 <iframe src="/elements/<fx>?palette=..&chrome=0"> 实时预览。
//
// 用 route.ts 而非 page.tsx：page.tsx 会被 app 根 layout 包住（注入 <html><body> +
// LeoAssistant + 主题 CSS），无法做到「整个响应体 = 这份自包含演示」。route.ts 绕开
// React 渲染树，响应即文档，零嵌套——与 /templates/[slug] 同一套思路。
//
// query:
//   ?palette=<key>   预览配色（默认取该特效推荐配色）
//   ?chrome=0        只渲染纯特效 + 一行标题（给 iframe 缩略预览用，去掉大标题/按钮）
//   ?lang=en         英文文案

export function generateStaticParams() {
  return FX_META.map((m) => ({ fx: m.fx }));
}

export const dynamicParams = true;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fx: string }> },
) {
  const { fx } = await params;
  const meta = metaFor(fx);
  if (!meta) {
    return new Response("Element not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const url = new URL(req.url);
  const paletteKey = url.searchParams.get("palette") || meta.palette;
  const palette = paletteByKey(paletteKey);
  const chrome = url.searchParams.get("chrome") !== "0";
  const lang = url.searchParams.get("lang") === "en" ? "en" : "zh";

  const html = buildShowcaseDoc(fx as ShowcaseFx, palette, { chrome, lang });

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control":
        "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
