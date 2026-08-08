// W8 对账报告：三分区页签上会显示的件数，与库里真实行数对不对得上。
//
// 跑法（asset 仓根）：
//   node tests/w8-zone-counts-report.mjs
//   NEXT_PUBLIC_GATEWAY_URL=http://127.0.0.1:8791 node tests/w8-zone-counts-report.mjs
//
// 它**原样重放** lib/assets.ts 里 buildTypeOriginIndex 的算法（同一组网关调用、
// 同一个采样大小、同一条判据），所以打印出来的就是页面上会出现的数字。
// 不是渲染页面 —— 操作员本轮没有授权浏览器核验，这里只打非浏览器的 HTTP 请求。
//
// ⚠️ 打哪个网关很重要。`origin` 参数是 W7 落地、**已提交未部署**的（父裁决 §A28），
// 线上 api.oceanleo.com 跑的仍是旧码、会**静默忽略** `&origin=`。对着线上跑，
// fetchTotalsByOrigin() 两发会各自拿回「全类型总数」，自有与开源都等于货架合计 ——
// 那不是前端算错，是网关还没换码。要核验准数模式，把 NEXT_PUBLIC_GATEWAY_URL
// 指到本机新码（见 oceandino signals/W8-wave3-evidence/local-gateway.py）。
//
// 期望值来自库里这一条（原始输出存在 W8-wave3-evidence/）：
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

// 库里数出来的期望值（2026-08-08 S3 复测，与 2026-08-07 W8 逐项相同）。
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

// 左栏没有格子、但网关认得的 5 个类型。它们的自有件在页面上一件也看不到，
// 而 486 这个口径必须把它们算进去，否则「库里 486、页面 457」又变成一笔糊涂账。
const OFF_SHELF_TYPES = ["document", "pdf", "sheet", "website", "video_workflow"];

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

const search = (type, extra = "") =>
  getJson(
    `/v1/assets/library/search?type=${encodeURIComponent(type)}` +
      `&license=commercial&page=1&page_size=4${extra}`,
  );

const categories = (type, extra = "") =>
  getJson(`/v1/assets/library/categories?type=${encodeURIComponent(type)}${extra}`);

async function buildIndex(type) {
  const [cats, ownCats, extCats, whole, own, ext] = await Promise.all([
    categories(type),
    // 归属：服务端按 origin 各报一张目录表，前端按成员关系判，不再靠采样推断。
    categories(type, "&origin=first-party"),
    categories(type, "&origin=external"),
    search(type),
    // 准数：前端 fetchTotalsByOrigin() 打的就是这两发。
    search(type, "&origin=first-party"),
    search(type, "&origin=external"),
  ]);
  const keys = cats.categories || [];
  const ownKeys = new Set(ownCats.categories || []);
  const extKeys = new Set(extCats.categories || []);
  const sampled = await mapLimit(keys, 6, async (key) => {
    const r = await getJson(
      `/v1/assets/library/search?type=${encodeURIComponent(type)}` +
        `&category=${encodeURIComponent(key)}&license=commercial` +
        `&page=1&page_size=${SAMPLE_PER_CATEGORY}`,
    );
    const items = r.items || [];
    // total>0 但 items 为空 = 目录点得开却取不到件；total=0 = 列得出来点进去空的
    // （2026-08-08 修掉的两类：目录名大小写被网关改写过；目录面板没过货架闸）。
    if (!r.total || items.length === 0) return { key, origin: null, total: r.total || 0, dead: true };
    const inOwn = ownKeys.has(key);
    const inExt = extKeys.has(key);
    const origins = [...new Set(items.map((a) => a.origin).filter(Boolean))];
    const origin =
      inOwn !== inExt
        ? inOwn
          ? "first-party"
          : "external"
        : origins.length === 1
          ? origins[0]
          : null;
    // 目录表说的归属，与这个目录里真实件的 origin 对不对得上。
    const disagrees = origins.length === 1 && origin !== null && origins[0] !== origin;
    return { key, origin, total: r.total, dead: false, disagrees };
  });
  const live = sampled.filter((c) => !c.dead);
  const summed = { "first-party": 0, external: 0 };
  for (const c of live) if (c.origin) summed[c.origin] += c.total;
  return {
    type,
    shelfTotal: whole.total || 0,
    // 与 lib/assets.ts 同一条：服务端报得出准数就用准数，报不出才退回累加。
    totalByOrigin: { "first-party": own.total || 0, external: ext.total || 0 },
    summed,
    categories: live,
    dead: sampled.filter((c) => c.dead).map((c) => c.key),
    mixed: live.filter((c) => !c.origin).map((c) => c.key),
    disagree: live.filter((c) => c.disagrees).map((c) => c.key),
    categoriesReturned: keys.length,
    ownCats: ownKeys.size,
    extCats: extKeys.size,
  };
}

