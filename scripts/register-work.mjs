#!/usr/bin/env node
// 把 D/F 两链洗干净的成品登记进 asset 仓精选成品面（content/works/<type>.json）。
//
// 用法（父代理上架时）：
//   node scripts/register-work.mjs \
//     --meta /path/to/meta.json \
//     --file /path/to/bytes.png \
//     [--cover /path/to/cover.png] \
//     [--type composite_image] \
//     [--downloadable]
//
// 入参形状（meta.json，D 的 ol-* 与 F 的 OLP-* 都产这一份）：
//   {
//     "id": "ol-tips-001",                 // 必填；同 id 覆盖不追加
//     "artifactType": "composite_image",   // 可被 --type 覆盖；须是 14 类之一
//     "title": "…",                        // 或 display_name
//     "styleId": "tips",
//     "summary": "…",
//     "all_slots_replaced": true,          // 必须是布尔 true
//     "provenance": { "kind": "geometry-only", "source_pack": "…" },
//     "attribution": [{ "text": "…", "licenseCode": "CC0-1.0", "licenseUrl": "https://…" }],
//     "view": { "kind": "image" },         // 可选；缺省按 --file 扩展名推断
//     "workflow": { "id": "composite_image/…", "name": "…", "docs": {…} },
//     "readings": { … },                   // 原样抄进条目；再补 byteSize/sha256
//     "license": { "status": "…", "code": "…", "url": "…" }
//   }
//
// 三条拒绝（任一即失败，稿定来源永远进不了这个仓）：
//   1. all_slots_replaced !== true
//   2. provenance.kind !== "geometry-only"
//   3. 整份 meta 任意深度 license.status === "internal-reference-only"
//
// 幂等：同 id 覆盖 JSON 条目与字节，不重复追加。
// 本脚本只写本地仓。不 git commit、不 git push。

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACT_TYPES = new Set([
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
]);

const VIEW_KINDS = new Set([
  "design-document",
  "deck",
  "website",
  "game",
  "document",
  "pdf",
  "grid",
  "chart",
  "vector",
  "model-3d",
  "audio",
  "workflow",
  "image",
  "video",
]);

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "tif", "tiff"]);

const EXT_TO_VIEW_KIND = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  svg: "vector",
  json: "design-document",
  docx: "document",
  doc: "document",
  pdf: "pdf",
  pptx: "deck",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  mp4: "video",
  webm: "video",
  glb: "model-3d",
  gltf: "model-3d",
};

