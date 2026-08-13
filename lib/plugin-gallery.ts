// 工具能力板块的数据层。
//
// 数据来自 oceandino 仓 `docs/specs/oceanleo-plugins-v1/` 的 34 份产品目标，
// 整理结果落在 `content/plugin-gallery.json`。
//
// 两条产品前提，改这里之前先读一遍：
//
// ① **可看不可下。** 这些不是可下载的成品，是用户在 app 里打开来用的软件。
//    判据是一句话：能不能存到硬盘、离线打开。能，那是素材，归货架；不能，归这里。
//    所以这份数据里**不存在**任何下载地址、安装包、版本号或体积字段，
//    界面上也不许长出「下载 / 安装 / 获取」这类按钮。
//
// ② **「插件」是内部概念名，不给用户看。** 界面一律用这件工具自己的中文名
//    （地图、台账、换算器……）。板块本身对外叫「工具能力」，路由沿用内部名
//    `/plugin-gallery`，与 `/plugins`（阿里云市场 MCP 连接器目录）是两格不同的东西。

import raw from "@/content/plugin-gallery.json";

/** 非编辑类：空手进入，自身即体验。编辑类：先有一件素材，工具围着它转。 */
export type PluginKind = "standalone" | "editor";

export type PluginStatus = "shipped" | "spec-only";

export interface PluginCategory {
  id: string;
  label: string;
  kind: PluginKind;
}

export interface PluginEntry {
  id: string;
  name: string;
  kind: PluginKind;
  category: string;
  summary: string;
  does: string[];
  scenarios: string[];
  input: string;
  output: string;
  firstOpen: string;
  where: string;
  status: PluginStatus;
  /**
   * 编辑类工具在平台受信任编辑器注册表里的适配器 id。
   *
   * 标「已上线」的唯一凭据：拿这个 id 去 `TRUSTED_EDITOR_REGISTRY` 查，
   * `routable` 必须为真。测试是这么判的，不是比对文件里有没有这串字。
   * 非编辑类工具没有适配器，也就没有这个字段——它们一件都还没实装。
   */
  adapter?: string;
  /** 为什么敢这么标——写的是可复核的代码位置，不是形容词。 */
  statusNote: string;
  caution?: string;
  specPath: string;
}

export interface PluginGalleryPolicy {
  downloadable: false;
  reason: string;
}

const data = raw as unknown as {
  policy: PluginGalleryPolicy;
  categories: PluginCategory[];
  items: PluginEntry[];
};

export const PLUGIN_GALLERY_TITLE = "工具能力";

export const PLUGIN_GALLERY_INTRO =
  "OceanLeo 自己的工具：在 app 里打开就能用，不需要下载，也没有要装的东西。用它们做出来的表格、文档、图和网页才是可以带走的素材，会落进「我的库」。";

export const PLUGIN_GALLERY_POLICY: PluginGalleryPolicy = data.policy;

export const PLUGIN_CATEGORIES: readonly PluginCategory[] = data.categories;

export const PLUGIN_ITEMS: readonly PluginEntry[] = data.items;

export const KIND_LABELS: Record<PluginKind, string> = {
  standalone: "空手就能用",
  editor: "打开一件素材来用",
};

export const KIND_HINTS: Record<PluginKind, string> = {
  standalone: "不需要先有素材，点开就能开始。",
  editor: "先从「我的库」打开一件素材，对应的工具自己接手。",
};

export const STATUS_LABELS: Record<PluginStatus, string> = {
  shipped: "已上线",
  "spec-only": "规格已定未实装",
};

export const STATUS_HINTS: Record<PluginStatus, string> = {
  shipped: "现在就能用：从「我的库」打开对应素材即进入。",
  "spec-only": "产品目标已经定稿，平台上还没有它的入口。列在这里是为了说清我们要做什么，不是说它已经能用。",
};

export function categoryLabel(id: string): string {
  return PLUGIN_CATEGORIES.find((category) => category.id === id)?.label || id;
}

export function categoriesForKind(kind: PluginKind | "all"): PluginCategory[] {
  return PLUGIN_CATEGORIES.filter(
    (category) => kind === "all" || category.kind === kind,
  );
}

export function findPlugin(id: string): PluginEntry | null {
  return PLUGIN_ITEMS.find((item) => item.id === id) || null;
}

export function countByStatus(status: PluginStatus): number {
  return PLUGIN_ITEMS.filter((item) => item.status === status).length;
}

export interface PluginQuery {
  /** 自由文本，命中名称、一句话、能干什么、场景与类别名。 */
  text?: string;
  category?: string | "all";
  kind?: PluginKind | "all";
  status?: PluginStatus | "all";
}

