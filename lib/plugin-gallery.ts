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
  /**
   * 编辑类工具在平台受信任编辑器注册表里的适配器 id。
   *
   * 它只说明平台能让一件兼容素材进入对应工作台，不说明画廊已经有匿名直达 URL。
   * 非编辑类工具没有适配器；它们的可用性只由 runtime plan 决定。
   */
  adapter?: string;
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
  editor: "先看一件真实兼容素材；有直达入口就从这里打开，没有时按页面给出的步骤从「我的库」进入。",
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

export interface PluginQuery {
  /** 自由文本，命中名称、一句话、能干什么、场景与类别名。 */
  text?: string;
  category?: string | "all";
  kind?: PluginKind | "all";
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
}: PluginQuery = {}): PluginEntry[] {
  const needle = text.trim().toLowerCase();
  return PLUGIN_ITEMS.filter((item) => {
    if (kind !== "all" && item.kind !== kind) return false;
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
  if (item.kind !== "editor" || !item.adapter) return null;
  const access = EDITOR_ACCESS[item.id];
  return access?.adapter === item.adapter ? access : null;
}

export function pluginIsAvailable(
  item: PluginEntry,
  runtimePluginIds: ReadonlySet<string> | readonly string[] = [],
): boolean {
  if (item.kind === "standalone") {
    const ids = runtimePluginIds instanceof Set
      ? runtimePluginIds
      : new Set(runtimePluginIds);
    return ids.has(item.id);
  }
  const access = editorAccessForPlugin(item);
  return isEditorEntrypointUrl(access?.entryUrl);
}

export function filterAvailablePlugins(
  items: readonly PluginEntry[],
  runtimePluginIds: ReadonlySet<string> | readonly string[] = [],
): PluginEntry[] {
  return items.filter((item) => pluginIsAvailable(item, runtimePluginIds));
}

/* ------------------------------------------------------------------ *
 * 隔离域运行入口
 * ------------------------------------------------------------------ */

/**
 * UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
 *
 * F9 命名空间 C 的完整入口文法。直接对原始字符串做全串匹配，因而相对地址、
 * userinfo、端口、query、fragment、近似域名和额外路径都会被拒绝。这里没有任何
 * `oceanleo.com` 或相对 URL fallback；缺 plan 侧车时页面只能显示“暂不可用”。
 */
const SANDBOX_PLUGIN_RUNTIME_URL =
  /^https:\/\/s-[0-9a-f]{32}\.oceanleo\.app\/embed$/;

/**
 * UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md §8.3
 * 命名空间 D 只信任 active-runtime-manifest.json 中 kind === "plugin" 的现有 id；
 * 信任绝不能从 plugins.oceanleo.app 主机名后缀或任意目录名格式推断。
 */
const FIRST_PARTY_PLUGIN_RUNTIME_IDS: ReadonlySet<string> = new Set([
  "annotatable-city-map-01",
  "concept-knowledge-graph-01",
  "contract-assembly-01",
  "dialogue-branch-script-01",
  "executable-notebook-01",
  "financial-calculator-01",
  "floorplan-annotation-01",
  "formula-derivation-walkthrough-01",
  "interactive-globe-01",
  "ledger-register-01",
  "legal-calculator-01",
  "literature-matrix-01",
  "medical-calculator-01",
  "metrics-dashboard-01",
  "relationship-graph-01",
  "search-query-builder-01",
  "self-test-quiz-01",
  "spaced-repetition-scheduler-01",
  "three-statement-model-01",
  "unit-converter-01",
  "voiceover-script-01",
  "world-map-01",
]);

const FIRST_PARTY_PLUGIN_RUNTIME_URL =
  /^https:\/\/plugins\.oceanleo\.app\/([^/]+)\/$/;

export function isPluginRuntimeUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (SANDBOX_PLUGIN_RUNTIME_URL.test(value)) return true;
  const match = FIRST_PARTY_PLUGIN_RUNTIME_URL.exec(value);
  return match !== null && FIRST_PARTY_PLUGIN_RUNTIME_IDS.has(match[1]);
}
