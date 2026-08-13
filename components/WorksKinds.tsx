// 成品展厅的**纯数据层**：view.kind 表、artifact type 表、清单片段 schema。
//
// 为什么单独一个文件：装载器要读磁盘（node:fs），而查看器是客户端组件。
// 两者写在一起时 Turbopack 会把 node:fs 拖进浏览器包，构建当场失败
// （实测：`the chunking context (unknown) does not support external modules (request: node:fs)`）。
// 本文件**不许出现任何 node: 内置模块**。读盘的那一半在 lib/works.ts。
//
// 产线位（P1–P9）写 content/works/<artifact_type>.json 时的接口就是这里的
// `WorkEntry` 与 `VIEW_KINDS`；两者都从 lib/works.ts 一并再导出，两个入口等价。

/* ------------------------------------------------------------------ *
 * ① view.kind 表：一件成品在站内用哪个查看器打开
 * ------------------------------------------------------------------ */

/**
 * 查看方式的四档。决定详情页拿 `view` 里的哪些字段。
 * - `canvas`  站内把结构化 JSON 渲染成画面（design-document / chart / workflow / vector）
 * - `frame`   受限 iframe（website / game）。sandbox 见 VIEW_KINDS，一个字符都不放宽
 * - `paged`   分页预览图翻页；没有预览图就封面 + 下载（deck / document / pdf / grid）
 * - `media`   原生播放器 / 图片（audio / video / image / model-3d 静帧）
 */
export type ViewerMode = "canvas" | "frame" | "paged" | "media";

export type ViewKind =
  | "design-document"
  | "deck"
  | "website"
  | "game"
  | "document"
  | "pdf"
  | "grid"
  | "chart"
  | "vector"
  | "model-3d"
  | "audio"
  | "workflow"
  | "image"
  | "video"
  | "plugin";

export interface ViewKindSpec {
  /** 查看器档位。 */
  mode: ViewerMode;
  /** 中文名，详情页与列表页显示用（走 tt() 翻译）。 */
  label: string;
  /** `view.src` 期望指向什么。路径一律是 `public/` 下的绝对站内路径，`/works/…` 开头。 */
  src: string;
  /** 除 `src` 外这一档会用到的字段。产线位按需要给，缺了只降级不报废。 */
  extras: readonly (keyof WorkView)[];
  /** 这一档的查看规矩（安全姿势 / 降级路线）。 */
  note: string;
}

/**
 * 14 类成品的查看器表。**产线位写 `content/works/*.json` 之前先读这张表。**
 *
 * `src` 必须是站内绝对路径（`/works/<artifact_type>/<id>.<ext>`），对应
 * `public/works/<artifact_type>/…` 里的真实文件。装载器会核对文件是否存在，
 * 指不到文件的条目会被跳过 —— 打不开的东西不算成品。
 */
