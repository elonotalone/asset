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