function haystack(item: PluginEntry): string {
  return [
    item.name,
    item.id,
    item.summary,
    item.input,
    item.output,
    item.where,
    categoryLabel(item.category),
    KIND_LABELS[item.kind],
    STATUS_LABELS[item.status],
    ...item.does,
    ...item.scenarios,
  ]
    .join(" ")
    .toLowerCase();
}

export function filterPlugins({
  text = "",
  category = "all",
  kind = "all",
  status = "all",
}: PluginQuery = {}): PluginEntry[] {
  const needle = text.trim().toLowerCase();
  return PLUGIN_ITEMS.filter((item) => {
    if (kind !== "all" && item.kind !== kind) return false;
    if (category !== "all" && item.category !== category) return false;
    if (status !== "all" && item.status !== status) return false;
    if (!needle) return true;
    return haystack(item).includes(needle);
  });
}

/**
 * 这一格永不出现的**可点入口**。断言的是按钮与链接的文字，不是正文用词——
 * 说明「这里不提供下载」本身是诚实，不是违规。
 */
export const FORBIDDEN_ACTION_LABELS: readonly string[] = [
  "下载",
  "安装",
  "获取",
  "download",
  "install",
  "get it",
];

/** 任何链接都不许指向一个文件。 */
export const FORBIDDEN_LINK_PATTERNS: readonly string[] = [
  ".zip",
  ".msi",
  ".dmg",
  ".apk",
  ".aab",
  ".ipa",
  ".exe",
  ".pkg",
  ".tar",
  "blob:",
  "data:application",
];

/** 详情页路径。列表卡片点进来的就是它，不带任何文件地址。 */
export function pluginDetailHref(id: string): string {
  return `/plugin-gallery/${id}`;
}

/* ------------------------------------------------------------------ *
 * 可运行实例：从「看说明」到「真的能用」
 * ------------------------------------------------------------------ */
//
// 操作员的原话是「不能预览，只能看到文字描述，需要能够预览和使用」。
// 缺的从来不是查看器，是**货架上没有实物**（合同 §1：插件实物只有 1 件）。
// G1 交实物，这里只管一件事：**实物在哪个 origin 上跑。**
//
// 硬规矩（docs/architecture/oceanleo-untrusted-content-isolation.md）：
//   UC-1  可执行内容的服务域应当是 oceanleo.app；oceanleo.com 树下带着
//         Domain=.oceanleo.com 的非 httpOnly SSO cookie，不许跑不可信代码。
//   UC-3  不可信来源的 iframe 不得同时拿到 allow-scripts 与 allow-same-origin。
//   UC-6  postMessage 双向校验精确 origin —— 本模块**一条通道都不开**，
//         没有通道就没有 §7.3 说的那种「通用代理」面。

// 试用 iframe 的 `sandbox` **不在这里出常量**：它必须以字面量写在 JSX 上
// （`components/PluginGalleryRunner.tsx`）。跨仓扫描把「算出来的 sandbox 值」
// 单列一档，常量引用会被判成需要逐条说理的可疑面，字面量则一眼可判。

/** 隔离域必须是这个可注册域下的主机；`endsWith` 判的是可注册域，不是后缀花招。 */
const SANDBOX_REGISTRABLE_DOMAIN = "oceanleo.app";

/**
 * 配置好的隔离域 origin；没配或配歪一律返回 `null`（fail-closed）。
 *
 * 判据抄 game 仓 `lib/ugc/sandbox-origin.ts` 的那句：**不得回退到同域执行**。
 * 这里「回退」的含义要说准：回退目标不是裸的 `/works/plugin/<id>.html`，
 * 而是 `/plugin-gallery/runtime/<id>` —— 那条路由给响应配了
 * `Content-Security-Policy: sandbox allow-scripts`，文档因此落在不透明 origin，
 * 顶层打开也拿不到本站身份。两条路都不会让插件代码以本站 origin 运行。
 */
export function pluginSandboxOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_PLUGIN_SANDBOX_ORIGIN;
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname;
  if (host !== SANDBOX_REGISTRABLE_DOMAIN && !host.endsWith(`.${SANDBOX_REGISTRABLE_DOMAIN}`)) {
    return null;
  }
  // 根域必须保持零价值（UC-1 §2.3）：实例只落子域。
  if (host === SANDBOX_REGISTRABLE_DOMAIN) return null;
  return url.origin;
}

/**
 * 试用实例的地址。配了合法隔离域就用它，否则用本站的加固路由。
 *
 * `entryPath` 由读盘层给出（`app/plugin-gallery/runtime-registry.ts`），形如
 * `/plugin-gallery/runtime/<实例>/index.html`。路径两边**同形**：将来谁把隔离域
 * 立起来，只要按这个路径提供同一份字节，站上改一个环境变量即可切过去，不必改代码。
 */
export function pluginRuntimeSrc(entryPath: string): string {
  const origin = pluginSandboxOrigin();
  return origin ? `${origin}${entryPath}` : entryPath;
}