export const VIEW_KINDS: Readonly<Record<ViewKind, ViewKindSpec>> = {
  "design-document": {
    mode: "canvas",
    label: "设计画布文档",
    src: "oceanleo.design-document.v1 的 .json",
    extras: ["assets"],
    note:
      "站内按 document.elements[] 的 x/y/width/height/z 逐元素渲染成画面。" +
      "image 元素用 assetId 到 view.assets 里查站内图片路径，查不到画占位框，不影响其余元素。",
  },
  deck: {
    mode: "paged",
    label: "演示文稿",
    src: ".pptx（或 oceanleo.deck.v1 的 .json）",
    extras: ["pages", "download"],
    note:
      "站内**一定打得开**：没给 pages[] 时构建期直接解 .pptx，逐页渲染标题/要点/演讲备注；" +
      "给了 pages[] 就多一个「原版式」开关。两样都没有（解不开的加密件）才退回封面 + 下载。",
  },
  website: {
    mode: "frame",
    label: "网站",
    src: "解包后的入口 .html（zip 走 view.download）",
    extras: ["download", "aspect"],
    note:
      "受限 iframe，sandbox=\"\"（零权能，脚本不跑、拿不到同源）。" +
      "src 若是 .zip 则不 iframe，退回封面 + 下载。",
  },
  game: {
    mode: "frame",
    label: "游戏",
    src: "解包后的入口 .html（bundle 走 view.download）",
    extras: ["download", "aspect"],
    note:
      "受限 iframe，sandbox=\"allow-scripts\"（游戏要跑脚本；**不给 allow-same-origin**，" +
      "两者同给等于把本站源交出去，见 tests/untrusted-render-surface.test.mjs UC-3）。" +
      "src 只认解包后的 .html：`.game.json` 信封里的整份 HTML **站内不跑**" +
      "（塞 srcdoc 会继承本站 origin，域隔离作废），只出玩法说明 + 下载。",
  },
  document: {
    mode: "paged",
    label: "文档",
    src: ".docx",
    extras: ["pages", "download"],
    note:
      "同 deck：没给 pages[] 时构建期解 .docx，按标题/正文/列表/表格重排出可读文档。" +
      "解出来的是 w:t 里的正文，**不是把字节当文字摆出来**。",
  },
  pdf: {
    mode: "paged",
    label: "PDF",
    src: ".pdf",
    extras: ["pages", "download"],
    note:
      "优先 pages[] 翻页（不依赖浏览器内置 PDF 插件）；没给就构建期抽 PDF 文本算子逐页出文字版。" +
      "扫描件（页面里只有位图、没有文本算子）抽不出，那种才退回封面 + 下载。",
  },
  grid: {
    mode: "paged",
    label: "表格",
    src: ".xlsx",
    extras: ["pages", "download", "sheets"],
    note:
      "有 sheets[]（表头 + 行数据）就照它画；没给就构建期解 .xlsx，逐张工作表画表" +
      "（跨列标题行会被提到表上方，不会被当成表头）。再没有才是 pages[] / 封面。",
  },
  chart: {
    mode: "canvas",
    label: "图表",
    src: "结构化图表 .json（series/categories）或 .svg",
    extras: [],
    note: "站内渲染。.svg 走内联 <img>；.json 按 series 画条形/折线，画不出就退回封面。",
  },
  vector: {
    mode: "canvas",
    label: "矢量图",
    src: ".svg",
    extras: ["download"],
    note: "以 <img> 引用站内 .svg 渲染（不内联注入 HTML，避免 svg 里的脚本进本站文档）。",
  },
  "model-3d": {
    mode: "media",
    label: "三维模型",
    src: ".glb / .gltf",
    extras: ["stills", "poster", "download"],
    note: "站内没有 3D 查看器，走多视角静帧 stills[] + 下载。有 poster 用 poster 打头。",
  },
  audio: {
    mode: "media",
    label: "音频",
    src: ".mp3 / .wav / .m4a",
    extras: ["waveform", "download", "durationSec"],
    note: "原生 <audio> 播放器 + 波形图 waveform（没有波形也能播）。",
  },
  workflow: {
    mode: "canvas",
    label: "工作流",
    src: "结构化流程 .json（nodes/edges）",
    extras: [],
    note: "站内按 nodes/edges 画流程图；节点缺坐标时按层序自动排。",
  },
  image: {
    mode: "media",
    label: "图片",
    src: ".webp / .png / .jpg",
    extras: ["download", "aspect"],
    note: "原尺寸查看（点击放大）。",
  },
  video: {
    mode: "media",
    label: "视频",
    src: ".mp4 / .webm",
    extras: ["poster", "frames", "download", "durationSec"],
    note: "原生 <video> + poster；有 frames[] 抽帧就在下面排一行帧。",
  },
  plugin: {
    mode: "frame",
    label: "工具",
    src: "实例入口 .html（`/works/plugin/<实例>/index.html`）",
    extras: ["aspect"],
    note:
      "受限 iframe，sandbox=\"allow-scripts\"（工具要跑脚本；**不给 allow-same-origin**）。" +
      "**不直接嵌 view.src**：站内改嵌 /plugin-gallery/runtime/<实例>/…，那条路由给文档配了" +
      "`Content-Security-Policy: sandbox`，顶层直接打开也拿不到本站 origin。" +
      "src 不在 /works/plugin/ 下时不运行，只出封面与说明（fail-closed）。",
  },
};

