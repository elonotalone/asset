// 「平台能干的活」板块的数据层。
//
// 数据来自 oceandino 仓 `docs/specs/oceanleo-plugins-v1/editors/` 的产品目标，
// 整理结果落在 `content/plugin-gallery.json`。
//
// 三条产品前提，改这里之前先读一遍：
//
// ① **这一格只有编辑器。** 2026-08-19 起，22 件独立小工具（地图、台账、话术分支、
//    关系图……）整体下架：办公追求简洁与明确，不做一人公司养不起的花架子。
//    每一件留下来的东西都得先有一份用户自己的素材，工具围着那份素材转。
//    新增条目前先问一句：一个人在办公时会为它付钱吗。
//
// ② **可看不可下。** 这些不是可下载的成品，是用户在 app 里打开来用的软件。
//    判据是一句话：能不能存到硬盘、离线打开。能，那是素材，归货架；不能，归这里。
//    所以这份数据里**不存在**任何下载地址、安装包、版本号或体积字段，
//    界面上也不许长出「下载 / 安装 / 获取」这类按钮。
//
// ③ **「插件」是内部概念名，不给用户看。** 界面一律用这件工具自己的中文名
//    （文档编辑器、表格编辑器……）。路由沿用内部名 `/plugin-gallery`，
//    与 `/plugins`（阿里云市场 MCP 连接器目录）是两格不同的东西。

import raw from "@/content/plugin-gallery.json";

export interface PluginCategory {
  id: string;
  label: string;
}

export interface PluginEntry {
  id: string;
  name: string;
  category: string;
  summary: string;
  does: string[];
  scenarios: string[];
  input: string;
  output: string;
  firstOpen: string;
  where: string;
  /**
   * 这件工具在平台受信任编辑器注册表里的适配器 id。
   *
   * 它只说明平台能让一件兼容素材进入对应工作台，不说明这一格已经有匿名直达 URL。
   */
  adapter: string;
  /** 规格或能力的可复核代码依据；它本身不决定“现在能不能打开”。 */
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

export const PLUGIN_GALLERY_TITLE = "平台能干的活";

export const PLUGIN_GALLERY_INTRO =
  "这里是平台自己能干的活，不是小工具集市：把「我的库」里的一份文档、表格、演示稿、图片、视频、音频、模型或网站打开，接着改，存成新版本。没有要下载的东西，也没有要装的东西。";

/** 用户可见的开场白之外，还要说清这一格为什么变小了。 */
export const PLUGIN_GALLERY_SCOPE_NOTE =
  "2026-08-19 起，地图、台账、话术分支、关系图这类独立小工具已经整体下架——办公要的是简洁明确，不是玩具多。留下的每一件都得先有你自己的一份素材。";

export const PLUGIN_GALLERY_POLICY: PluginGalleryPolicy = data.policy;

export const PLUGIN_CATEGORIES: readonly PluginCategory[] = data.categories;

export const PLUGIN_ITEMS: readonly PluginEntry[] = data.items;

export const OPEN_HINT =
  "先看一件真实兼容素材；有直达入口就从这里打开，没有时按页面给出的步骤从「我的库」进入。";

export function categoryLabel(id: string): string {
  return PLUGIN_CATEGORIES.find((category) => category.id === id)?.label || id;
}

export function findPlugin(id: string): PluginEntry | null {
  return PLUGIN_ITEMS.find((item) => item.id === id) || null;
}

export interface PluginQuery {
  /** 自由文本，命中名称、一句话、能干什么、场景与类别名。 */
  text?: string;
  category?: string | "all";
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
    ...item.does,
    ...item.scenarios,
  ]
    .join(" ")
    .toLowerCase();
}

