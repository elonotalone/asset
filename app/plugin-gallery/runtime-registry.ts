// 工具实物的**读盘层**：哪几件工具在货架上真有一个能跑的实例，实例由哪些文件组成。
//
// 为什么在 app/ 下而不是 lib/：这里要 node:fs，而 lib/plugin-gallery.ts 被
// "use client" 组件 import —— 两者写在一起时 Turbopack 会把 node:fs 拖进浏览器包，
// 构建当场失败（A1 在 WorksKinds.tsx 顶部记过同一个坑）。本模块只被
// server component 与 route handler 引用。
//
// 货源由 G1 独占书写，本模块**永不写入**。实例没落盘时返回空集，
// 页面照实说「还没有实物」——不假装有。

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { PLUGIN_ITEMS } from "@/lib/plugin-gallery";

// 两个货源，按优先级。
//
// `content/plugin-runtime/` 是**首选**：它不在 public 下，那份可执行 HTML 因此
// 没有任何裸 URL 指得到，只能经 `/plugin-gallery/runtime/…` 这条带
// `Content-Security-Policy: sandbox` 的路由出去。这同时满足两件事——工具「可看不可下」
// （tests/plugin-gallery.test.tsx 断言 public 下不许有插件文件），
// 以及可执行内容不以本站 origin 运行。
//
// `public/works/plugin/` 是合同给 G1 的独占落点，照收；但那条路径上的字节
// **同时**能被顶层直接 GET 到，届时脚本跑在 asset.oceanleo.com 自己的 origin 上。
// 这一条已写进 signals/B1-signals.md 交给父 agent，不是本模块修得了的。
const RUNTIME_DIRS = [
  path.join(process.cwd(), "content", "plugin-runtime"),
  path.join(process.cwd(), "public", "works", "plugin"),
];

/** 实例目录名：工具 id 本身，或 `<id>-01` 这样的成品编号。 */
function dirBelongsTo(dirName: string, pluginId: string): boolean {
  return dirName === pluginId || new RegExp(`^${pluginId}-\\d+$`).test(dirName);
}

/** 路径段的合法形状：不含分隔符、不含 `..`、不以点开头。 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/**
 * 站内能发出去的文件类型**白名单**。
 *
 * 白名单而不是黑名单：`selftest.mjs` / `uitest.mjs` 这类自测件与将来任何
 * 没想到的扩展名一律不出站——它们不是工具运行需要的东西。
 */
const SERVABLE: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
};

export function contentTypeFor(rel: string): string | null {
  return SERVABLE[path.extname(rel).toLowerCase()] ?? null;
}

export interface PluginRuntime {
  /** 工具目录里的 id（`PLUGIN_ITEMS` 那一套）。 */
  pluginId: string;
  /** 实例目录/文件在货源里的名字，可能带成品编号。 */
  slug: string;
  /** 站内入口地址，直接给 iframe 用。 */
  entryPath: string;
  /** 实例根目录的绝对路径（单文件实例时是它所在的货源目录）。 */
  rootDir: string;
  /** 相对 `rootDir` 的可发送文件清单；单文件实例时只有一个。 */
  files: string[];
}

function listFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!SAFE_SEGMENT.test(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listFiles(path.join(dir, entry.name), rel));
    } else if (entry.isFile() && contentTypeFor(rel)) {
      out.push(rel);
    }
  }
  return out;
}

function runtimeAt(dir: string, slug: string, pluginId: string): PluginRuntime | null {
  const abs = path.join(dir, slug);
  try {
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      const files = listFiles(abs);
      if (!files.includes("index.html")) return null;
      return {
        pluginId,
        slug,
        entryPath: `/plugin-gallery/runtime/${slug}/index.html`,
        rootDir: abs,
        files,
      };
    }
  } catch {
    /* 不存在就试单文件那一种 */
  }
  try {
    if (statSync(`${abs}.html`).isFile()) {
      return {
        pluginId,
        slug,
        entryPath: `/plugin-gallery/runtime/${slug}.html`,
        rootDir: dir,
        files: [`${slug}.html`],
      };
    }
  } catch {
    /* 两种都没有 */
  }
  return null;
}

