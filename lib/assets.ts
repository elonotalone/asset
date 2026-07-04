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
  | "ppt"
  | "chart";
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
  /** 库内素材的机器标签（如 ppt 的 "pages:7"）；上游实时素材可能为空。 */
  tags?: string[];
  /** 后端质量排序分（来源等级 + 人气信号）；前端一般不直接展示。 */
  score?: number;
  /** 仅在「我的素材库」里出现：收藏时间。 */
  saved_at?: string;
  /** 「成套素材」分组键（同一套风格一致）；非成套素材为空。 */
  series_id?: string;
  /** 成套素材的中文套名（如「国风文化成套」）。 */
  series_name?: string;
}

// 「成套素材」——一套风格统一、可整套浏览的开源素材（来自 svgrepo 同一 data_pack，
// 每套均已人工逐张过目）。列表用于「成套素材」专区的成套卡片，点开进整套。
export interface Series {
  series_id: string;
  series_name: string;
  type: AssetType;
  count: number;
  /** 前 4 张缩略图，做成套封面拼贴。 */
  covers: string[];
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

// Search our SELF-OWNED hoarded library (platform_assets, served from OSS) ONLY.
// 除「开源专区」外的所有栏目都只查我们自己囤到 OSS 的素材——用户在这些栏目里
// 看不到、也搜不到我们 OSS 里没有的内容。想搜实时上游开源素材请走「开源专区」
// (searchOpenSource)。所以这里**永不**回落到 /v1/assets/search 实时上游。
export async function searchAssets(params: {
  q: string;
  type: AssetType;
  license?: LicenseFilter;
  category?: string;
  subtab?: string;
  seriesId?: string;
  page?: number;
  pageSize?: number;
}): Promise<SearchResult> {
  const page = params.page || 1;
  const pageSize = params.pageSize || 24;
  const license = params.license || "commercial";

  const libParams: Record<string, string> = {
    q: params.q || "",
    type: params.type,
    license,
    page: String(page),
    page_size: String(pageSize),
  };
  if (params.category) libParams.category = params.category;
  if (params.subtab) libParams.subtab = params.subtab;
  if (params.seriesId) libParams.series_id = params.seriesId;
  const libQs = new URLSearchParams(libParams);
  const lib = await getJson<LibraryResult>(
    `/v1/assets/library/search?${libQs.toString()}`,
  );
  return {
    items: lib.items || [],
    page: lib.page,
    has_more: lib.page * lib.page_size < (lib.total || 0),
    sources_queried: ["library"],
  };
}

// 分区浏览用：给一批目录各取少量样本，拼成「目录 → 一行缩略图」的分区块首页
// （对标稿定/Foco 的分区浏览：每个目录一个 section，标题 + 「查看全部」+ 一行预览）。
// 后端没有「一次取多目录样本」的批接口，这里对每个目录并发一发轻量 search（page_size
// 小、只要头几张）。失败/空的目录静默丢弃，不阻塞其他分区。
export interface CategoryPreview {
  key: string;
  items: Asset[];
}

export async function previewCategories(params: {
  type: AssetType;
  categories: string[];
  license?: LicenseFilter;
  perCategory?: number;
}): Promise<CategoryPreview[]> {
  const per = Math.max(4, params.perCategory || 8);
  const license = params.license || "commercial";
  const results = await Promise.all(
    params.categories.map(async (key) => {
      try {
        const r = await searchAssets({
          q: "",
          type: params.type,
          license,
          category: key,
          page: 1,
          pageSize: per,
        });
        return { key, items: r.items };
      } catch {
        return { key, items: [] as Asset[] };
      }
    }),
  );
  // 只保留真正有内容的目录（空目录不成块），保序。
  return results.filter((r) => r.items.length > 0);
}

// 「开源专区」专用：直查实时上游开源素材网关（openverse/pexels/pixabay/polyhaven/
// freesound/jamendo…）。这是**唯一**一个能看到 OSS 之外内容的入口，供用户搜索开源
// 素材。结果的 id 形如 "<source>:<native_id>"，不带 library: 前缀。
export async function searchOpenSource(params: {
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

// 「开源专区」上游各来源能提供的类型（对齐后端 assets.SOURCE_TYPES）。用于开源专区
// 的类型切换，避免展示上游根本不支持的类型（如上游没有 sticker/font）。
export const OPEN_SOURCE_TYPES: AssetType[] = [
  "image",
  "vector",
  "video",
  "audio",
  "music",
  "3d",
];

export const OPEN_SOURCE_TYPE_LABELS: Record<string, string> = {
  image: "图片",
  vector: "矢量图",
  video: "视频",
  audio: "音效",
  music: "音乐",
  "3d": "3D / HDRI",
};

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
  audio: "音频",
  music: "音乐",
  "3d": "3D 模型",
  font: "字体",
  ppt: "PPT 模板",
  chart: "图表",
};

// 左侧栏「素材类型」分区——**只列我们真正囤到 OSS 的类型**。用户在这些栏目里只能看到
// 我们自有素材（platform_assets），OSS 里没有的类型不出现（例如 music 目前 OSS 无
// 数据就不放进侧栏，避免出现「点进去永远空」的死栏目）。想找开源素材去「开源专区」。
// 顺序对齐首页图片优先。DB 实有类型：image/chart/vector/sticker/video/3d/audio/font/ppt。
export const TYPE_ORDER: AssetType[] = [
  "image",
  "chart",
  "vector",
  "sticker",
  "ppt",
  "video",
  "3d",
  "audio",
  "font",
];

// --- PPT 模板（type='ppt'）约定 ---------------------------------------------
// 每套 deck 在 OSS 上的固定结构：assets/ppt/decks/<slug>/
//   deck.pptx（full_url，下载）· deck.html（source_url，网页版）
//   cover.webp（thumb）· p01..pN.webp（整页预览，N 由 tags 里 "pages:N" 声明）
// 详情页据此渲染「多页翻阅」预览，并提供 .pptx / HTML 双入口。
export function pptPageCount(a: Asset): number {
  for (const t of a.tags || []) {
    const m = /^pages:(\d+)$/.exec(t);
    if (m) return Math.min(60, Math.max(1, Number(m[1])));
  }
  return 0;
}

export function pptPageUrls(a: Asset): string[] {
  const n = pptPageCount(a);
  const base = a.full_url.replace(/\/deck\.pptx$/, "");
  if (!n || base === a.full_url) return [];
  return Array.from({ length: n }, (_, i) => `${base}/p${String(i + 1).padStart(2, "0")}.webp`);
}

// PPT「行业」维度（与艺术风格目录正交的第二条分类轴）。新 deck 的 scene_tags 里带
// `ind-<group>` 机器键（如 "ind-edu"），后端 library/search 的 subtab 参数对 scene_tags
// 做 array-contains 精确匹配，所以把 ind- 键作为 subtab 传即可按行业过滤——category
// 可以同时给（风格 × 行业叠加），也可以为空单给 subtab（全部风格下按行业筛）。
export const PPT_INDUSTRIES: CategorySub[] = [
  { key: "ind-edu", label: "教育培训" },
  { key: "ind-academic", label: "学术科研" },
  { key: "ind-medical", label: "医疗健康" },
  { key: "ind-finance", label: "金融投资" },
  { key: "ind-tech", label: "科技互联网" },
  { key: "ind-biz", label: "商务通用" },
  { key: "ind-marketing", label: "市场营销" },
  { key: "ind-food", label: "餐饮美食" },
  { key: "ind-travel", label: "文旅酒店" },
  { key: "ind-estate", label: "地产建筑" },
  { key: "ind-mfg", label: "制造工业" },
  { key: "ind-agri", label: "农业环保" },
  { key: "ind-law", label: "法律政务" },
  { key: "ind-media", label: "媒体创意" },
  { key: "ind-retail", label: "零售电商" },
  { key: "ind-life", label: "生活服务" },
  { key: "ind-culture", label: "文化艺术" },
  { key: "ind-hr", label: "人力组织" },
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
      "书籍封面",
      "长图",
      "表情包",
      "壁纸",
      "桌牌",
      "简历",
      "工作证",
      "门票",
      "邀请函",
      "红包封面",
      "手机壳",
      "贺卡",
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

// ---------------------------------------------------------------------------
// 素材库「目录」分类树（对标稿定 23 面板 + 二级 tab）
// ---------------------------------------------------------------------------
// 这是 operator 最强调的「分类」：左栏按面板（热门/小红书/符号/节日/…/icon图标）
// 浏览，每个面板下有二级 tab。它与后端 ingest 的 taxonomy.py 一一对应：
//   panel.key  == platform_assets.category
//   sub.key    ∈  platform_assets.scene_tags
// 切面板/二级 tab → searchAssets({category, subtab}) → 库里精确命中那一类素材。
// 顺序、命名、图标都照 operator 提供的稿定截图。

export interface CategorySub {
  /** 机器键（= scene_tags 里的二级 tab 键） */
  key: string;
  /** 中文 tab 名（对齐稿定截图文案） */
  label: string;
}

export interface CategoryPanel {
  /** 面板机器键（= platform_assets.category） */
  key: string;
  /** 面板中文名（左栏目录名） */
  label: string;
  /** 面板图标 emoji（纯装饰） */
  icon: string;
  /** 该面板素材落在哪个 AssetType（驱动 library/search 的 type 参数） */
  type: AssetType;
  /** 二级 tab；首项恒为「全部」(key="") 表示该面板不按二级 tab 过滤 */
  subs: CategorySub[];
}

const ALL_SUB: CategorySub = { key: "", label: "全部" };

export const CATEGORY_PANELS: CategoryPanel[] = [
  {
    key: "hot", label: "热门", icon: "🔥", type: "sticker",
    subs: [ALL_SUB, { key: "heart", label: "爱心" }, { key: "star", label: "星星" },
      { key: "megaphone", label: "喇叭" }, { key: "magnifier", label: "放大镜" },
      { key: "number", label: "数字" }, { key: "money", label: "钱" },
      { key: "phone", label: "手机电话" }],
  },
  {
    key: "xhs", label: "小红书", icon: "📕", type: "sticker",
    subs: [ALL_SUB, { key: "featured", label: "精选" }, { key: "emoji", label: "emoji符号" },
      { key: "metoo-pet", label: "猫狗梗图" }, { key: "memo", label: "手帐备忘录" }],
  },
  {
    key: "symbol", label: "符号", icon: "✓", type: "sticker",
    subs: [ALL_SUB, { key: "check-cross", label: "圈叉勾" },
      { key: "punctuation", label: "标点符号" }, { key: "arrow", label: "箭头" }],
  },
  {
    key: "festival", label: "节日", icon: "🎉", type: "sticker",
    subs: [ALL_SUB, { key: "jieqi", label: "二十四节气" }, { key: "summer", label: "夏日" },
      { key: "qixi", label: "七夕" }, { key: "teacher", label: "教师节" },
      { key: "national", label: "国庆节" }, { key: "midautumn", label: "中秋节" },
      { key: "double11", label: "双11" }, { key: "christmas", label: "圣诞节" },
      { key: "newyear", label: "元旦节" }],
  },
  {
    key: "industry", label: "行业", icon: "🏢", type: "sticker",
    subs: [ALL_SUB, { key: "education", label: "教育" }, { key: "ecommerce", label: "电商" },
      { key: "travel", label: "旅游" }, { key: "baby", label: "母婴" },
      { key: "home", label: "家居" }, { key: "finance", label: "金融" },
      { key: "medical", label: "医疗" }],
  },
  {
    key: "flat-illust", label: "扁平插画", icon: "🖼", type: "vector",
    subs: [ALL_SUB, { key: "featured", label: "精选" }, { key: "people", label: "人物" },
      { key: "animal-plant", label: "动植物" }, { key: "transport", label: "交通" },
      { key: "building", label: "建筑" }, { key: "furniture", label: "家具" },
      { key: "chart", label: "图表" }, { key: "entertainment", label: "文娱" },
      { key: "life", label: "生活" }, { key: "prop", label: "道具" },
      { key: "scene", label: "场景" }],
  },
  { key: "element-3d", label: "3D元素", icon: "🧊", type: "sticker", subs: [ALL_SUB] },
  {
    key: "guofeng", label: "国风水墨", icon: "🀄", type: "sticker",
    subs: [ALL_SUB, { key: "ink-element", label: "水墨元素" },
      { key: "guochao-element", label: "国潮元素" }, { key: "ink-bg", label: "水墨背景" }],
  },
  {
    key: "texture-style", label: "肌理风格", icon: "🎨", type: "sticker",
    subs: [ALL_SUB, { key: "inflate", label: "膨胀风" }, { key: "clay", label: "粘土风" },
      { key: "glass", label: "玻璃风" }, { key: "fluffy", label: "毛绒风" },
      { key: "gilt", label: "鎏金风" }, { key: "particle", label: "粒子风" },
      { key: "torn-paper", label: "撕纸风" }, { key: "crayon", label: "蜡笔风" }],
  },
  {
    key: "sticker-dyn", label: "动态贴纸", icon: "✨", type: "sticker",
    subs: [ALL_SUB, { key: "featured", label: "精选" }, { key: "emoji-pack", label: "表情包" },
      { key: "fruit", label: "水果" }, { key: "promo-text", label: "促销文字" },
      { key: "simple-deco", label: "简约装饰" }, { key: "people", label: "人物" },
      { key: "action", label: "动作" }, { key: "animal", label: "动物" }],
  },
  { key: "art-text", label: "艺术字", icon: "🅰", type: "font", subs: [ALL_SUB] },
  {
    key: "nature", label: "自然", icon: "🌿", type: "sticker",
    subs: [ALL_SUB, { key: "moon-star", label: "星月" }, { key: "sun", label: "太阳" },
      { key: "cloud", label: "云朵" }, { key: "flower", label: "花" },
      { key: "grass", label: "草" }, { key: "tree", label: "树" },
      { key: "mountain-river", label: "山河" }, { key: "lake-sea", label: "湖海" }],
  },
  {
    key: "people", label: "人物", icon: "🧑", type: "sticker",
    subs: [ALL_SUB, { key: "child", label: "儿童" }, { key: "elder", label: "老人" },
      { key: "woman", label: "女士" }, { key: "man", label: "男士" },
      { key: "occupation", label: "职业" }],
  },
  {
    key: "animal", label: "动物", icon: "🐾", type: "sticker",
    subs: [ALL_SUB, { key: "cat", label: "猫" }, { key: "dog", label: "狗" },
      { key: "snake", label: "蛇" }, { key: "horse", label: "马" },
      { key: "sheep", label: "羊" }, { key: "monkey", label: "猴" },
      { key: "chicken", label: "鸡" }, { key: "pig", label: "猪" },
      { key: "mouse", label: "鼠" }, { key: "ox", label: "牛" }, { key: "tiger", label: "虎" }],
  },
  {
    key: "food", label: "美食", icon: "🍔", type: "image",
    subs: [ALL_SUB, { key: "fruit", label: "水果" }, { key: "vegetable", label: "蔬菜" },
      { key: "chinese-dish", label: "中式料理" }, { key: "foreign-dish", label: "外国料理" },
      { key: "drink", label: "饮料酒水" }, { key: "dessert", label: "蛋糕甜品" },
      { key: "meat-egg", label: "肉类蛋禽" }, { key: "seasoning", label: "调味蘸料" }],
  },
  { key: "city", label: "城市建筑", icon: "🏙", type: "image", subs: [ALL_SUB] },
  {
    key: "transport", label: "交通工具", icon: "🚗", type: "sticker",
    subs: [ALL_SUB, { key: "element", label: "立体交通" }, { key: "photo", label: "交通摄影" }],
  },
  { key: "brush", label: "色块笔刷", icon: "🖌", type: "sticker", subs: [ALL_SUB] },
  { key: "life-photo", label: "生活晒照", icon: "📸", type: "sticker", subs: [ALL_SUB] },
  { key: "face-cover", label: "挡脸元素", icon: "🙈", type: "sticker", subs: [ALL_SUB] },
  { key: "gesture", label: "热门手势", icon: "👍", type: "sticker", subs: [ALL_SUB] },
  {
    key: "icon", label: "icon图标", icon: "🔧", type: "vector",
    subs: [ALL_SUB, { key: "featured", label: "精选" }, { key: "people", label: "人物" },
      { key: "ecommerce", label: "电商" }, { key: "app", label: "手机App" },
      { key: "internet", label: "互联网" }, { key: "gesture", label: "手势" },
      { key: "animal", label: "动物" }, { key: "weather", label: "天气" },
      { key: "food", label: "美食" }, { key: "daily", label: "日用品" },
      { key: "biz-finance", label: "商务金融" }, { key: "baby", label: "母婴育儿" },
      { key: "entertainment", label: "娱乐" }, { key: "beauty", label: "美妆" },
      { key: "fashion", label: "服饰箱包" }, { key: "appliance", label: "电器" },
      { key: "tool", label: "工具" }, { key: "device", label: "电子产品" },
      { key: "sport", label: "运动" }, { key: "medical", label: "医疗" },
      { key: "transport", label: "交通" }, { key: "eco", label: "环保" },
      { key: "building", label: "建筑" }, { key: "edu", label: "教培" },
      { key: "line", label: "线性" }, { key: "color", label: "彩色" },
      { key: "justice", label: "司法" }, { key: "safety", label: "消防安全" },
      { key: "charity", label: "慈善公益" }],
  },
  {
    key: "background", label: "背景", icon: "🎴", type: "image",
    subs: [ALL_SUB, { key: "gradient", label: "渐变背景" }, { key: "texture", label: "纹理背景" },
      { key: "festive", label: "节日背景" }, { key: "fresh", label: "清新背景" }],
  },
];

export function panelByKey(key: string): CategoryPanel | undefined {
  return CATEGORY_PANELS.find((p) => p.key === key);
}

// ---------------------------------------------------------------------------
// 「素材类型 → 顶部一级目录」面板（DB 驱动 + 手写配置叠加）
// ---------------------------------------------------------------------------
// operator 诉求：① 图片与矢量图必须分开；② 进到某个类型（字体/3D/视频…）时，顶部一级
// 目录只能展示**这个类型**真实拥有的目录；③ 用户看不到、搜不到我们 OSS 里没有的内容。
//
// 关键教训：不能只信 CATEGORY_PANELS[].type（手写配置常与真实库存脱节——例如手写把
// symbol/festival/sticker-dyn 标成 sticker，但 OSS 里这些 category 的数据其实是 vector/
// image/video，若照手写 type 过滤会渲染出一排「点进去永远空」的死目录）。
//
// 因此面板一律**以后端 library/categories 返回的真实 category 为准**（保证每个目录都有
// 内容、且类型正确），再用手写的 CATEGORY_PANELS 作为**叠加配置**补上中文名/图标/二级
// tab（有配就用配、没配就用友好名兜底）。这样彻底消除类型/面板错配与空目录。

// 工程 category 键 → 友好中文目录名（手写 CATEGORY_PANELS 没覆盖到的兜底）。
const CATEGORY_LABELS: Record<string, string> = {
  // 3D / HDRI / texture
  model: "3D 模型",
  hdri: "HDRI 环境",
  texture: "材质纹理",
  // audio（音乐 mus-* / 音效 sfx-*）
  "mus-festive": "节日音乐",
  "mus-upbeat": "欢快音乐",
  "mus-relax": "轻松音乐",
  "mus-emotional": "情感音乐",
  "mus-electronic": "电子音乐",
  "mus-corporate": "商务音乐",
  "sfx-transition": "转场音效",
  "sfx-applause": "掌声欢呼",
  "sfx-ui": "界面音效",
  "sfx-nature": "自然音效",
  "sfx-coin": "金币音效",
  // video
  abstract: "抽象",
  fitness: "健身",
  clouds: "云朵",
  flowers: "花卉",
  flowers2: "花卉",
  food: "美食",
  light: "光效",
  nature: "自然",
  "vid-nature": "自然",
  city: "城市",
  "vid-city": "城市",
  festival: "节日",
  "vid-festive": "节日",
  ocean: "海洋",
  business: "商务",
  "vid-business": "商务",
  water: "水",
  "vid-tech": "科技",
  tech: "科技",
  particles: "粒子",
  "vid-particle": "粒子",
  smoke: "烟雾",
  travel2: "旅行",
  celebration: "庆祝",
  // image（照片主体 / 行业 / 背景色系风格 / 节令）
  background: "背景",
  wedding: "婚礼",
  beauty: "美妆",
  ecommerce: "电商",
  finance: "金融",
  pet: "宠物",
  medical: "医疗",
  fashion: "服饰",
  education: "教育",
  travel: "旅行",
  realestate: "房产",
  kids: "儿童",
  music: "音乐现场",
  office: "办公",
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
  gaming: "电竞",
  coffee: "咖啡",
  // vector（icon / 装饰 / 行业矢量 / 形状）
  icon: "icon 图标",
  "flat-illust": "扁平插画",
  symbol: "符号",
  "sticker-dyn": "动态贴纸",
  shape: "形状",
  ornament: "装饰花纹",
  // vector 里若干「裸工程键」曾直接漏到前端目录名（ecommerce-svg / party-vec /
  // medal-svg / home / baby …）。补上友好中文名，杜绝界面出现英文键。
  "ecommerce-svg": "电商矢量",
  "party-vec": "派对庆祝",
  "medal-svg": "奖牌徽章",
  home: "家居",
  baby: "母婴",
  // sticker（emoji 贴纸大全，按 OpenMoji group 分中文子类目）
  emoji: "emoji 贴纸",
  hot: "热门",
  xhs: "小红书",
  guofeng: "国风水墨",
  // font
  "art-text": "艺术字",
  // chart（交互图表大类；category = pyecharts 图表族，见 type="chart" 约定）
  pie: "饼图",
  bar: "柱状图",
  line: "折线图",
  area: "面积图",
  scatter: "散点图",
  radar: "雷达图",
  funnel: "漏斗图",
  gauge: "仪表盘",
  // ppt（风格族目录；slug = OSS deck 目录名 = platform_assets.category）
  etching: "蚀刻编辑风",
  editorial: "杂志编辑风",
  pixel: "像素复古风",
  vellum: "水墨留白风",
  dossier: "档案复古风",
  whiteboard: "白板手绘风",
  sketch: "手账涂鸦风",
  glamour: "奢华金黑风",
  amber: "暖调剪纸风",
  arctic: "极简科技风",
  cerulean: "天空极简风",
  cobalt: "商务3D风",
  emerald: "自然环保风",
  basalt: "日式极简风",
  mist: "灰雾建筑风",
  onyx: "暗黑哲思风",
  sand: "医疗插画风",
  neon: "赛博霓虹风",
  linen: "铅笔淡彩风",
  alabaster: "黑白商务风",
  patina: "岩画原始风",
  quartz: "航天留白风",
  mahogany: "竞速光影风",
  ginkgo: "金箔典雅风",
  sunset: "落日剪影风",
  lavender: "暮紫柔和风",
  bauhaus: "包豪斯几何风",
  blueprint: "工程蓝图风",
  terrazzo: "水磨石生活风",
  aurora: "极光深空风",
  riso: "孔版印刷风",
  ukiyo: "浮世绘和风",
  gazette: "旧报纸网点风",
  botany: "古典博物风",
  memphis: "孟菲斯撞色风",
  noir: "黑色电影风",
  meridian: "古典航海图风",
};

export function categoryLabel(key: string): string {
  const panel = panelByKey(key);
  if (panel) return panel.label;
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  // 行业前缀 ind-xxx / 背景色系 bg-xxx / 照片主体 ph-xxx 的兜底：去前缀 + 查表。
  const stripped = key.replace(/^(ind|bg|ph|vid|mus|sfx)-/, "");
  return CATEGORY_LABELS[stripped] || stripped;
}

// DB 驱动：把该类型在 OSS 里真实存在的 category 键，构建成顶部一级目录面板。
// 排序：先按手写 CATEGORY_PANELS 里**该类型**的策划顺序排（有数据的才保留），再接上
// 其余真实 category（后端已按素材数降序传入）。每个 category 若有同名同类型手写配置则
// 沿用其二级 tab；否则给单一「全部」子 tab。既来自真实库存（无空目录、无类型错配），
// 又尽量保留策划过的目录顺序与精细二级导航。
export function buildPanelsFromCategories(
  type: AssetType,
  categories: string[],
): CategoryPanel[] {
  const present = new Set(categories);
  const toPanel = (key: string): CategoryPanel => {
    const cfg = panelByKey(key);
    const matched = cfg && cfg.type === type;
    return {
      key,
      label: categoryLabel(key),
      icon: matched ? cfg!.icon : "",
      type,
      subs: matched && cfg!.subs.length > 1 ? cfg!.subs : [ALL_SUB],
    };
  };
  // 1) 策划顺序：该类型的手写面板，且 DB 里真有数据。
  const curatedKeys = CATEGORY_PANELS.filter(
    (p) => p.type === type && present.has(p.key),
  ).map((p) => p.key);
  const seen = new Set(curatedKeys);
  // 2) 其余真实 category（按后端传入的素材数降序），去掉已在策划里的。
  const restKeys = categories.filter((k) => !seen.has(k));
  return [...curatedKeys, ...restKeys].map(toPanel);
}

export function listLibraryCategories(
  type: AssetType,
): Promise<{ categories: string[] }> {
  return getJson<{ categories: string[] }>(
    `/v1/assets/library/categories?type=${encodeURIComponent(type)}`,
  );
}

// 「成套素材」列表：按 series 分组。type 留空=所有类型的成套。
export function listSeries(type?: AssetType): Promise<{ series: Series[] }> {
  const qs = type ? `?type=${encodeURIComponent(type)}` : "";
  return getJson<{ series: Series[] }>(`/v1/assets/library/series${qs}`);
}

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
