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
  | "video";

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
    note: "有 pages[]（每页一张预览图）就翻页看；没有就封面 + 下载入口。字节绝不当文字摆出来。",
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
      "两者同给等于把本站源交出去，见 tests/untrusted-render-surface.test.mjs UC-3）。",
  },
  document: {
    mode: "paged",
    label: "文档",
    src: ".docx",
    extras: ["pages", "download"],
    note: "同 deck：有 pages[] 翻页，没有就封面 + 下载。不许把 docx 字节渲染成乱码文字。",
  },
  pdf: {
    mode: "paged",
    label: "PDF",
    src: ".pdf",
    extras: ["pages", "download"],
    note: "优先 pages[] 翻页（不依赖浏览器内置 PDF 插件）；没有就封面 + 下载。",
  },
  grid: {
    mode: "paged",
    label: "表格",
    src: ".xlsx",
    extras: ["pages", "download", "sheets"],
    note: "有 sheets[]（表头 + 行数据）就站内画表；否则 pages[] 翻页；再否则封面 + 下载。",
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
  | "video";

/** 列表页的分格顺序。清单片段文件名 = artifact type（`content/works/<type>.json`）。 */
export const ARTIFACT_TYPE_ORDER: readonly ArtifactType[] = [
  "composite_image",
  "deck",
  "website",
  "game",
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
};

export function isArtifactType(v: unknown): v is ArtifactType {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ARTIFACT_TYPE_LABELS, v);
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
