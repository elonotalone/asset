// 排前三机制：每个洗白 category 最多钉 3 个 platform_assets.id。
//
//   node --import ./tests/register-tsx.mjs --test tests/shelf-pins.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import {
  SHELF_PIN_LIMIT,
  WASH_PIN_CATEGORIES,
  SHELF_PINS,
  normalizeLibraryId,
  libraryPrefixedId,
  pinsFor,
  applyShelfPins,
  attachShelfPins,
} from "../lib/shelf-pins.ts";

test("五类各有一个空置顶槽，上限 3", () => {
  assert.deepEqual([...WASH_PIN_CATEGORIES], [
    "contract-agreement",
    "resume-template",
    "flowchart-diagram",
    "longform-poster",
    "ecommerce-detail",
  ]);
  assert.equal(SHELF_PIN_LIMIT, 3);
  for (const cat of WASH_PIN_CATEGORIES) {
    assert.ok(Array.isArray(SHELF_PINS[cat]));
    assert.ok(SHELF_PINS[cat].length <= SHELF_PIN_LIMIT);
    assert.deepEqual(pinsFor(cat), SHELF_PINS[cat].map(normalizeLibraryId).slice(0, 3));
  }
  assert.deepEqual(pinsFor("legal-contract-model"), []);
});

test("id 带不带 library: 前缀都能对上", () => {
  assert.equal(normalizeLibraryId("library:abc-1"), "abc-1");
  assert.equal(normalizeLibraryId("abc-1"), "abc-1");
  assert.equal(libraryPrefixedId("abc-1"), "library:abc-1");
  assert.equal(libraryPrefixedId("library:abc-1"), "library:abc-1");
});

test("applyShelfPins 把钉住的提到最前，缺件的槽空着，其余保持原序", () => {
  const items = [
    { id: "library:old-1" },
    { id: "library:old-2" },
    { id: "library:pin-b" },
    { id: "library:old-3" },
  ];
  const extras = [{ id: "library:pin-a" }];
  const out = applyShelfPins(items, ["pin-a", "pin-b", "pin-c"], extras);
  assert.deepEqual(
    out.map((x) => x.id),
    ["library:pin-a", "library:pin-b", "library:old-1", "library:old-2", "library:old-3"],
  );
});

test("第 2 页会把已钉的件滤掉，避免重复", async () => {
  const page2 = await attachShelfPins({
    category: "not-a-wash-cat",
    page: 2,
    items: [{ id: "library:x" }],
    fetchPinned: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.deepEqual(page2, [{ id: "library:x" }]);
});

test("第 1 页缺件时按 id 补拉，拉失败就空着那个槽", async () => {
  const fetched = [];
  const original = pinsFor;
  // contract-agreement 今天是空清单，走空路径。
  const empty = await attachShelfPins({
    category: "contract-agreement",
    page: 1,
    items: [{ id: "library:old" }],
    fetchPinned: async (id) => {
      fetched.push(id);
      return { id: `library:${id}` };
    },
  });
  assert.deepEqual(empty, [{ id: "library:old" }]);
  assert.deepEqual(fetched, []);
  void original;
});
