// 成品展厅的**读盘层** —— asset.oceanleo.com/works 的货源装载器。
//
// 货源：`content/works/<artifact_type>.json`，每份由该类型的产线 owner 独占书写，
// 本模块只 glob 装载，**永不写入**。9 位 owner 并发写这些文件，任何时刻都可能读到
// 半成品，所以装载器的第一义务是：坏的那一条跳过并在构建期报出来，页面不许崩。
//
// 表与 schema 在 components/WorksKinds.tsx（纯数据，客户端也能 import）。
// 这里一并再导出，产线位与页面从哪一侧引入都一样。

import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  ARTIFACT_TYPE_LABELS,
  ARTIFACT_TYPE_ORDER,
  deckDeliveryFamilyFrom,
  isActiveRuntimeUrl,
  isArtifactType,
  isViewKind,
  type ArtifactType,
  type WorkAttribution,
  type WorkEntry,
  type WorkProduction,
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

export interface WorksTypeGroup {
  type: ArtifactType;
  label: string;
  works: WorkEntry[];
  /** 这一类已转外接时的口径；仍在自产的类型没有这一格。 */
  production?: WorkProduction;
}

export interface WorksCatalog {
  works: WorkEntry[];
  problems: WorkProblem[];
  byType: WorksTypeGroup[];
}

/* ------------------------------------------------------------------ *
 * ④ 装载器：坏的跳过，页面不崩
 * ------------------------------------------------------------------ */

const WORKS_DIR = path.join(process.cwd(), "content", "works");
const PUBLIC_DIR = path.join(process.cwd(), "public");
const ACTIVE_RUNTIME_INPUTS = [
  {
    manifest: path.join(
      process.cwd(),
      "content",
      "active-runtime",
      "manifest.game-website.json",
    ),
    plan: path.join(process.cwd(), "active-runtime-plan.json"),
  },
  {
    manifest: path.join(
      process.cwd(),
      "content",
      "active-runtime",
      "manifest.deck-html.json",
    ),
    plan: path.join(process.cwd(), "active-runtime-plan.deck-html.json"),
  },
] as const;
const MAX_RUNTIME_JSON_BYTES = 1024 * 1024;
const ACTIVE_RUNTIME_SCHEMA = "oceanleo.active-runtime-manifest.v1";
const ACTIVE_RUNTIME_PLAN_SCHEMA = "oceanleo.active-runtime-plan.v1";
const ACTIVE_RUNTIME_ID = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const ACTIVE_RUNTIME_HOST = /^s-[0-9a-f]{32}\.oceanleo\.app$/;
const SHA256 = /^[0-9a-f]{64}$/;

type ActiveRuntimeKind = "plugin" | "game" | "website";

interface ActiveRuntimeManifestItem {
  id: string;
  kind: ActiveRuntimeKind;
  source: string;
  entry: "index.html";
}

interface ActiveRuntimePlanItem {
  item: ActiveRuntimeManifestItem;
  host: string;
  entryUrl: string;
  closureSha256: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function normalizeRuntimeItem(value: unknown): ActiveRuntimeManifestItem | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "kind", "source", "entry"])) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    !ACTIVE_RUNTIME_ID.test(value.id) ||
    !["plugin", "game", "website"].includes(String(value.kind)) ||
    value.source !== `content/active-runtime/${value.kind}/${value.id}` ||
    value.entry !== "index.html"
  ) {
    return null;
  }
  return {
    id: value.id,
    kind: value.kind as ActiveRuntimeKind,
    source: value.source,
    entry: "index.html",
  };
}

function normalizeOwnedRuntimeManifest(value: unknown): ActiveRuntimeManifestItem[] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schema", "items"]) ||
    value.schema !== ACTIVE_RUNTIME_SCHEMA ||
    !Array.isArray(value.items)
  ) {
    return [];
  }
  const items = value.items.map(normalizeRuntimeItem);
  if (
    items.some((item) => item === null) ||
    items.some((item) => item?.kind !== "game" && item?.kind !== "website")
  ) {
    return [];
  }
  const normalized = items as ActiveRuntimeManifestItem[];
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) return [];
  return normalized;
}

function normalizePlanFile(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["path", "sha256", "bytes"]) ||
    typeof value.path !== "string" ||
    value.path.length === 0 ||
    value.path.startsWith("/") ||
    value.path.includes("\\") ||
    value.path.split("/").includes("..") ||
    typeof value.sha256 !== "string" ||
    !SHA256.test(value.sha256) ||
    !Number.isSafeInteger(value.bytes) ||
    (value.bytes as number) < 0
  ) {
    return false;
  }
  return true;
}

