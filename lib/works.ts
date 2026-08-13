// 成品展厅的数据层 —— asset.oceanleo.com/works。
//
// 货源：`content/works/<artifact_type>.json`，每份由该类型的产线 owner 独占书写，
// 本模块只 glob 装载，**永不写入**。9 位 owner 并发写这些文件，任何时刻都可能读到
// 半成品，所以装载器的第一义务是：坏的那一条跳过并在构建期报出来，页面不许崩。
//
// 与产线位之间的接口是 `WorkEntry`（清单片段 schema，见工作日志 tasks/_COMMON.md §8）
// 和下面的 `VIEW_KINDS`（查看器表）。这两样定死之后产线位才能写片段。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

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

/** 一条被跳过的片段（或整份文件）的原因。构建期打印，详情页不显示。 */
export interface WorkProblem {
  file: string;
  /** 片段里的下标或 id，整份文件的问题时为 null。 */
  at: string | null;
  reason: string;
}

export interface WorksCatalog {
  works: WorkEntry[];
  problems: WorkProblem[];
  byType: { type: ArtifactType; label: string; works: WorkEntry[] }[];
}

/* ------------------------------------------------------------------ *
 * ④ 装载器：坏的跳过，页面不崩
 * ------------------------------------------------------------------ */

const WORKS_DIR = path.join(process.cwd(), "content", "works");
const PUBLIC_DIR = path.join(process.cwd(), "public");

/** 站内绝对路径 → public 下的真实文件绝对路径。`..`、越界、查询串一律判失败。 */
function resolvePublic(p: unknown): string | null {
  if (typeof p !== "string" || !p.startsWith("/") || p.includes("..") || p.includes("\0")) {
    return null;
  }
  let abs: string;
  try {
    abs = path.join(PUBLIC_DIR, decodeURIComponent(p.split(/[?#]/)[0]));
  } catch {
    return null;
  }
  return abs.startsWith(PUBLIC_DIR + path.sep) ? abs : null;
}

function publicFileExists(p: unknown): p is string {
  const abs = resolvePublic(p);
  if (!abs) return false;
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** 存在的站内文件才留下；一个都不剩就返回 undefined。 */
function keepExistingPaths(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const kept = v.filter(publicFileExists);
  return kept.length > 0 ? kept : undefined;
}

function parseAttribution(v: unknown): WorkAttribution[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: WorkAttribution[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    if (!nonEmptyString(a.text)) continue;
    out.push({
      text: a.text,
      licenseCode: nonEmptyString(a.licenseCode) ? a.licenseCode : "未标注",
      licenseUrl: nonEmptyString(a.licenseUrl) && a.licenseUrl.startsWith("https://") ? a.licenseUrl : "",
    });
  }
  return out.length > 0 ? out : null;
}

function parseView(v: unknown, problems: string[]): WorkView | null {
  if (!v || typeof v !== "object") {
    problems.push("view 缺失或不是对象");
    return null;
  }
  const raw = v as Record<string, unknown>;
  if (!isViewKind(raw.kind)) {
    problems.push(`view.kind=${JSON.stringify(raw.kind)} 不在 VIEW_KINDS 表里`);
    return null;
  }
  if (!nonEmptyString(raw.src)) {
    problems.push("view.src 缺失");
    return null;
  }
  if (!publicFileExists(raw.src)) {
    problems.push(`view.src 指的文件不存在：${raw.src}`);
    return null;
  }

  const view: WorkView = { kind: raw.kind, src: raw.src };

  const pages = keepExistingPaths(raw.pages);
  if (pages) view.pages = pages;
  const stills = keepExistingPaths(raw.stills);
  if (stills) view.stills = stills;
  const frames = keepExistingPaths(raw.frames);
  if (frames) view.frames = frames;
  if (publicFileExists(raw.poster)) view.poster = raw.poster;
  if (publicFileExists(raw.waveform)) view.waveform = raw.waveform;
  if (publicFileExists(raw.download)) view.download = raw.download;

  if (raw.assets && typeof raw.assets === "object" && !Array.isArray(raw.assets)) {
    const assets: Record<string, string> = {};
    for (const [k, val] of Object.entries(raw.assets as Record<string, unknown>)) {
      if (publicFileExists(val)) assets[k] = val;
    }
    if (Object.keys(assets).length > 0) view.assets = assets;
  }

  if (Array.isArray(raw.sheets)) {
    const sheets: WorkSheet[] = [];
    for (const s of raw.sheets) {
      if (!s || typeof s !== "object") continue;
      const sheet = s as Record<string, unknown>;
      if (!nonEmptyString(sheet.name)) continue;
      sheets.push({
        name: sheet.name,
        header: Array.isArray(sheet.header) ? sheet.header.map((h) => String(h)) : undefined,
        rows: Array.isArray(sheet.rows)
          ? sheet.rows
              .filter((r): r is unknown[] => Array.isArray(r))
              .map((r) => r.map((c) => (typeof c === "number" ? c : c == null ? null : String(c))))
          : undefined,
      });
    }
    if (sheets.length > 0) view.sheets = sheets;
  }

  if (typeof raw.aspect === "number" && Number.isFinite(raw.aspect) && raw.aspect > 0) {
    view.aspect = raw.aspect;
  }
  if (typeof raw.durationSec === "number" && Number.isFinite(raw.durationSec) && raw.durationSec > 0) {
    view.durationSec = raw.durationSec;
  }
  return view;
}

function parseEntry(raw: unknown, file: string, problems: string[]): WorkEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    problems.push("不是对象");
    return null;
  }
  const e = raw as Record<string, unknown>;
  if (!nonEmptyString(e.id) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(e.id)) {
    problems.push(`id 缺失或不合法：${JSON.stringify(e.id)}`);
    return null;
  }
  if (!isArtifactType(e.artifactType)) {
    problems.push(`artifactType=${JSON.stringify(e.artifactType)} 不在 14 类里`);
    return null;
  }
  if (!nonEmptyString(e.title)) {
    problems.push("title 缺失");
    return null;
  }
  if (!publicFileExists(e.cover)) {
    problems.push(`cover 指的文件不存在：${JSON.stringify(e.cover)}`);
    return null;
  }
  const attribution = parseAttribution(e.attribution);
  if (!attribution) {
    problems.push("attribution 缺失或为空（成品必须有署名）");
    return null;
  }
  const view = parseView(e.view, problems);
  if (!view) return null;

  return {
    id: e.id,
    artifactType: e.artifactType,
    title: e.title,
    styleId: nonEmptyString(e.styleId) ? e.styleId : "",
    summary: nonEmptyString(e.summary) ? e.summary : "",
    cover: e.cover as string,
    view,
    // 缺省按「可下载」处理会把插件那类东西泄出去，所以只认显式 true。
    downloadable: e.downloadable === true,
    attribution,
    readings:
      e.readings && typeof e.readings === "object" && !Array.isArray(e.readings)
        ? (e.readings as Record<string, unknown>)
        : undefined,
    sourceFile: file,
  };
}

function readCatalog(): WorksCatalog {
  const works: WorkEntry[] = [];
  const problems: WorkProblem[] = [];
  const seen = new Map<string, string>();

  let files: string[] = [];
  try {
    if (existsSync(WORKS_DIR)) {
      files = readdirSync(WORKS_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort();
    }
  } catch (err) {
    problems.push({ file: "content/works", at: null, reason: `目录读不了：${String(err)}` });
  }

  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path.join(WORKS_DIR, file), "utf8"));
    } catch (err) {
      // 9 位 owner 并发写，读到写了一半的 JSON 是常态，不是异常。
      problems.push({ file, at: null, reason: `JSON 解析失败（半成品？）：${String(err)}` });
      continue;
    }
    if (!Array.isArray(parsed)) {
      problems.push({ file, at: null, reason: "顶层不是数组" });
      continue;
    }
    parsed.forEach((raw, i) => {
      const why: string[] = [];
      const entry = parseEntry(raw, file, why);
      const at =
        raw && typeof raw === "object" && nonEmptyString((raw as Record<string, unknown>).id)
          ? String((raw as Record<string, unknown>).id)
          : `#${i}`;
      if (!entry) {
        problems.push({ file, at, reason: why.join("；") || "未通过校验" });
        return;
      }
      const dup = seen.get(entry.id);
      if (dup) {
        problems.push({ file, at, reason: `id 与 ${dup} 里的重复，后来者跳过` });
        return;
      }
      seen.set(entry.id, file);
      works.push(entry);
    });
  }

  const byType = ARTIFACT_TYPE_ORDER.map((type) => ({
    type,
    label: ARTIFACT_TYPE_LABELS[type],
    works: works.filter((w) => w.artifactType === type),
  })).filter((g) => g.works.length > 0);

  return { works, problems, byType };
}