const rows = [];
let bad = 0;
const deadCats = [];
let serverSideOff = false;
for (const type of TYPE_ORDER) {
  const ix = await buildIndex(type);
  const want = EXPECTED[type];
  const gotOwned = ix.totalByOrigin["first-party"];
  const gotStocked = ix.totalByOrigin.external;
  // 旧码网关静默忽略 origin ⇒ 两发都拿回货架合计。这不是数字错，是码没换。
  if (
    ix.shelfTotal > 0 &&
    gotOwned === ix.shelfTotal &&
    gotStocked === ix.shelfTotal
  ) {
    serverSideOff = true;
  }
  const ok =
    gotOwned === want["first-party"] &&
    gotStocked === want.external &&
    ix.mixed.length === 0 &&
    ix.dead.length === 0 &&
    ix.disagree.length === 0 &&
    // 目录表按区一分为二，两边加起来必须正好是整张货架的目录数。
    ix.ownCats + ix.extCats === ix.categoriesReturned;
  if (!ok) bad++;
  if (ix.dead.length) deadCats.push(`${type}: ${ix.dead.join(", ")}`);
  rows.push({
    类型: type,
    自有: gotOwned,
    自有应有: want["first-party"],
    已入库开源: gotStocked,
    开源应有: want.external,
    货架合计: ix.shelfTotal,
    "累加兜底(自有)": ix.summed["first-party"],
    目录数: `${ix.ownCats}+${ix.extCats}/${ix.categoriesReturned}`,
    点不进去的目录: ix.dead.length,
    混来源目录: ix.mixed.length,
    归属打架: ix.disagree.length,
    判定: ok ? "对上" : "对不上",
  });
}

console.table(rows);

if (serverSideOff) {
  console.error(
    "\n⚠️ 这个网关忽略 &origin=（自有与开源都等于货架合计）——" +
      " 打到的是 origin 落地前的旧码。核验准数请指到本机新码。",
  );
}
if (deadCats.length) {
  console.log("\n列得出来、点进去 0 件的目录：");
  for (const g of deadCats) console.log("  - " + g);
}

const owned = rows.reduce((s, r) => s + r.自有, 0);
const stocked = rows.reduce((s, r) => s + r.已入库开源, 0);
const ownedShould = rows.reduce((s, r) => s + r.自有应有, 0);
console.log(
  `\n左栏 10 个库内类型合计：页面显示自有 ${owned} 件（库里应有 ${ownedShould} 件）` +
    ` / 已入库开源 ${stocked} 件`,
);

// 486 的另外 29 件：类型在左栏没有格子，网关却认得。逐类问一遍，把账做平。
const offShelf = await mapLimit(OFF_SHELF_TYPES, 5, async (t) => {
  const r = await search(t, "&origin=first-party");
  return { 类型: t, 自有: r.total || 0 };
});
console.table(offShelf);
const offTotal = offShelf.reduce((s, r) => s + r.自有, 0);
console.log(
  `左栏没有格子的 5 个类型合计自有 ${offTotal} 件 ——` +
    ` 网关查得到，页面上一件也看不到。`,
);
console.log(
  `对账：${ownedShould}（左栏 10 类）+ ${offTotal}（无格子 5 类）= ` +
    `${ownedShould + offTotal}，应等于库里 first-party/approved 的原件 486 件。`,
);

// 成品那一半（kind=product）。前端今天一个页面都没消费它，这里只把数报出来。
const product = await getJson(
  "/v1/assets/library/search?kind=product&license=commercial&page=1&page_size=4",
);
console.log(
  `成品分区（kind=product）：${product.total} 件。` +
    `自有合计 = 486 原件 + ${product.total} 成品 = ${486 + (product.total || 0)}。` +
    `⚠️ 前端今天没有任何页面消费 kind=product，这 ${product.total} 件在类型页上看不到。`,
);

if (bad > 0) {
  console.error(`\n${bad} 个类型对不上。`);
  process.exit(1);
}
console.log(
  "\n10 个类型全部对上（逐格相等，没有一个目录混两种来源，也没有点不进去的目录）。",
);
