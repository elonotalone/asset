import { readRuntimeFile, runtimeRouteParams } from "../../runtime-registry";

// `/plugin-gallery/runtime/<实例>/<文件>` —— 一件工具的可运行实例，逐个文件发出去。
//
// 为什么不直接把 iframe 指到 `/works/plugin/<实例>/index.html`（那份字节本来就在
// public 下）：那条裸路径**顶层直接打开时，脚本跑在 asset.oceanleo.com 自己的 origin
// 上**，而这个 origin 带着 `Domain=.oceanleo.com` 的 SSO cookie，且它不是 httpOnly
// （docs/architecture/oceanleo-untrusted-content-isolation.md F1）。第一期 V3 的独立
// 验收把同一形状记成了「须知二」。
//
// 本路由给入口文档配上 `Content-Security-Policy: sandbox allow-scripts`，于是**无论被
// 嵌入还是被顶层打开**，浏览器都把这份文档放进一个不透明 origin：读不到
// `document.cookie`、拿不到同源存储、够不着本站 DOM。它的子资源（js/css）继承这个
// 不透明 origin，因此不必、也不能再单独给 sandbox。父页面那层 `sandbox="allow-scripts"`
// （components/PluginGalleryRunner.tsx）与它取交集，两层都不给 `allow-same-origin` ——
// UC-3 的规范判据正是这两个 token 不得同现。
//
// `dynamicParams = false`：下面这张表以外的路径一律 404，请求里的路径段不进文件系统。

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return runtimeRouteParams();
}

/**
 * 入口文档的 CSP，**写死的字面量**，不由任何输入拼出。
 * `frame-ancestors 'self'`：只有素材站自己嵌得动它。
 * 放宽其中任何一个 token 都要先跑 `scripts/oceanleo-security-gate.sh` 并拿到操作员批准。
 */
const RUNTIME_CSP = "sandbox allow-scripts; frame-ancestors 'self'";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const file = readRuntimeFile(segments ?? []);
  if (!file) {
    return new Response("Plugin runtime not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const headers: Record<string, string> = {
    "content-type": file.type,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
  };
  // 沙箱只对**文档**有意义；给 js/css 配 sandbox 指令没有作用，也会让人误以为
  // 那才是防线。防线只有一道：入口文档落在不透明 origin，子资源随它。
  if (file.type.startsWith("text/html")) {
    headers["content-security-policy"] = RUNTIME_CSP;
  }

  return new Response(new Uint8Array(file.body), { status: 200, headers });
}