function normalizeRuntimePlanItem(value: unknown): ActiveRuntimePlanItem | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "item",
      "host",
      "entryUrl",
      "closureSha256",
      "fileCount",
      "totalBytes",
      "files",
    ])
  ) {
    return null;
  }
  const item = normalizeRuntimeItem(value.item);
  if (
    !item ||
    typeof value.host !== "string" ||
    !ACTIVE_RUNTIME_HOST.test(value.host) ||
    !isActiveRuntimeUrl(value.entryUrl) ||
    value.entryUrl !== `https://${value.host}/embed` ||
    typeof value.closureSha256 !== "string" ||
    !SHA256.test(value.closureSha256) ||
    !Number.isSafeInteger(value.fileCount) ||
    (value.fileCount as number) < 1 ||
    !Number.isSafeInteger(value.totalBytes) ||
    (value.totalBytes as number) < 1 ||
    !Array.isArray(value.files) ||
    value.files.length !== value.fileCount ||
    !value.files.every(normalizePlanFile) ||
    value.files.reduce(
      (sum, file) => sum + ((file as Record<string, number>).bytes ?? 0),
      0,
    ) !== value.totalBytes
  ) {
    return null;
  }
  return {
    item,
    host: value.host,
    entryUrl: value.entryUrl,
    closureSha256: value.closureSha256,
  };
}

function sameRuntimeItem(left: ActiveRuntimeManifestItem, right: ActiveRuntimeManifestItem): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.source === right.source &&
    left.entry === right.entry
  );
}

/**
 * F9 manifest fragment 决定哪些主动成品有运行闭包，plan 侧车决定能不能打开。
 * 任一 item 缺失、重复、形状不闭合或 URL 歪掉时只关闭该 item，不猜 host、不回退本站。
 */
export function activeRuntimeUrlsFrom(
  manifestValue: unknown,
  planValue: unknown,
): Map<string, string> {
  const urls = new Map<string, string>();
  const manifest = normalizeOwnedRuntimeManifest(manifestValue);
  if (
    manifest.length === 0 ||
    !isRecord(planValue) ||
    !hasExactKeys(planValue, [
      "schema",
      "manifest",
      "manifestSha256",
      "itemCount",
      "totalBytes",
      "items",
    ]) ||
    planValue.schema !== ACTIVE_RUNTIME_PLAN_SCHEMA ||
    typeof planValue.manifest !== "string" ||
    planValue.manifest.length === 0 ||
    typeof planValue.manifestSha256 !== "string" ||
    !SHA256.test(planValue.manifestSha256) ||
    !Number.isSafeInteger(planValue.itemCount) ||
    !Number.isSafeInteger(planValue.totalBytes) ||
    (planValue.totalBytes as number) < 0 ||
    !Array.isArray(planValue.items) ||
    planValue.itemCount !== planValue.items.length ||
    planValue.items.reduce(
      (sum, item) =>
        sum +
        (isRecord(item) && Number.isSafeInteger(item.totalBytes)
          ? (item.totalBytes as number)
          : 0),
      0,
    ) !== planValue.totalBytes
  ) {
    return urls;
  }

  for (const manifestItem of manifest) {
    const matches = planValue.items
      .map(normalizeRuntimePlanItem)
      .filter(
        (candidate): candidate is ActiveRuntimePlanItem =>
          candidate !== null && sameRuntimeItem(candidate.item, manifestItem),
      );
    if (matches.length === 1) urls.set(manifestItem.id, matches[0].entryUrl);
  }
  return urls;
}

/** 只把 F9 URL 交给与清单家族相符的主动成品；同 id 的其他 representation 不沾边。 */
export function runtimeUrlForWork(
  work: Pick<WorkEntry, "id" | "artifactType" | "deliveryFamily" | "sourceFile" | "view">,
  urls: ReadonlyMap<string, string>,
): string | undefined {
  const runtime = urls.get(work.id);
  if (!isActiveRuntimeUrl(runtime)) return undefined;
  if (work.artifactType === "game") return work.view.kind === "game" ? runtime : undefined;
  if (work.artifactType === "website") {
    return work.view.kind === "website" ? runtime : undefined;
  }
  if (work.artifactType === "deck") {
    return work.view.kind === "deck" &&
      deckDeliveryFamilyFrom(work.deliveryFamily, work.sourceFile) === "html"
      ? runtime
      : undefined;
  }
  return undefined;
}

function readBoundedJson(absolutePath: string): unknown {
  try {
    const stat = lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RUNTIME_JSON_BYTES) return null;
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return null;
  }
}

