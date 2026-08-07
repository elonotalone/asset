// W8 对账报告：三分区页签上会显示的件数，与库里真实行数对不对得上。
//
// 跑法（asset 仓根）：
//   node tests/w8-zone-counts-report.mjs
//
// 它**原样重放** lib/assets.ts 里 buildTypeOriginIndex 的算法（同一组网关调用、
// 同一个采样大小、同一条判据），所以打印出来的就是页面上会出现的数字。
// 不是渲染页面 —— 操作员本轮没有授权浏览器核验，这里只打非浏览器的 HTTP 请求。
//
// 期望值来自库里这一条（写在 signals/W8-origin-filter-and-real-counts.md 里）：
//
//   select type, origin, count(*) from public.platform_assets
//    where status='approved' and usage_scope='standalone'
//      and supply_tier is distinct from 'link-only'
//      and credit_bundle::text is distinct from '{}'
//      and license_family is distinct from 'unknown'
//    group by 1,2;

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://api.oceanleo.com";

// 与 lib/assets.ts 的 SAMPLE_PER_CATEGORY 一致。
const SAMPLE_PER_CATEGORY = 6;
// 与 lib/assets.ts 的 TYPE_ORDER 一致（左栏那 10 个库内类型）。
const TYPE_ORDER = [
  "image", "prompt", "chart", "vector", "sticker",
  "ppt", "video", "3d", "audio", "font",
];

// 已知缺口：网关够不着的件，不是我们数错了。
//
// `[实测 2026-08-07 W8]` `oceanleo/backend/app/routers/assets_router.py:153`
// 把 `category` 参数 `.lower()` 了，而 `library_categories` 不 lower。
// 于是含大写字母的目录**列得出来、点不进去**：传 `LOGO` 会被改成 `logo`，
// 库里是 `LOGO`，一行都匹配不上（实测 LOGO/logo/Logo 三种写法 total 全是 0）。
// 货架可见集合里含大写字母的目录只有这一个（`category <> lower(category)` 只命中 LOGO）。
//
// 用户能看到的后果：图片类型页上「LOGO」这个目录点进去是空的，
// 那 5 张 OceanLeo 自有的 LOGO 图**在货架上拿不到**。
// 改在 backend，不在 W8 边界内，已写进 signals/W8-origin-filter-and-real-counts.md。
const KNOWN_GAPS = {
  image: {
    "first-party": 5,
    why: "目录 LOGO 的 5 件：网关把 category 参数转成小写，库里是大写，匹配不上",
  },
};

// 库里数出来的期望值（2026-08-07 W8 实测）。
const EXPECTED = {
  image: { "first-party": 170, external: 3 },
  prompt: { "first-party": 0, external: 120 },
  chart: { "first-party": 44, external: 18 },
  vector: { "first-party": 0, external: 40607 },
  sticker: { "first-party": 0, external: 1644 },
  ppt: { "first-party": 243, external: 0 },
  video: { "first-party": 0, external: 0 },
  "3d": { "first-party": 0, external: 220 },
  audio: { "first-party": 0, external: 138 },
  font: { "first-party": 0, external: 59 },
};

// api.oceanleo.com 会间歇性 503 control-plane-unavailable（台账 §B4/§G，归 W11）。
// 对账要的是「数字对不对」，不是「网关稳不稳」，所以这里退避重试几次。
// 客户端那边只重试一次，重试还失败就把 index 标成 incomplete，页面显示「≥N」。
async function getJson(path, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const resp = await fetch(`${GATEWAY}${path}`, { cache: "no-store" });
      if (resp.ok) return await resp.json();
      last = new Error(`HTTP ${resp.status} on ${path}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw last;
}

/** 有上限的并发 map，别把网关打出「Invalid HTTP request」。 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const my = i++;
        out[my] = await fn(items[my]);
      }
    }),
  );
  return out;
}

async function buildIndex(type) {
  const [cats, whole] = await Promise.all([
    getJson(`/v1/assets/library/categories?type=${encodeURIComponent(type)}`),
    getJson(`/v1/assets/library/search?type=${encodeURIComponent(type)}&license=commercial&page=1&page_size=4`),
  ]);
  const keys = cats.categories || [];
  const sampled = await mapLimit(keys, 6, async (key) => {
    const r = await getJson(
      `/v1/assets/library/search?type=${encodeURIComponent(type)}` +
        `&category=${encodeURIComponent(key)}&license=commercial` +
        `&page=1&page_size=${SAMPLE_PER_CATEGORY}`,
    );
    const items = r.items || [];
    if (!r.total || items.length === 0) return null;
    const origins = [...new Set(items.map((a) => a.origin).filter(Boolean))];
    return { key, origin: origins.length === 1 ? origins[0] : null, total: r.total };
  });
  const categories = sampled.filter(Boolean);
  const totalByOrigin = { "first-party": 0, external: 0 };
  for (const c of categories) if (c.origin) totalByOrigin[c.origin] += c.total;
  return {
    type,
    shelfTotal: whole.total || 0,
    totalByOrigin,
    categories,
    mixed: categories.filter((c) => !c.origin).map((c) => c.key),
    categoriesReturned: keys.length,
  };
}

const rows = [];
const gaps = [];
let bad = 0;
for (const type of TYPE_ORDER) {
  const ix = await buildIndex(type);
  const want = EXPECTED[type];
  const gap = KNOWN_GAPS[type] || {};
  const gotOwned = ix.totalByOrigin["first-party"];
  const gotStocked = ix.totalByOrigin.external;
  const wantOwned = want["first-party"] - (gap["first-party"] || 0);
  const wantStocked = want.external - (gap.external || 0);
  const ok =
    gotOwned === wantOwned &&
    gotStocked === wantStocked &&
    ix.mixed.length === 0;
  if (!ok) bad++;
  if (gap.why) gaps.push(`${type}: ${gap.why}`);
  rows.push({
    类型: type,
    自有: gotOwned,
    自有应有: want["first-party"],
    已入库开源: gotStocked,
    开源应有: want.external,
    货架合计: ix.shelfTotal,
    目录数: `${ix.categories.length}/${ix.categoriesReturned}`,
    混来源目录: ix.mixed.length,
    已知缺口: (gap["first-party"] || 0) + (gap.external || 0) || "",
    判定: ok ? "对上" : "对不上",
  });
}

console.table(rows);
if (gaps.length) {
  console.log("\n已知缺口（网关够不着，不是数错了）：");
  for (const g of gaps) console.log("  - " + g);
}
const owned = rows.reduce((s, r) => s + r.自有, 0);
const stocked = rows.reduce((s, r) => s + r.已入库开源, 0);
const ownedShould = rows.reduce((s, r) => s + r.自有应有, 0);
console.log(
  `\n左栏 10 个库内类型合计：页面显示自有 ${owned} 件（库里应有 ${ownedShould} 件）` +
    ` / 已入库开源 ${stocked} 件`,
);
console.log(
  "库里 approved 的自有件共 486，另 29 件在 document/pdf/sheet/website/video_workflow" +
    " 五个类型上，左栏没有这些格子，所以页面上看不到。",
);
if (bad > 0) {
  console.error(`\n${bad} 个类型对不上。`);
  process.exit(1);
}
console.log(
  "\n10 个类型全部对上（扣掉已知缺口后逐格相等，且没有一个目录混两种来源）。",
);
