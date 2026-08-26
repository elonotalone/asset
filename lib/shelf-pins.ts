// 洗白新件置顶清单。列表本身来自网关 `/v1/assets/library/search`
//（按 quality_score → created_at → id），本仓改不了那个顺序。
//
// 本仓能控制的手段：每个 category 最多钉 3 个 platform_assets.id。
// 取数之后把这 3 个提到该目录网格最前；当前页没有的，按 id 走
// `/v1/assets/detail?id=library:<uuid>` 补拉。不改网关。
//
// L/M/N/O/P 交件时只改 SHELF_PINS 对应 category 的数组
//（写 platform_assets 行 id，带不带 `library:` 前缀都行，最多 3 个，超出截断）。
// 落位由本文件 + lib/assets.ts 的 searchAssets 完成。

export const SHELF_PIN_LIMIT = 3;

/** 五类洗白件各自落在哪一个目录。类型页由 CATEGORY_PANELS 的 type 决定。 */
export const WASH_PIN_CATEGORIES = [
  "contract-agreement",
  "resume-template",
  "flowchart-diagram",
  "longform-poster",
  "ecommerce-detail",
] as const;

export type WashPinCategory = (typeof WASH_PIN_CATEGORIES)[number];

/**
 * category → 最多 3 个 platform_assets.id。
 * 空数组 = 这一类还没交件，目录按网关默认序。
 */
export const SHELF_PINS: Record<WashPinCategory, string[]> = {
  "contract-agreement": [
    "09eb7494-821f-4cce-be81-39057febdd6c",
    "8f98cdcb-8f46-4009-8aee-8c39630f0a72",
    "719c3439-5f78-40c2-8b0a-d53119189b37",
  ],
  "resume-template": [
    "354a6b58-0caf-4048-88eb-2a150fac2630",
    "a3489bce-0e3d-4d45-add8-a7d0b7a4c93a",
    "be979923-fb5a-4145-b8bb-87796ca66c00",
  ],
  "flowchart-diagram": [
    "d54131f1-df8d-40fa-b3ba-7f869ae63e09",
    "6a85fc48-f16a-4db0-b4b2-8bee697c0dc9",
    "04444ed3-3213-4f20-b934-2eca1ea51d2c",
  ],
  "longform-poster": [],
  "ecommerce-detail": [],
};

export function normalizeLibraryId(id: string): string {
  const raw = (id || "").trim();
  if (!raw) return "";
  return raw.startsWith("library:") ? raw.slice("library:".length) : raw;
}

export function libraryPrefixedId(id: string): string {
  const n = normalizeLibraryId(id);
  return n ? `library:${n}` : "";
}

export function pinsFor(category: string): string[] {
  if (!(WASH_PIN_CATEGORIES as readonly string[]).includes(category)) return [];
  const raw = SHELF_PINS[category as WashPinCategory] || [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    const n = normalizeLibraryId(id);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= SHELF_PIN_LIMIT) break;
  }
  return out;
}

/** 纯函数：钉在最前（清单顺序），其余保持原序且去掉已钉的重复。缺件的槽空着。 */
export function applyShelfPins<T extends { id: string }>(
  items: T[],
  pinnedIds: string[],
  extras: T[] = [],
): T[] {
  if (!pinnedIds.length) return items;
  const pinSet = new Set(pinnedIds.map(normalizeLibraryId));
  const byId = new Map<string, T>();
  for (const item of [...extras, ...items]) {
    const n = normalizeLibraryId(item.id);
    if (n && !byId.has(n)) byId.set(n, item);
  }
  const head: T[] = [];
  for (const id of pinnedIds.map(normalizeLibraryId)) {
    const item = byId.get(id);
    if (item) head.push(item);
  }
  const rest = items.filter((item) => !pinSet.has(normalizeLibraryId(item.id)));
  return [...head, ...rest];
}

export async function attachShelfPins<T extends { id: string }>(opts: {
  category: string;
  page: number;
  items: T[];
  fetchPinned: (bareId: string) => Promise<T>;
}): Promise<T[]> {
  const pinned = pinsFor(opts.category);
  if (!pinned.length) return opts.items;
  if (opts.page > 1) {
    const pinSet = new Set(pinned);
    return opts.items.filter((a) => !pinSet.has(normalizeLibraryId(a.id)));
  }
  const have = new Set(opts.items.map((a) => normalizeLibraryId(a.id)));
  const extras: T[] = [];
  for (const id of pinned) {
    if (have.has(id)) continue;
    try {
      extras.push(await opts.fetchPinned(id));
    } catch {
      // 件还没上架或网关暂不可用：这个槽空着，不许拿别的件顶上。
    }
  }
  return applyShelfPins(opts.items, pinned, extras);
}