let cached: PluginRuntime[] | null = null;

/** 货架上真有实例、且认得出属于哪件工具的那几份。构建期读盘一次。 */
export function pluginRuntimes(): PluginRuntime[] {
  if (cached) return cached;
  const found: PluginRuntime[] = [];
  const taken = new Set<string>();
  for (const dir of RUNTIME_DIRS) {
    let names: string[] = [];
    try {
      // 只有**目录**与 `.html` 文件才可能是一份实例。封面图之类的邻居直接不参选，
      // 否则每张 `<id>.cover.webp` 都会在构建日志里冒一条假警告。
      names = readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.name.endsWith(".html"))
        .map((entry) => entry.name.replace(/\.html$/, ""))
        .filter((name) => SAFE_SEGMENT.test(name));
    } catch {
      continue;
    }
    for (const slug of new Set(names)) {
      if (taken.has(slug)) continue;
      const item = PLUGIN_ITEMS.find((entry) => dirBelongsTo(slug, entry.id));
      if (!item) {
        // 目录名对不上任何一件工具时**不上架**：那样的东西点进去没有说明页，
        // 用户看到的是一个没有出处的可执行框。
        console.warn(`[plugin-runtime] 跳过 ${slug}：工具目录里没有这个 id`);
        continue;
      }
      const runtime = runtimeAt(dir, slug, item.id);
      if (!runtime) {
        console.warn(`[plugin-runtime] 跳过 ${slug}：没有 index.html 入口`);
        continue;
      }
      taken.add(slug);
      found.push(runtime);
    }
  }
  cached = found;
  return found;
}

export function runtimeForPlugin(id: string): PluginRuntime | null {
  return pluginRuntimes().find((runtime) => runtime.pluginId === id) ?? null;
}

export function runtimePluginIds(): string[] {
  return pluginRuntimes().map((runtime) => runtime.pluginId);
}

/** 8 MB 以上的单个文件不是「打开就能用的小工具」，不给发。 */
const MAX_RUNTIME_BYTES = 8 * 1024 * 1024;

/**
 * 按 `<slug>/<相对路径>` 取一份字节。
 *
 * 三道闸：段形状白名单 → 必须在实例的 `files` 清单里（清单本身已过扩展名白名单）
 * → 拼出来的绝对路径必须仍在实例根目录内。任何一道不过都返回 null。
 */
export function readRuntimeFile(segments: string[]): { body: Buffer; type: string } | null {
  if (segments.length === 0 || !segments.every((s) => SAFE_SEGMENT.test(s))) return null;
  const [head, ...rest] = segments;
  const slug = head.replace(/\.html$/, "");
  const runtime = pluginRuntimes().find((entry) => entry.slug === slug);
  if (!runtime) return null;

  const rel = rest.length > 0 ? rest.join("/") : head;
  if (!runtime.files.includes(rel)) return null;
  const type = contentTypeFor(rel);
  if (!type) return null;

  const abs = path.join(runtime.rootDir, rel);
  if (!abs.startsWith(runtime.rootDir + path.sep)) return null;
  try {
    if (statSync(abs).size > MAX_RUNTIME_BYTES) return null;
    return { body: readFileSync(abs), type };
  } catch (err) {
    console.warn(`[plugin-runtime] ${rel} 读不出来：${String(err)}`);
    return null;
  }
}

/** 路由的静态参数：每个实例的每一个可发送文件一条。 */
export function runtimeRouteParams(): { path: string[] }[] {
  return pluginRuntimes().flatMap((runtime) =>
    runtime.files.map((rel) =>
      runtime.files.length === 1 && rel.endsWith(".html") && !rel.includes("/")
        ? { path: [rel] }
        : { path: [runtime.slug, ...rel.split("/")] },
    ),
  );
}
