import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  PLUGIN_ITEMS,
  isPluginRuntimeUrl,
  type PluginEntry,
} from "@/lib/plugin-gallery";

const MANIFEST_SCHEMA = "oceanleo.active-runtime-manifest.v1";
const PLAN_SCHEMA = "oceanleo.active-runtime-plan.v1";
const MANIFEST_PATH = "content/active-runtime/manifest.plugin.json";
const PLAN_SIDECAR_PATH = "active-runtime-plan.json";
const MAX_JSON_BYTES = 1024 * 1024;
const RUNTIME_ID = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const HOST = /^s-[0-9a-f]{32}\.oceanleo\.app$/;
const SHA256 = /^[0-9a-f]{64}$/;

interface RuntimeManifestItem {
  id: string;
  kind: "plugin";
  source: string;
  entry: "index.html";
}

interface RuntimePlanItem {
  item: RuntimeManifestItem;
  host: string;
  entryUrl: string;
  closureSha256: string;
}

interface RuntimePlanFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface PluginRuntimeDescriptor {
  pluginId: string;
  runtimeId: string;
  previewPath: string;
  runtimeUrl: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function normalizeManifestItem(value: unknown): RuntimeManifestItem | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "kind", "source", "entry"])) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    !RUNTIME_ID.test(value.id) ||
    value.kind !== "plugin" ||
    value.source !== `content/active-runtime/plugin/${value.id}` ||
    value.entry !== "index.html"
  ) {
    return null;
  }
  return {
    id: value.id,
    kind: "plugin",
    source: value.source,
    entry: "index.html",
  };
}

function normalizeManifest(value: unknown): RuntimeManifestItem[] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schema", "items"]) ||
    value.schema !== MANIFEST_SCHEMA ||
    !Array.isArray(value.items)
  ) {
    return [];
  }
  const items = value.items.map(normalizeManifestItem);
  if (items.some((item) => item === null)) return [];
  const normalized = items as RuntimeManifestItem[];
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) return [];
  return normalized;
}

function sameManifestItem(left: RuntimeManifestItem, right: RuntimeManifestItem): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.source === right.source &&
    left.entry === right.entry
  );
}

function normalizePlanFile(value: unknown): RuntimePlanFile | null {
  if (!isRecord(value) || !hasExactKeys(value, ["path", "sha256", "bytes"])) {
    return null;
  }
  const segments = typeof value.path === "string" ? value.path.split("/") : [];
  if (
    typeof value.path !== "string" ||
    value.path.length === 0 ||
    value.path.startsWith("/") ||
    value.path.includes("\\") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
    typeof value.sha256 !== "string" ||
    !SHA256.test(value.sha256) ||
    !Number.isSafeInteger(value.bytes) ||
    (value.bytes as number) < 0
  ) {
    return null;
  }
  return {
    path: value.path,
    sha256: value.sha256,
    bytes: value.bytes as number,
  };
}

function normalizePlanItem(value: unknown): RuntimePlanItem | null {
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
  const item = normalizeManifestItem(value.item);
  const files = Array.isArray(value.files) ? value.files.map(normalizePlanFile) : [];
  const normalizedFiles = files.filter((file): file is RuntimePlanFile => file !== null);
  if (
    !item ||
    typeof value.host !== "string" ||
    !HOST.test(value.host) ||
    !isPluginRuntimeUrl(value.entryUrl) ||
    value.entryUrl !== `https://${value.host}/embed` ||
    typeof value.closureSha256 !== "string" ||
    !SHA256.test(value.closureSha256) ||
    !Number.isSafeInteger(value.fileCount) ||
    (value.fileCount as number) < 1 ||
    !Number.isSafeInteger(value.totalBytes) ||
    (value.totalBytes as number) < 1 ||
    !Array.isArray(value.files) ||
    normalizedFiles.length !== value.files.length ||
    value.files.length !== value.fileCount ||
    new Set(normalizedFiles.map((file) => file.path)).size !== normalizedFiles.length ||
    normalizedFiles.reduce((total, file) => total + file.bytes, 0) !== value.totalBytes
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

function planUrls(value: unknown, manifest: RuntimeManifestItem[]): Map<string, string> {
  const urls = new Map<string, string>();
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "manifest",
      "manifestSha256",
      "itemCount",
      "totalBytes",
      "items",
    ]) ||
    value.schema !== PLAN_SCHEMA ||
    typeof value.manifest !== "string" ||
    typeof value.manifestSha256 !== "string" ||
    !SHA256.test(value.manifestSha256) ||
    !Number.isSafeInteger(value.itemCount) ||
    !Number.isSafeInteger(value.totalBytes) ||
    !Array.isArray(value.items) ||
    value.itemCount !== value.items.length
  ) {
    return urls;
  }

  for (const manifestItem of manifest) {
    const matches = value.items
      .map(normalizePlanItem)
      .filter(
        (candidate): candidate is RuntimePlanItem =>
          candidate !== null && sameManifestItem(candidate.item, manifestItem),
      );
    if (matches.length === 1) urls.set(manifestItem.id, matches[0].entryUrl);
  }
  return urls;
}

function pluginForRuntime(runtimeId: string): PluginEntry | null {
  const matches = PLUGIN_ITEMS.filter((item) => {
    if (item.kind !== "standalone") return false;
    if (runtimeId === item.id) return true;
    const suffix = runtimeId.slice(item.id.length + 1);
    return runtimeId.startsWith(`${item.id}-`) && /^\d+$/.test(suffix);
  });
  return matches.length === 1 ? matches[0] : null;
}

/**
 * UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
 *
 * Manifest 决定“哪三件有实物”，F9 plan 侧车决定“能不能打开”。侧车缺失、schema
 * 不符、item 对不上或 URL 不是精确 namespace-C `/embed` 时，只保留 cover，URL 为 null。
 */
export function pluginRuntimeDescriptorsFrom(
  manifestValue: unknown,
  planValue: unknown,
): PluginRuntimeDescriptor[] {
  const manifest = normalizeManifest(manifestValue);
  const urls = planUrls(planValue, manifest);
  const descriptors: PluginRuntimeDescriptor[] = [];
  for (const item of manifest) {
    const plugin = pluginForRuntime(item.id);
    if (!plugin) continue;
    descriptors.push({
      pluginId: plugin.id,
      runtimeId: item.id,
      previewPath: `/previews/tools/${item.id}.cover.webp`,
      runtimeUrl: urls.get(item.id) ?? null,
    });
  }
  return descriptors;
}

function readJson(relativePath: string): unknown {
  const absolutePath = path.join(process.cwd(), relativePath);
  try {
    const stat = lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JSON_BYTES) return null;
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return null;
  }
}

export function pluginRuntimeDescriptors(): PluginRuntimeDescriptor[] {
  return pluginRuntimeDescriptorsFrom(
    readJson(MANIFEST_PATH),
    readJson(PLAN_SIDECAR_PATH),
  );
}

export function runtimeForPlugin(pluginId: string): PluginRuntimeDescriptor | null {
  return (
    pluginRuntimeDescriptors().find((descriptor) => descriptor.pluginId === pluginId) ?? null
  );
}

export function runtimePluginIds(): string[] {
  return pluginRuntimeDescriptors()
    .filter((descriptor) => descriptor.runtimeUrl !== null)
    .map((descriptor) => descriptor.pluginId);
}