export const VIEW_KIND_IDS = Object.keys(VIEW_KINDS) as ViewKind[];

export function isViewKind(v: unknown): v is ViewKind {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(VIEW_KINDS, v);
}

/* ------------------------------------------------------------------ *
 * ② artifact type 表：列表页按这个分格
 * ------------------------------------------------------------------ */

export type ArtifactType =
  | "composite_image"
  | "deck"
  | "website"
  | "game"
  | "document"
  | "pdf"
  | "grid"
  | "chart"
  | "vector_image"
  | "model_3d"
  | "audio"
  | "workflow"
  | "single_file_image"
  | "video"
  | "plugin";

/** 列表页的分格顺序。清单片段文件名 = artifact type（`content/works/<type>.json`）。 */
export const ARTIFACT_TYPE_ORDER: readonly ArtifactType[] = [
  "composite_image",
  "deck",
  "website",
  "game",
  "plugin",
  "document",
  "pdf",
  "grid",
  "chart",
  "vector_image",
  "model_3d",
  "audio",
  "workflow",
  "single_file_image",
  "video",
];

export const ARTIFACT_TYPE_LABELS: Readonly<Record<ArtifactType, string>> = {
  composite_image: "设计稿",
  deck: "演示文稿",
  website: "网站",
  game: "游戏",
  document: "文档",
  pdf: "PDF",
  grid: "表格",
  chart: "图表",
  vector_image: "矢量图",
  model_3d: "三维模型",
  audio: "音频",
  workflow: "工作流",
  single_file_image: "图片",
  video: "视频",
  plugin: "工具",
};

/**
 * 工具实例在站内的**运行地址**：把货源路径换成加固路由。
 *
 * `/works/plugin/<实例>/index.html` → `/plugin-gallery/runtime/<实例>/index.html`
 *
 * 为什么不直接嵌 `view.src`：那条裸路径顶层打开时脚本跑在 asset.oceanleo.com 自己的
 * origin 上（带着 `Domain=.oceanleo.com` 的 SSO cookie）。加固路由给文档配了
 * `Content-Security-Policy: sandbox allow-scripts`，两种打开方式都落在不透明 origin。
 * 见 `app/plugin-gallery/runtime/[...path]/route.ts`。
 *
 * 前缀对不上就返回 null，**不猜也不降级到裸路径**（fail-closed）。
 */
export function pluginRuntimePathFor(src: string): string | null {
  const prefix = "/works/plugin/";
  if (!src.startsWith(prefix) || src.includes("..")) return null;
  const rest = src.slice(prefix.length);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*\.html?$/.test(rest)) return null;
  return `/plugin-gallery/runtime/${rest}`;
}

export function isArtifactType(v: unknown): v is ArtifactType {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ARTIFACT_TYPE_LABELS, v);
}

/* ------------------------------------------------------------------ *
 * ②b 物料族：一个 artifact type 内部还要再分的那一层
 * ------------------------------------------------------------------ */

// `composite_image` 一格里装着四种彼此无关的东西：简历、LOGO、小红书封面、名片。
// 用户来找名片，不该先滚过二十件简历 —— 所以这一类在列表页再分一层「物料」。
// 其余 13 类没有这一层，`familiesFor()` 对它们返回 null，列表页照旧一格到底。

export interface MaterialFamily {
  id: string;
  label: string;
  /** 一句话说清这一族是什么，列表页写在小标题下面。 */
  hint: string;
  /** `styleId` / `id` 的前缀。判族的第一与第二凭据。 */
  prefixes: readonly string[];
  /**
   * 只写这一族的清单片段文件名。判族的第三凭据。
   *
   * 兜底靠文件而不是靠「猜」：片段文件按合同一位 owner 一份、一份一族
   * （`tasks2/_COMMON2.md` §5），所以文件名是可信的归属证据。产线位改了
   * `styleId` 的命名习惯时，这一层能接住，不至于让整族掉进「其他」。
   */
  files: readonly string[];
}