export class RegisterRejected extends Error {
  /**
   * @param {"all_slots_replaced" | "provenance.kind" | "license.status" | "shape"} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "RegisterRejected";
    this.code = code;
  }
}

/**
 * 任意深度：对象键路径以 `.license` 结尾，且其 `status` 为
 * `internal-reference-only`。稿定来源的包就是这种写法。
 * @param {unknown} node
 * @param {string} pathStr
 * @param {string[]} hits
 */
function collectInternalReferenceOnly(node, pathStr, hits) {
  if (Array.isArray(node)) {
    node.forEach((item, i) =>
      collectInternalReferenceOnly(item, `${pathStr}[${i}]`, hits),
    );
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    const next = pathStr ? `${pathStr}.${key}` : key;
    if (
      key === "status" &&
      value === "internal-reference-only" &&
      /(^|\.)license$/.test(pathStr)
    ) {
      hits.push(next);
    }
    collectInternalReferenceOnly(value, next, hits);
  }
}

/**
 * 上架闸。三条红线写死在这里，测试按 code 断言。
 * @param {unknown} meta
 */
export function assertRegisterable(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new RegisterRejected("shape", "meta.json 必须是一个对象");
  }
  const row = /** @type {Record<string, unknown>} */ (meta);
  if (row.all_slots_replaced !== true) {
    throw new RegisterRejected(
      "all_slots_replaced",
      "all_slots_replaced!==true — 有槽没换干净的件不能进这个仓",
    );
  }
  const provenance = row.provenance;
  const kind =
    provenance && typeof provenance === "object" && !Array.isArray(provenance)
      ? /** @type {Record<string, unknown>} */ (provenance).kind
      : undefined;
  if (kind !== "geometry-only") {
    throw new RegisterRejected(
      "provenance.kind",
      'provenance.kind!=="geometry-only" — 只收几何继承、像素已换干净的件',
    );
  }
  const hits = [];
  collectInternalReferenceOnly(meta, "", hits);
  if (hits.length > 0) {
    throw new RegisterRejected(
      "license.status",
      `license.status===internal-reference-only（${hits.join(", ")}）— 稿定来源永远进不了这个仓`,
    );
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function extensionOf(filePath) {
  const ext = path.extname(filePath || "").replace(/^\./, "").toLowerCase();
  if (ext === "jpeg") return "jpg";
  return ext;
}

function sha256Of(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith("--")) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function defaultRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readJsonArray(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  if (!Array.isArray(raw)) {
    throw new RegisterRejected("shape", `${filePath} 必须是 JSON 数组`);
  }
  return raw;
}

function attributionFrom(meta) {
  if (Array.isArray(meta.attribution) && meta.attribution.length > 0) {
    return meta.attribution;
  }
  throw new RegisterRejected(
    "shape",
    "attribution 缺失或为空（成品必须有署名，CLI 不代写许可）",
  );
}

/**
 * @param {{
 *   meta: Record<string, unknown>,
 *   file: string,
 *   cover?: string,
 *   type?: string,
 *   repoRoot?: string,
 *   downloadable?: boolean,
 * }} opts
 */
export async function registerWork(opts) {
  assertRegisterable(opts.meta);
  const meta = opts.meta;
  const repoRoot = opts.repoRoot || defaultRepoRoot();
  const id = nonEmptyString(meta.id);
  if (!id || !ID_RE.test(id)) {
    throw new RegisterRejected("shape", `id 缺失或不合法：${JSON.stringify(meta.id)}`);
  }
  const artifactType =
    nonEmptyString(opts.type) ||
    nonEmptyString(meta.artifactType) ||
    "composite_image";
  if (!ARTIFACT_TYPES.has(artifactType)) {
    throw new RegisterRejected("shape", `artifactType=${artifactType} 不在 14 类里`);
  }
  const title = nonEmptyString(meta.title) || nonEmptyString(meta.display_name);
  if (!title) {
    throw new RegisterRejected("shape", "title / display_name 必须有一个");
  }
  const srcFile = path.resolve(opts.file);
  if (!existsSync(srcFile) || !statSync(srcFile).isFile()) {
    throw new RegisterRejected("shape", `--file 不是可读文件：${opts.file}`);
  }
  const ext = extensionOf(srcFile);
  if (!ext) {
    throw new RegisterRejected("shape", `--file 没有扩展名，无法落到 public/works/${artifactType}/`);
  }

  const viewHint =
    meta.view && typeof meta.view === "object" && !Array.isArray(meta.view)
      ? /** @type {Record<string, unknown>} */ (meta.view)
      : {};
  const viewKind =
    nonEmptyString(viewHint.kind) || EXT_TO_VIEW_KIND[ext] || "image";
  if (!VIEW_KINDS.has(viewKind)) {
    throw new RegisterRejected("shape", `view.kind=${viewKind} 不在 VIEW_KINDS 表里`);
  }

  const publicDir = path.join(repoRoot, "public", "works", artifactType);
  const contentDir = path.join(repoRoot, "content", "works");
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(contentDir, { recursive: true });

  const destName = `${id}.${ext}`;
  const destAbs = path.join(publicDir, destName);
  copyFileSync(srcFile, destAbs);
  const bytes = readFileSync(destAbs);

  const coverAbs = path.join(publicDir, `${id}.cover.webp`);
  const coverSrc = opts.cover ? path.resolve(opts.cover) : srcFile;
  if (IMAGE_EXT.has(extensionOf(coverSrc))) {
    const sharp = (await import("sharp")).default;
    await sharp(coverSrc)
      .resize(800, 600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(coverAbs);
  } else if (opts.cover && existsSync(coverSrc)) {
    copyFileSync(coverSrc, coverAbs);
  } else {
    throw new RegisterRejected(
      "shape",
      "封面需要一张图：给 --cover，或让 --file 本身是 png/jpg/webp",
    );
  }

  const publicSrc = `/works/${artifactType}/${destName}`;
  const publicCover = `/works/${artifactType}/${id}.cover.webp`;
  const downloadable = opts.downloadable !== false && meta.downloadable !== false;

  const view = {
    kind: viewKind,
    src: publicSrc,
    ...(downloadable ? { download: nonEmptyString(viewHint.download) || publicSrc } : {}),
  };

  const readingsIn =
    meta.readings && typeof meta.readings === "object" && !Array.isArray(meta.readings)
      ? /** @type {Record<string, unknown>} */ (meta.readings)
      : {};
  const readings = {
    ...readingsIn,
    byteSize: bytes.length,
    sha256: sha256Of(bytes),
  };

  const entry = {
    id,
    artifactType,
    title,
    styleId: nonEmptyString(meta.styleId) || id,
    summary: nonEmptyString(meta.summary),
    cover: publicCover,
    view,
    downloadable,
    attribution: attributionFrom(meta),
    readings,
  };
  if (meta.workflow && typeof meta.workflow === "object") {
    entry.workflow = meta.workflow;
  }

  const catalogPath = path.join(contentDir, `${artifactType}.json`);
  const catalog = readJsonArray(catalogPath);
  const idx = catalog.findIndex((row) => row && row.id === id);
  if (idx >= 0) catalog[idx] = entry;
  else catalog.push(entry);
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  return {
    id,
    artifactType,
    catalogPath,
    src: publicSrc,
    cover: publicCover,
    overwritten: idx >= 0,
  };
}

async function main(argv) {
  const args = parseArgs(argv);
  if (!args.meta || !args.file || typeof args.meta !== "string" || typeof args.file !== "string") {
    process.stderr.write(
      "usage: node scripts/register-work.mjs --meta <meta.json> --file <bytes> [--cover <img>] [--type composite_image]\n",
    );
    process.exit(2);
  }
  const meta = JSON.parse(readFileSync(path.resolve(args.meta), "utf8"));
  const result = await registerWork({
    meta,
    file: args.file,
    cover: typeof args.cover === "string" ? args.cover : undefined,
    type: typeof args.type === "string" ? args.type : undefined,
    downloadable: args.downloadable !== "false",
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    const code = err && err.code ? err.code : "error";
    process.stderr.write(`[register-work] ${code}: ${err.message}\n`);
    process.exit(err instanceof RegisterRejected ? 1 : 2);
  });
}
