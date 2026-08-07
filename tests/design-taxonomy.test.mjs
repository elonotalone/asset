// 平面设计成品类型轴的对账测试。
//
// 跑法（asset 仓根）：
//   node --import ./tests/register-tsx.mjs --test tests/design-taxonomy.test.mjs
//
// 左栏的 10 格是照 manifest 实际货存排的。这个测试守的就是「格子与货对得上」：
// 物料无重无漏地归进 10 个类型，件数合计 684，任何一格都不空。
// manifest 一旦新增物料，designTypeOf 会返回 null，这里立刻红。

import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_TYPE_LABELS,
  DESIGN_TYPE_MATERIALS,
  DESIGN_TYPE_ORDER,
  designTypeOf,
  isDesignAssetType,
} from "../lib/design-taxonomy.ts";
import manifest from "../public/design-templates/manifest.json" with { type: "json" };

const MATERIALS_IN_MANIFEST = new Set(manifest.map((t) => t.material));

test("10 个类型各有标签、各有物料，顺序表与标签表同集合", () => {
  assert.equal(DESIGN_TYPE_ORDER.length, 10);
  assert.deepEqual([...DESIGN_TYPE_ORDER].sort(), Object.keys(DESIGN_TYPE_LABELS).sort());
  for (const type of DESIGN_TYPE_ORDER) {
    assert.ok(DESIGN_TYPE_LABELS[type], `${type} 缺中文名`);
    assert.ok(DESIGN_TYPE_MATERIALS[type]?.length > 0, `${type} 没有任何物料`);
  }
});

test("物料归类无重复：一种物料只能落在一个类型里", () => {
  const seen = new Map();
  for (const type of DESIGN_TYPE_ORDER) {
    for (const material of DESIGN_TYPE_MATERIALS[type]) {
      assert.equal(seen.get(material), undefined, `物料「${material}」同时落在 ${seen.get(material)} 和 ${type}`);
      seen.set(material, type);
    }
  }
  assert.equal(seen.size, 23);
});

test("物料归类无遗漏：manifest 的 23 种物料全部有归宿，且没有归类到不存在的物料", () => {
  const mapped = new Set(DESIGN_TYPE_ORDER.flatMap((t) => DESIGN_TYPE_MATERIALS[t]));
  assert.equal(MATERIALS_IN_MANIFEST.size, 23);
  assert.deepEqual([...MATERIALS_IN_MANIFEST].sort(), [...mapped].sort());
});

test("684 件全部归位，逐格件数与左栏骨架一致", () => {
  const counted = {};
  for (const t of manifest) {
    const type = designTypeOf(t.material);
    assert.ok(type, `物料「${t.material}」没有归宿，会从左栏消失`);
    counted[type] = (counted[type] ?? 0) + 1;
  }
  assert.deepEqual(counted, {
    poster: 163,
    cover: 160,
    card: 137,
    qrcode: 45,
    product_shot: 42,
    resume: 42,
    logo: 35,
    avatar: 28,
    emoji_pack: 18,
    wallpaper: 14,
  });
  const total = Object.values(counted).reduce((a, b) => a + b, 0);
  assert.equal(total, manifest.length);
  assert.equal(total, 684);
});

test("isDesignAssetType 只认这 10 个 key —— 路由靠它挡 404", () => {
  for (const type of DESIGN_TYPE_ORDER) assert.equal(isDesignAssetType(type), true);
  for (const bad of ["", "design", "海报", "toString", "constructor", "__proto__"]) {
    assert.equal(isDesignAssetType(bad), false, `${bad} 不该被当成类型`);
  }
});
