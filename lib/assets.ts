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
  | "sticker"
  | "video"
  | "audio"
  | "music"
  | "3d"
  | "font"
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

interface LibraryResult {
  items: Asset[];
  page: number;
  page_size: number;
  total: number;
  source: string;
}

// Search our SELF-OWNED hoarded library (platform_assets, served from OSS) first
// — instant + curated. Fall back to the realtime upstream gateway only when the
// library has no hit, so asset.oceanleo.com surfaces our own material by default.
export async function searchAssets(params: {
  q: string;
  type: AssetType;
  license?: LicenseFilter;
  source?: string;
  page?: number;
  pageSize?: number;
}): Promise<SearchResult> {
  const page = params.page || 1;
  const pageSize = params.pageSize || 24;
  const license = params.license || "commercial";

  // 1) self-owned library — but only when no explicit upstream source is forced
  if (!params.source) {
    try {
      const libQs = new URLSearchParams({
        q: params.q || "",
        type: params.type,
        license,
        page: String(page),
        page_size: String(pageSize),
      });
      const lib = await getJson<LibraryResult>(
        `/v1/assets/library/search?${libQs.toString()}`,
      );
      if (lib.items && lib.items.length > 0) {
        return {
          items: lib.items,
          page: lib.page,
          has_more: lib.page * lib.page_size < (lib.total || 0),
          sources_queried: ["library"],
        };
      }
    } catch {
      // ignore and fall through to realtime gateway
    }
  }

  // 2) realtime upstream gateway (breadth fallback / forced source)
  const qs = new URLSearchParams({
    q: params.q || "",
    type: params.type,
    license,
    page: String(page),
    page_size: String(pageSize),
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

// For realtime-upstream polyhaven the real file needs a server resolve → use the
// download route. Our OWN hoarded library items (id `library:…`) already carry a
// direct OSS full_url (incl. re-hosted 3D gltf), so download them straight.
export function downloadHref(asset: Asset): string {
  if (asset.id.startsWith("library:")) {
    return asset.full_url;
  }
  if (asset.source === "polyhaven") {
    return `${GATEWAY}/v1/assets/download?id=${encodeURIComponent(asset.id)}`;
  }
  return asset.full_url;
}

export const TYPE_LABELS: Record<AssetType, string> = {
  image: "图片",
  vector: "矢量图",
  sticker: "贴纸",
  video: "视频",
  audio: "音效",
  music: "音乐",
  "3d": "3D 模型",
  font: "字体",
  ppt: "PPT 模板",
};

export const TYPE_ORDER: AssetType[] = [
  "image",
  "video",
  "sticker",
  "vector",
  "3d",
  "font",
  "music",
  "audio",
  "ppt",
];

// ---------------------------------------------------------------------------
// 设计模板专区（design-templates zone）
// ---------------------------------------------------------------------------
// 这是一个「先把筛选骨架立起来、暂无素材」的专区：左侧栏单独一个入口，主区渲染
// 「渠道 / 物料 / 行业」三栏筛选 + 空态（即将上线）。它不调用素材网关，所以切到
// 这里永远是瞬时的——也顺带不会触发实时上游搜索的慢路径。
//
// 取材自稿定式模板库的筛选维度，但**重新挑选并排序**（不照搬每一项命名）：高频、
// 通用、对国内创作者真正有意义的项排在前面，长尾项收口。每一项即便暂时没有对应图片
// 也保留占位，待后续素材补齐。

export interface FilterGroup {
  /** URL / 状态用的英文 key */
  key: string;
  /** 中文小标题（渠道 / 物料 / 行业） */
  label: string;
  /** 选项（首项恒为「全部」） */
  options: string[];
}

export const DESIGN_FILTER_GROUPS: FilterGroup[] = [
  {
    key: "channel",
    label: "渠道",
    options: [
      "全部",
      "小红书",
      "微信公众号",
      "短视频平台",
      "电商平台",
      "社群朋友圈",
      "线下印刷",
      "线下门店",
      "生活娱乐",
    ],
  },
  {
    key: "material",
    label: "物料",
    options: [
      "全部",
      "海报",
      "小红书封面",
      "小红书配图",
      "公众号首图",
      "公众号次图",
      "文章长图",
      "视频封面",
      "商品主图",
      "电商竖版海报",
      "电商横版海报",
      "详情页",
      "横版海报",
      "全屏海报",
      "方形海报",
      "长图海报",
      "LOGO",
      "头像",
      "二维码",
      "名片",
      "宣传单",
      "易拉宝",
      "展板",
      "折页",
      "画册",
      "明信片",
      "小卡",
      "直播背景",
      "直播封面",
      "店招",
      "店铺首页",
      "小程序封面",
      "专辑封面",
      "小说封面",
      "表情包",
      "壁纸",
      "桌牌",
      "简历",
    ],
  },
  {
    key: "industry",
    label: "行业",
    options: [
      "全部",
      "通用",
      "餐饮美食",
      "教育培训",
      "电商零售",
      "美容美妆",
      "服饰箱包",
      "母婴亲子",
      "生活服务",
      "食品生鲜",
      "家居百货",
      "数码家电",
      "IT互联网",
      "医疗保健",
      "金融保险",
      "房地产",
      "旅游出行",
      "文体娱乐",
      "电竞游戏",
      "企业行政",
      "政务媒体",
    ],
  },
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
