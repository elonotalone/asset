// 成品展厅的**读盘层** —— asset.oceanleo.com/works 的货源装载器。
//
// 货源：`content/works/<artifact_type>.json`，每份由该类型的产线 owner 独占书写，
// 本模块只 glob 装载，**永不写入**。9 位 owner 并发写这些文件，任何时刻都可能读到
// 半成品，所以装载器的第一义务是：坏的那一条跳过并在构建期报出来，页面不许崩。
//
// 表与 schema 在 components/WorksKinds.tsx（纯数据，客户端也能 import）。
// 这里一并再导出，产线位与页面从哪一侧引入都一样。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  ARTIFACT_TYPE_LABELS,
  ARTIFACT_TYPE_ORDER,
  isArtifactType,
  isViewKind,
  type ArtifactType,
  type WorkAttribution,
  type WorkEntry,
  type WorkSheet,
  type WorkView,
} from "@/components/WorksKinds";

export * from "@/components/WorksKinds";

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
    return stripRunnableSource(JSON.parse(readFileSync(abs, "utf8")));
  } catch (err) {
    console.warn(`[works] ${work.id} 的 view.src 读不出来：${String(err)}`);
    return null;
  }
}

/**
 * 可运行源码（`oceanleo.game-bundle.v1` 的 `source`）在服务端就摘掉，不进页面。
 *
 * 站内**永远不运行未解包的游戏字节**：那要么走 `srcdoc`（继承本站 origin，
 * 域隔离作废，`GameRoute.tsx:101-102` 明令禁止），要么把源码写进 DOM。
 * 两条都不走，那这段字节就没有任何理由出现在客户端负载里。
 */
function stripRunnableSource(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const o = payload as Record<string, unknown>;
  if (typeof o.source !== "string") return payload;
  const { source, ...rest } = o;
  return { ...rest, sourceOmitted: true, sourceChars: source.length };
}