export const MATERIAL_FAMILIES: Readonly<Partial<Record<ArtifactType, readonly MaterialFamily[]>>> = {
  composite_image: [
    {
      id: "resume",
      label: "简历",
      hint: "求职用的一页纸：证件照、基本信息栏、经历与技能。",
      prefixes: ["resume-"],
      files: ["composite_image.json"],
    },
    {
      id: "logo",
      label: "LOGO",
      hint: "品牌标识本身，不是带标识的海报。",
      prefixes: ["logo-"],
      files: ["composite_image.logo.json"],
    },
    {
      id: "xhs",
      label: "小红书封面",
      hint: "竖版信息流封面，第一眼要能读懂在讲什么。",
      prefixes: ["xhs-"],
      files: ["composite_image.xhs.json"],
    },
    {
      id: "namecard",
      label: "名片",
      hint: "标准名片开本，正反面的版面各算一件。",
      prefixes: ["namecard-"],
      files: ["composite_image.namecard.json"],
    },
  ],
};

/** 三条凭据都没命中时的去处。**不猜**，如实归到「其他」。 */
export const OTHER_FAMILY: MaterialFamily = {
  id: "other",
  label: "其他设计稿",
  hint: "还没归进上面几族的设计稿。",
  prefixes: [],
  files: [],
};

export function familiesFor(type: ArtifactType): readonly MaterialFamily[] | null {
  return MATERIAL_FAMILIES[type] ?? null;
}

/** 一件成品属于哪一族：先看 `styleId` 前缀，再看 `id` 前缀，最后看它来自哪份片段。 */
export function familyOf(work: WorkEntry): MaterialFamily {
  const families = familiesFor(work.artifactType);
  if (!families) return OTHER_FAMILY;
  for (const key of [work.styleId, work.id]) {
    if (!key) continue;
    const hit = families.find((f) => f.prefixes.some((p) => key.startsWith(p)));
    if (hit) return hit;
  }
  return families.find((f) => f.files.includes(work.sourceFile)) ?? OTHER_FAMILY;
}

export interface FamilyGroup {
  family: MaterialFamily;
  works: WorkEntry[];
}

/** 按物料族分堆，空族不出现。族的顺序照 `MATERIAL_FAMILIES` 写的顺序，「其他」永远垫底。 */
export function groupByFamily(type: ArtifactType, works: WorkEntry[]): FamilyGroup[] {
  const families = familiesFor(type);
  if (!families) return [];
  const buckets = new Map<string, FamilyGroup>();
  for (const family of [...families, OTHER_FAMILY]) {
    buckets.set(family.id, { family, works: [] });
  }
  for (const work of works) {
    buckets.get(familyOf(work).id)?.works.push(work);
  }
  return [...buckets.values()].filter((g) => g.works.length > 0);
}

/** 列表页小节的锚点 id，详情页面包屑要跳回同一个位置。 */
export function familyAnchor(type: ArtifactType, familyId: string): string {
  return `${type}--${familyId}`;
}

/* ------------------------------------------------------------------ *
 * ③ 清单片段 schema
 * ------------------------------------------------------------------ */

export interface WorkAttribution {
  text: string;
  licenseCode: string;
  licenseUrl: string;
}

export interface WorkSheet {
  name: string;
  header?: string[];
  rows?: (string | number | null)[][];
}

export interface WorkView {
  kind: ViewKind;
  /** 站内绝对路径，`/works/<artifact_type>/…`。必须真实存在于 public 下。 */
  src: string;
  /** 分页预览图（deck / document / pdf / grid）。 */
  pages?: string[];
  /** design-document 的 image 元素：assetId → 站内图片路径。 */
  assets?: Record<string, string>;
  /** 多视角静帧（model-3d）。 */
  stills?: string[];
  /** video / model-3d 的首帧图。 */
  poster?: string;
  /** 音频波形图。 */
  waveform?: string;
  /** 视频抽帧。 */
  frames?: string[];
  /** 表格的站内可读内容。 */
  sheets?: WorkSheet[];
  /** 下载用的字节，与 src 不同时给（例：website 的 zip）。 */
  download?: string;
  /** 画面宽高比，`16/9` 这样的数值，iframe / 图片留位用。 */
  aspect?: number;
  durationSec?: number;
}