export function filterPlugins({
  text = "",
  category = "all",
}: PluginQuery = {}): PluginEntry[] {
  const needle = text.trim().toLowerCase();
  return PLUGIN_ITEMS.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
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
 * 编辑器入口与真实演示素材
 * ------------------------------------------------------------------ */

export interface PluginEditorAccess {
  adapter: string;
  /** 仅在已经证明顶层窗口中可用时填写；协议 iframe 端点不得放进来。 */
  entryUrl: string | null;
  demoHref: `/works/${string}`;
  demoName: string;
  unavailableReason: string;
  nextStep: string;
}

/**
 * 编辑器地址不是插件隔离域。它只能是查证过的第一方产品页，而且必须全串匹配；
 * query、fragment、userinfo、端口、近似域名与协议接收端都不在白名单里。
 */
const EDITOR_ENTRYPOINT_URL =
  /^https:\/\/video\.oceanleo\.com\/canvas-board$/;

export function isEditorEntrypointUrl(value: unknown): value is string {
  return typeof value === "string" && EDITOR_ENTRYPOINT_URL.test(value);
}

const EDITOR_ACCESS: Readonly<Record<string, PluginEditorAccess>> = Object.freeze({
  "image-editor": {
    adapter: "image",
    entryUrl: null,
    demoHref: "/works/object-spec-plate-01",
    demoName: "跑鞋 · 中距离训练款规格板",
    unavailableReason: "图片工作台目前只能由「我的库」中的位图素材启动，没有登出状态可用的独立地址。",
    nextStep: "先查看这件真实位图；取得原件后把它加入任一 OceanLeo 站点的「我的库」，再从库中点开图片进入编辑器。",
  },
  "design-canvas": {
    adapter: "design-canvas",
    entryUrl: null,
    demoHref: "/works/resume-clinical-01",
    demoName: "资质先行风格简历 · 三甲医院 ICU 重症护理",
    unavailableReason: "设计子站现有地址是宿主协议端点，顶层打开不会保留具体设计文档，因此不能冒充匿名直达。",
    nextStep: "先查看这件真实设计工程；取得原件后把它加入「我的库」，再从库中点开设计稿进入画布。",
  },
  "chart-editor": {
    adapter: "chart-editor@1",
    entryUrl: null,
    demoHref: "/works/supply-size-histogram-01",
    demoName: "素材库 238 个类目的规模分布",
    unavailableReason: "图表工作台需要一件带 oceanleo.chart.v1 结构化源的库内素材，今天没有匿名启动页。",
    nextStep: "先查看这件带结构化源的真实图表；取得原件后加入「我的库」，再从库中点开它进入图表编辑器。",
  },
  "richdoc-editor": {
    adapter: "richdoc",
    entryUrl: null,
    demoHref: "/works/document-regulation-01",
    demoName: "远程与混合办公设备借用管理办法",
    unavailableReason: "文档工作台目前只能由「我的库」中的文档素材启动，没有匿名启动页。",
    nextStep: "先查看这份真实 DOCX；取得原件后加入「我的库」，再从库中点开文档进入编辑器。",
  },
  "grid-editor": {
    adapter: "grid",
    entryUrl: null,
    demoHref: "/works/pack-capacity-model-01",
    demoName: "离线素材包容量测算（三情景）",
    unavailableReason: "表格工作台目前只能由「我的库」中的表格素材启动，没有匿名启动页。",
    nextStep: "先查看这份真实 XLSX；取得原件后加入「我的库」，再从库中点开表格进入编辑器。",
  },
  "deck-editor": {
    adapter: "deck",
    entryUrl: null,
    demoHref: "/works/deck-nocturne-01",
    demoName: "夜间海岸观测：2026 年度影像汇报",
    unavailableReason: "演示文稿工作台目前只能由「我的库」中的 PPT 素材启动，没有匿名启动页。",
    nextStep: "先查看这份真实 PPTX；取得原件后加入「我的库」，再从库中点开演示文稿进入编辑器。",
  },
  "pdf-editor": {
    adapter: "pdf",
    entryUrl: null,
    demoHref: "/works/pdf-interview-record-01",
    demoName: "社区食堂运营访谈纪要",
    unavailableReason: "PDF 工作台目前只能由「我的库」中的 PDF 素材启动，没有匿名启动页。",
    nextStep: "先查看这份真实 PDF；取得原件后加入「我的库」，再从库中点开它开始标注。",
  },
  "video-timeline": {
    adapter: "video-timeline",
    entryUrl: null,
    demoHref: "/works/hard-cut-caption-14s-01",
    demoName: "硬切字幕 · 九月食堂三件事",
    unavailableReason: "视频时间线目前只能由「我的库」中的视频素材启动，没有匿名启动页。",
    nextStep: "先查看这段真实 MP4；取得原件后加入「我的库」，再从库中点开视频进入时间线。",
  },
  "audio-editor": {
    adapter: "audio",
    entryUrl: null,
    demoHref: "/works/ui-feedback-dry-01",
    demoName: "干净瞬态 · 界面反馈音组",
    unavailableReason: "音频工作台目前只能由「我的库」中的音频素材启动，没有匿名启动页。",
    nextStep: "先试听这段真实 MP3；取得原件后加入「我的库」，再从库中点开音频进入编辑器。",
  },
  "model-3d-editor": {
    adapter: "threed",
    entryUrl: null,
    demoHref: "/works/model-prismatic-massing-01",
    demoName: "滨海科研园区体量研究 · 棱柱阵列",
    unavailableReason: "3D 工作台目前只能由「我的库」中的整包模型启动，没有匿名启动页。",
    nextStep: "先查看这件真实 glTF 模型；取得整包原件后加入「我的库」，再从库中点开模型进入 3D 工作台。",
  },
  "website-editor": {
    adapter: "website",
    entryUrl: null,
    demoHref: "/works/law-intake-01",
    demoName: "劳动仲裁受理台 · 获客落地页",
    unavailableReason: "网站子站现有地址是宿主协议端点，顶层打开会离开编辑器，不能冒充匿名直达。",
    nextStep: "先查看这件带 site.json 与 starter 的真实网站；取得源码后加入「我的库」，再从库中点开网站进入编辑器。",
  },
  "game-editor": {
    adapter: "game",
    entryUrl: null,
    demoHref: "/works/one-breath-reflex-01",
    demoName: "潮汐门",
    unavailableReason: "游戏编辑必须由共享壳把一件游戏 bundle 挂进受控沙箱，今天没有匿名启动页。",
    nextStep: "先打开这件真实游戏试玩；取得 bundle 原件后加入「我的库」，再从库中点开游戏进入编辑器。",
  },
  "workflow-canvas": {
    adapter: "video-canvas",
    entryUrl: "https://video.oceanleo.com/canvas-board",
    demoHref: "/works/linear-conveyor-01",
    demoName: "一条道传送带 · 整批图片过同一道工序",
    unavailableReason: "",
    nextStep: "直接打开工作流画布；需要一份参照时，可同时查看这件五节点真实流程。",
  },
});

export function editorAccessForPlugin(
  item: PluginEntry,
): PluginEditorAccess | null {
  const access = EDITOR_ACCESS[item.id];
  return access?.adapter === item.adapter ? access : null;
}

export function pluginIsAvailable(item: PluginEntry): boolean {
  const access = editorAccessForPlugin(item);
  return isEditorEntrypointUrl(access?.entryUrl);
}

export function filterAvailablePlugins(
  items: readonly PluginEntry[],
): PluginEntry[] {
  return items.filter((item) => pluginIsAvailable(item));
}

/* ------------------------------------------------------------------ *
 * 已经拆掉的东西
 * ------------------------------------------------------------------ *
 *
 * UC-1/UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1、§8.3
 *
 * 22 件独立小工具下架之后，这一格再没有任何在隔离域里跑第一方运行字节的条目，
 * 所以 `isPluginRuntimeUrl()`、`s-<hash>.oceanleo.app/embed` 与
 * `plugins.oceanleo.app/<id>/` 两条入口文法、以及它们背后的 id 白名单一起删掉了。
 * 这不是放宽：连接收端都没有了。要再长出隔离域入口，必须重新写一个全串匹配的
 * 校验器并配一组反例断言，绝不允许从主机名后缀推断信任。
 */
