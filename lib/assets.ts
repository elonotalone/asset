"use client";

// Asset library client — thin wrapper over the shared gateway's /v1/assets/*.
// Browsing is PUBLIC (no token needed), so unlike other sites' gateway clients
// these are unauthenticated GETs. The gateway holds every source key.
import { accessToken } from "@oceanleo/ui/lib/auth";

const GATEWAY =
  process.env.NEXT_PUBLIC_GATEWAY_URL || "https://api.oceanleo.com";

export type AssetType =
  | "image"
  | "vector"
  | "video"
  | "audio"
  | "music"
  | "3d"
  | "ppt";
export type LicenseFilter = "commercial" | "modify" | "any";

export interface AssetLicense {
  code: string;
  name: string;
  url: string;
  commercial_ok: boolean;
  modify_ok: boolean;
  attribution_required: boolean;
  attribution_text: string;
}

export interface Asset {
  id: string;
  source: string;
  type: AssetType;
  title: string;
  thumb_url: string;
  preview_url: string;
  full_url: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  author: string;
  source_url: string;
  license: AssetLicense;
  /** 后端质量排序分（来源等级 + 人气信号）；前端一般不直接展示。 */
  score?: number;
  /** 仅在「我的素材库」里出现：收藏时间。 */
  saved_at?: string;
}

export interface SearchResult {
  items: Asset[];
  page: number;
  has_more: boolean;
  sources_queried: string[];
}

export interface SourceInfo {
  source: string;
  types: AssetType[];
  enabled: boolean;
  needs_key: boolean;
}

async function getJson<T>(path: string): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${GATEWAY}${path}`, { cache: "no-store" });
  } catch {
    throw new Error("网络错误：无法连接到素材网关。");
  }
  let data: unknown = null;
  try {
    data = await resp.json();
  } catch {
    /* non-JSON */
  }
  if (!resp.ok) {
    const detail =
      (data as { detail?: string } | null)?.detail ||
      `请求失败（HTTP ${resp.status}）`;
    throw new Error(detail);
  }
  return data as T;
}

export function searchAssets(params: {
  q: string;
  type: AssetType;
  license?: LicenseFilter;
  source?: string;
  page?: number;
  pageSize?: number;
}): Promise<SearchResult> {
  const qs = new URLSearchParams({
    q: params.q || "",
    type: params.type,
    license: params.license || "commercial",
    page: String(params.page || 1),
    page_size: String(params.pageSize || 24),
  });
  if (params.source) qs.set("source", params.source);
  return getJson<SearchResult>(`/v1/assets/search?${qs.toString()}`);
}

export function listSources(): Promise<{ sources: SourceInfo[] }> {
  return getJson<{ sources: SourceInfo[] }>("/v1/assets/sources");
}

export interface DetailResult {
  id: string;
  source: string;
  files?: { format: string; url: string }[];
  raw?: Record<string, unknown>;
}

export function assetDetail(id: string): Promise<DetailResult> {
  return getJson<DetailResult>(`/v1/assets/detail?id=${encodeURIComponent(id)}`);
}

// For polyhaven the real file needs a server resolve → use the download route.
export function downloadHref(asset: Asset): string {
  if (asset.source === "polyhaven") {
    return `${GATEWAY}/v1/assets/download?id=${encodeURIComponent(asset.id)}`;
  }
  return asset.full_url;
}

export const TYPE_LABELS: Record<AssetType, string> = {
  image: "图片",
  vector: "矢量图",
  video: "视频",
  audio: "音效",
  music: "音乐",
  "3d": "3D 模型",
  ppt: "PPT 模板",
};

export const TYPE_ORDER: AssetType[] = [
  "image",
  "video",
  "music",
  "audio",
  "3d",
  "vector",
  "ppt",
];

// --- Personal asset library (collection) ----------------------------------
// All authed against the shared SSO bearer token. Unauthenticated callers get a
// clean "未登录" so the UI can prompt login instead of crashing.

async function authedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  if (!token) throw new Error("未登录");
  let resp: Response;
  try {
    resp = await fetch(`${GATEWAY}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new Error("网络错误：无法连接到素材网关。");
  }
  let data: unknown = null;
  try {
    data = await resp.json();
  } catch {
    /* non-JSON */
  }
  if (!resp.ok) {
    const detail =
      (data as { detail?: string } | null)?.detail || `请求失败（HTTP ${resp.status}）`;
    throw new Error(detail);
  }
  return data as T;
}

export function listCollection(limit = 200): Promise<{ items: Asset[] }> {
  return authedJson<{ items: Asset[] }>(`/v1/assets/collection?limit=${limit}`);
}

export function listCollectionIds(): Promise<{ ids: string[] }> {
  return authedJson<{ ids: string[] }>("/v1/assets/collection/ids");
}

export function saveToCollection(asset: Asset): Promise<{ ok: boolean; id: string }> {
  return authedJson<{ ok: boolean; id: string }>("/v1/assets/collection", {
    method: "POST",
    body: JSON.stringify(asset),
  });
}

export function removeFromCollection(id: string): Promise<{ ok: boolean; id: string }> {
  return authedJson<{ ok: boolean; id: string }>(
    `/v1/assets/collection?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