/**
 * 「这一类还由不由我们自己产」。交接契约见 `signals/X1-signals.md` S1，字段名已定死。
 *
 * 它说的**不是下架**：成品还在、还有效、还能下载。说的是这一类不再由 agent 自产，
 * 改由外接 API 生成。两句话都必须出现在界面上——只说前者会让用户以为东西没了，
 * 什么都不说会让用户以为这一类还在更新。
 */
export interface WorkProduction {
  /** 今天只认这一个取值；其余一律当没有（fail-closed）。 */
  status: "external-api";
  /** 操作员裁定日，`YYYY-MM-DD`。 */
  retiredOn: string;
  /** agent 还剩多少活：`none` 全停；`design-doc` 只出设计文档。 */
  agentScope: "none" | "design-doc";
  /** 给用户看的原话，**逐字上屏**，站上不改写。 */
  notice: string;
}

export interface WorkEntry {
  id: string;
  artifactType: ArtifactType;
  title: string;
  /** 对应 `docs/design-guides/<artifact_type>/<styleId>.md` 那份版面指导。 */
  styleId: string;
  summary: string;
  /** 真封面图（站内绝对路径）。指不到文件的条目会被跳过。 */
  cover: string;
  view: WorkView;
  downloadable: boolean;
  attribution: WorkAttribution[];
  /** 收据读数，原样抄进来，详情页原样列出。 */
  readings?: Record<string, unknown>;
  /** 这一类的自产状态；仍在自产的类型没有这一格。 */
  production?: WorkProduction;
  /** 装载时补上：这一条来自哪个片段文件。构建期报错定位用。 */
  sourceFile: string;
}

/* ------------------------------------------------------------------ *
 * ④ 构建期从真字节抽出来的正文（.pptx / .docx / .xlsx / .pdf）
 * ------------------------------------------------------------------ */

// 形状定义放这里而不是 lib/works-extract.ts：抽取器要 node:fs / node:zlib，
// 查看器是客户端组件，两边只能共享**纯类型**。抽取器从这里 re-export。

export interface DocParagraph {
  kind: "heading" | "para" | "list";
  /** heading 的层级，1 最大。para / list 恒为 0。 */
  level: number;
  text: string;
}

export interface DocTable {
  kind: "table";
  rows: string[][];
}

export type DocBlock = DocParagraph | DocTable;

export interface DeckSlide {
  index: number;
  title: string;
  lines: string[];
  notes: string[];
}

export interface PdfPage {
  index: number;
  lines: string[];
}

/** 抽出来的表比片段里的 `sheets[]` 多一样东西：跨列标题行（不是表头）。 */
export interface ExtractedSheet extends WorkSheet {
  caption?: string[];
}

export type ExtractedContent =
  | { form: "doc"; from: string; blocks: DocBlock[] }
  | { form: "slides"; from: string; slides: DeckSlide[] }
  | { form: "sheets"; from: string; sheets: ExtractedSheet[] }
  | { form: "pages"; from: string; pages: PdfPage[] };

/** 「这份正文是从什么格式里打开的」，详情页照实说。 */
export const EXTRACT_SOURCE_LABELS: Record<string, string> = {
  pptx: "PowerPoint 演示文稿",
  docx: "Word 文档",
  xlsx: "Excel 工作簿",
  pdf: "PDF",
};

/** 下载入口只对 `downloadable: true` 开；关着的时候一律返回 null。 */
export function downloadHref(work: WorkEntry): string | null {
  if (!work.downloadable) return null;
  return work.view.download ?? work.view.src;
}
