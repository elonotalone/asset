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
 * - `summary` 站内显示安全结构化源与 cover；主动内容只给 `.oceanleo.app` 新窗口入口
 * - `paged`   分页预览图翻页；没有预览图就封面 + 下载（deck / document / pdf / grid）
 * - `media`   原生播放器 / 图片（audio / video / image / model-3d 静帧）
 */
export type ViewerMode = "canvas" | "summary" | "paged" | "media";

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
  /** `view.src` 期望指向什么。路径一律是 `public/` 下的安全站内字节，`/works/…` 开头。 */
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
    mode: "summary",
    label: "网站",
    src: "权威 site.json（zip 走 view.download，运行入口由 F9 plan 注入）",
    extras: ["download", "source", "runtime", "aspect"],
    note:
      "站内显示结构化目的与 cover；只有精确 https://s-<32hex>.oceanleo.app/embed 才显示" +
      "新窗口“打开网站”，不 iframe，也不回退 asset 同源入口。",
  },
  game: {
    mode: "summary",
    label: "游戏",
    src: ".game.json 安全信封（运行入口由 F9 plan 注入）",
    extras: ["download", "runtime", "aspect"],
    note:
      "服务端先从 `.game.json` 摘掉 runnable source，再显示玩法与 cover；只有精确" +
      " namespace-C `/embed` 才显示新窗口“打开试玩”，不 iframe/srcdoc。",
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

export type DeckDeliveryFamily = "pptx" | "html";

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
  deck: [
    {
      id: "pptx",
      label: "PPTX 演示",
      hint: "可下载、可继续编辑的 PowerPoint 演示文稿。",
      prefixes: [],
      files: ["deck.json"],
    },
    {
      id: "html",
      label: "HTML 网页演示",
      hint: "自包含网页演示；站内看逐页静态预览，在隔离域新窗口播放。",
      prefixes: [],
      files: ["deck.html.json"],
    },
  ],
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

/**
 * deck 的交付家族只认受控字段与清单文件名，二者冲突就失败关闭。
 * `deck.json` 是存量 PPTX 清单；`deck.html.json` 是 HTML delivery 专属清单。
 */
export function deckDeliveryFamilyFrom(
  deliveryFamily: unknown,
  sourceFile: string,
): DeckDeliveryFamily | null {
  const declared =
    deliveryFamily === undefined
      ? null
      : deliveryFamily === "pptx" || deliveryFamily === "html"
        ? deliveryFamily
        : undefined;
  if (declared === undefined) return null;
  const fromFile =
    sourceFile === "deck.json"
      ? "pptx"
      : sourceFile === "deck.html.json"
        ? "html"
        : null;
  if (declared && fromFile && declared !== fromFile) return null;
  return declared ?? fromFile;
}

/**
 * 一件成品属于哪一族：有 `workflow.id` 的按它的场景段判，其余先看 `styleId` 前缀，
 * 再看 `id` 前缀，最后看它来自哪份片段。
 *
 * deck 不走工作流那条：它的族由受控字段 `deliveryFamily` 与片段文件名对账得出，
 * 两者冲突时失败关闭，比 id 里的一个字符串更硬。
 *
 * 工作流优先只对**带这一格的新件**生效：存量一件都没有这一格，族归属分毫不动。
 */
export function familyOf(work: WorkEntry): MaterialFamily {
  const families = familiesFor(work.artifactType);
  if (!families) return OTHER_FAMILY;
  if (work.artifactType === "deck") {
    const family = deckDeliveryFamilyFrom(work.deliveryFamily, work.sourceFile);
    return families.find((candidate) => candidate.id === family) ?? OTHER_FAMILY;
  }
  const scene = workflowSceneOf(work.workflow);
  if (scene) {
    const hit = families.find((f) => f.id === scene);
    if (hit) return hit;
  }
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
  /** 安全结构化源或静态媒体的站内绝对路径。必须真实存在于 public 下。 */
  src: string;
  /**
   * 主动内容的唯一运行入口。content 清单不准手填；loader 只从与 F9 manifest
   * 精确对账的 plan 侧车注入。值不满足 isActiveRuntimeUrl() 时不进入 WorkView。
   */
  runtime?: string;
  /** 可单独打开的权威结构化源（website 的 site.json）；必须是 public 下现存文件。 */
  source?: string;
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

/** UC-1：只接受 namespace-C 的精确 HTTPS `/embed`，不解析、不补全、不回退。 */
const ACTIVE_RUNTIME_URL_RE =
  /^https:\/\/s-[0-9a-f]{32}\.oceanleo\.app\/embed$/;

export function isActiveRuntimeUrl(value: unknown): value is string {
  return typeof value === "string" && ACTIVE_RUNTIME_URL_RE.test(value);
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

/**
 * 一条工作流的三到四份文档。路径是**文档仓**（`/opt/cursor-workspaces/oceandino`）里的
 * 仓内相对路径，不是本站可 GET 的地址 —— 界面上只能照实摆出路径文本，做成链接必然 404。
 *
 * `scene` 只有分场景的品类才有（小红书封面 / LOGO / 名片 / 简历 这一层），没有就不给这一格。
 */
export interface WorkWorkflowDocs {
  /** 怎样才算能交付、能上架、能打开。一个品类一份。 */
  base: string;
  /** 这个场景本来长什么样、信息密度该多大。无场景的品类没有这一层。 */
  scene?: string;
  /** 这一种风格的主张与取舍。 */
  style: string;
  /** 怎么写一份具体产品的设计文档：模板与提问清单，不是任何具体产品的设计文档。 */
  productGuide: string;
}

/**
 * 「这一件是哪条产线做的」。字段名由派工合同 §3.2 钉死，站上不许改写、不许补全。
 *
 * **只有本波新产的成品有这一格。** 历史存量一件都不补 —— 带与不带的分开摆着，
 * 就是操作员用来判断「哪几条产线已经成形、哪些件还没有归属」的对照组，不是数据缺陷。
 */
export interface WorkWorkflow {
  /** `<artifact_type>[/<scene>]/<styleId>`，逐字沿用风格文档文件名。 */
  id: string;
  /** 中文名，列表卡片与详情页直接上屏。 */
  name: string;
  docs: WorkWorkflowDocs;
}

/** 工作流 id 里的场景段（三段式才有）。判族与显示都用它，别各自再切一遍字符串。 */
export function workflowSceneOf(workflow: Pick<WorkWorkflow, "id"> | undefined): string | null {
  const segments = workflow?.id.split("/") ?? [];
  return segments.length === 3 ? segments[1] : null;
}

/** 详情页要摆出来的文档路径，按人读顺序；缺的那一层不占位。 */
export function workflowDocRows(workflow: WorkWorkflow): [string, string][] {
  const rows: [string, string][] = [["基础架构", workflow.docs.base]];
  if (workflow.docs.scene) rows.push(["场景", workflow.docs.scene]);
  rows.push(["风格设计", workflow.docs.style]);
  rows.push(["产品文档指南", workflow.docs.productGuide]);
  return rows;
}

export interface WorkEntry {
  id: string;
  artifactType: ArtifactType;
  /** deck 的交付 representation；只有受控的 pptx/html，且必须与片段文件名一致。 */
  deliveryFamily?: DeckDeliveryFamily;
  title: string;
  /** 对应 `docs/design-guides/<artifact_type>/<styleId>.md` 那份版面指导。 */
  styleId: string;
  /** 这一件出自哪条工作流；本波之前的存量没有这一格。 */
  workflow?: WorkWorkflow;
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