let cached: WorksCatalog | null = null;

/**
 * 全部成品。构建期（以及 dev 的每次请求）读盘一次并缓存。
 * 坏片段不抛异常，只进 `problems` 并在构建日志里报出来。
 */
export function loadWorks(): WorksCatalog {
  if (!cached) {
    cached = readCatalog();
    for (const p of cached.problems) {
      console.warn(
        `[works] 跳过 ${p.file}${p.at ? ` 的 ${p.at}` : ""}：${p.reason}`,
      );
    }
  }
  return cached;
}

export function findWork(id: string): WorkEntry | undefined {
  return loadWorks().works.find((w) => w.id === id);
}

/** JSON 载体（design-document / chart / workflow）的正文，构建期读盘一次。 */
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

export function readWorkPayload(work: WorkEntry): unknown | null {
  if (!work.view.src.toLowerCase().endsWith(".json")) return null;
  const abs = resolvePublic(work.view.src);
  if (!abs) return null;
  try {
    if (statSync(abs).size > MAX_PAYLOAD_BYTES) {
      console.warn(`[works] ${work.id} 的 view.src 超过 ${MAX_PAYLOAD_BYTES} 字节，不在站内渲染`);
      return null;
    }
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    console.warn(`[works] ${work.id} 的 view.src 读不出来：${String(err)}`);
    return null;
  }
}

/** 下载入口只对 `downloadable: true` 开；关着的时候一律返回 null。 */
export function downloadHref(work: WorkEntry): string | null {
  if (!work.downloadable) return null;
  return work.view.download ?? work.view.src;
}
