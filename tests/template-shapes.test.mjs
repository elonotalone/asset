// 第二批「定装」判据：页面构成、套装准入与主营页命名。
//
// 跑法（asset 仓根）：
//   node --import ./tests/register-tsx.mjs --test tests/template-shapes.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAIN_PAGE_LABEL_BY_SUB,
  mainPageLabel,
} from "../lib/template-skins.ts";
import { ALL_SUB_KEYS } from "../lib/template-taxonomy.ts";

test("105 个子类的主营页覆盖没有漏写键或幽灵键", () => {
  assert.equal(ALL_SUB_KEYS.length, 105);
  const real = new Set(ALL_SUB_KEYS);
  const ghosts = Object.keys(MAIN_PAGE_LABEL_BY_SUB).filter((key) => !real.has(key));
  assert.deepEqual(ghosts, []);
});

test("餐饮保留菜单，住宿、旅行与签证不叫菜单", () => {
  for (const subKey of ["fastfood", "hotpot", "western", "japanese-korean", "bakery", "bbq"]) {
    assert.equal(mainPageLabel("food", subKey), "菜单", subKey);
  }
  assert.equal(mainPageLabel("food", "farmstay"), "客房");
  assert.equal(mainPageLabel("food", "resort"), "客房");
  assert.equal(mainPageLabel("food", "hotel"), "客房");
  assert.equal(mainPageLabel("food", "travel-agency"), "线路");
  assert.equal(mainPageLabel("food", "local-tour"), "线路");
  assert.equal(mainPageLabel("food", "visa"), "服务");
});

test("粗行业里的非典型子类使用自己的业务语言", () => {
  assert.equal(mainPageLabel("fashion", "medical-beauty"), "服务");
  assert.equal(mainPageLabel("org", "government"), "服务");
  assert.equal(mainPageLabel("grocery", "hospital"), "服务");
  assert.equal(mainPageLabel("general", "mall"), "商品");
  assert.equal(mainPageLabel("general", "personal"), "作品");
});