function loadActiveRuntimeUrls(): Map<string, string> {
  const merged = new Map<string, string>();
  const collisions = new Set<string>();
  for (const input of ACTIVE_RUNTIME_INPUTS) {
    const urls = activeRuntimeUrlsFrom(
      readBoundedJson(input.manifest),
      readBoundedJson(input.plan),
    );
    for (const [id, url] of urls) {
      if (merged.has(id)) {
        merged.delete(id);
        collisions.add(id);
      } else if (!collisions.has(id)) {
        merged.set(id, url);
      }
    }
  }
  return merged;
}

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
  if (Object.prototype.hasOwnProperty.call(raw, "runtime")) {
    problems.push("view.runtime 不准写进 content 清单，只能由 F9 plan 侧车注入");
    return null;
  }

  const view: WorkView = { kind: raw.kind, src: raw.src };
  if (Object.prototype.hasOwnProperty.call(raw, "source")) {
    if (!publicFileExists(raw.source)) {
      problems.push(`view.source 指的文件不存在：${String(raw.source)}`);
      return null;
    }
    view.source = raw.source;
  }

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

/**
 * 「本类已转外接」的状态格（`signals/X1-signals.md` S1 定的字段名）。
 *
 * fail-closed：只有 `status === "external-api"` 且 `notice` 有内容才算数，
 * 其余取值当作没有这一格 —— 站上宁可少说一句，也不许把没核实的口径摆给用户。
 * 这一格**只影响文案**，不影响 `downloadable`：成品还在，还能下载。
 */
function parseProduction(v: unknown): WorkProduction | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const p = v as Record<string, unknown>;
  if (p.status !== "external-api") return undefined;
  if (!nonEmptyString(p.notice)) return undefined;
  return {
    status: "external-api",
    retiredOn: nonEmptyString(p.retiredOn) ? p.retiredOn : "",
    agentScope: p.agentScope === "design-doc" ? "design-doc" : "none",
    notice: p.notice,
  };
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
  const deliveryFamily =
    e.artifactType === "deck"
      ? deckDeliveryFamilyFrom(e.deliveryFamily, file)
      : null;
  if (e.artifactType === "deck" && !deliveryFamily) {
    problems.push(
      `deck deliveryFamily=${JSON.stringify(e.deliveryFamily)} 与清单 ${file} 不一致`,
    );
    return null;
  }
  if (
    e.artifactType !== "deck" &&
    Object.prototype.hasOwnProperty.call(e, "deliveryFamily")
  ) {
    problems.push(`deliveryFamily 只允许用于 deck，收到 ${e.artifactType}`);
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
  if (e.artifactType === "game") {
    const expected = `/works/game/${e.id}.game.json`;
    if (view.kind !== "game" || view.src !== expected) {
      problems.push(`game view 必须是 kind=game 且 src=${expected}`);
      return null;
    }
  }
  if (e.artifactType === "website") {
    const expected = `/works/website/${e.id}/site.json`;
    if (view.kind !== "website" || view.src !== expected || view.source !== expected) {
      problems.push(`website view 必须是 kind=website 且 src/source=${expected}`);
      return null;
    }
  }
  if (e.artifactType === "deck" && deliveryFamily === "html") {
    if (
      view.kind !== "deck" ||
      !view.source ||
      view.src !== view.source ||
      !view.pages?.length
    ) {
      problems.push(
        "HTML deck 必须是 kind=deck，src/source 指向同一份结构稿，并带逐页静态预览",
      );
      return null;
    }
  }

  return {
    id: e.id,
    artifactType: e.artifactType,
    ...(deliveryFamily ? { deliveryFamily } : {}),
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
    production: parseProduction(e.production),
    sourceFile: file,
  };
}

function readCatalog(): WorksCatalog {
  const works: WorkEntry[] = [];
  const problems: WorkProblem[] = [];
  const seen = new Map<string, string>();
  const runtimeUrls = loadActiveRuntimeUrls();

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
      const runtime = runtimeUrlForWork(entry, runtimeUrls);
      if (runtime) entry.view.runtime = runtime;
      works.push(entry);
    });
  }

  const byType: WorksTypeGroup[] = ARTIFACT_TYPE_ORDER.map((type) => {
    const inType = works.filter((w) => w.artifactType === type);
    return {
      type,
      label: ARTIFACT_TYPE_LABELS[type],
      works: inType,
      // 「本类已转外接」是**类型级**的事实，写在每条上只是因为片段文件里没有类型级的头。
      // 同一类型里每条的口径逐字相同（X1 的交接契约），所以取第一条给得出这一格的。
      production: inType.find((w) => w.production)?.production,
    };
  }).filter((g) => g.works.length > 0);

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

