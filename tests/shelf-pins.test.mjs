// 排前三机制：按标题前缀 / source 钉，缺件跳过。不再写已删除的 uuid。
//
//   node --import ./tests/register-tsx.mjs --test tests/shelf-pins.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import {
  SHELF_PIN_LIMIT,
  WASH_PIN_CATEGORIES,
  normalizeLibraryId,
  libraryPrefixedId,
  matchersFor,
  itemMatchesPin,
  applyMatcherPins,
  applyShelfPins,
  attachShelfPins,
} from "../lib/shelf-pins.ts";

test("八类各有置顶槽，且不再钉 v2 废品 uuid", () => {
  assert.deepEqual([...WASH_PIN_CATEGORIES], [
    "legal-contract-model",
    "legal-diligence",
    "legal-litigation-form",
    "legal-lawyer-template",
    "resume-template",
    "flowchart-diagram",
    "longform-poster",
    "ecommerce-detail",
  ]);
  assert.equal(SHELF_PIN_LIMIT, 3);
  // 合同区整区都是官方原文，没有"本轮新洗的三件"要提到最前，所以不设钉位。
  assert.deepEqual(matchersFor("legal-contract-model"), []);
  assert.deepEqual(matchersFor("legal-litigation-form"), []);
  assert.equal(matchersFor("resume-template").length, 3);
  assert.ok(matchersFor("resume-template").every((m) => m.titlePrefix?.startsWith("OLR-")));
  assert.ok(matchersFor("flowchart-diagram").every((m) => m.source === "oceanleo-flowchart-wash"));
  assert.deepEqual(matchersFor("not-a-wash-cat"), []);
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

test("标题前缀钉把匹配件提前，缺件跳过不拿别人顶上", () => {
  const items = [
    { id: "library:old", title: "旧件" },
    { id: "library:olr2", title: "OLR-0002 唯美四页" },
  ];
  const extras = [{ id: "library:olr1", title: "OLR-0001 创意三页" }];
  const out = applyMatcherPins(items, matchersFor("resume-template"), extras);
  assert.deepEqual(
    out.map((x) => x.id),
    ["library:olr1", "library:olr2", "library:old"],
  );
});

test("source 钉把约定来源提到最前，货还没到就保持原序", () => {
  const empty = applyMatcherPins(
    [{ id: "library:old", source: "other" }],
    matchersFor("longform-poster"),
  );
  assert.deepEqual(empty.map((x) => x.id), ["library:old"]);

  const items = [
    { id: "library:a", source: "other" },
    { id: "library:b", source: "oceanleo-poster-wash" },
    { id: "library:c", source: "oceanleo-poster-wash" },
    { id: "library:d", source: "oceanleo-poster-wash" },
  ];
  const out = applyMatcherPins(items, matchersFor("longform-poster"));
  assert.deepEqual(
    out.map((x) => x.id),
    ["library:b", "library:c", "library:d", "library:a"],
  );
});

test("第 2 页会把已按标题钉的件滤掉；无标题钉的类原样返回", async () => {
  const page2 = await attachShelfPins({
    category: "not-a-wash-cat",
    page: 2,
    items: [{ id: "library:x" }],
    searchPinned: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.deepEqual(page2, [{ id: "library:x" }]);

  const resumePage2 = await attachShelfPins({
    category: "resume-template",
    page: 2,
    items: [
      { id: "library:olr1", title: "OLR-0001 x" },
      { id: "library:other", title: "其它" },
    ],
  });
  assert.deepEqual(
    resumePage2.map((x) => x.id),
    ["library:other"],
  );
});

test("第 1 页缺件时按标题前缀去搜，搜不到就空着那个槽", async () => {
  const fetched = [];
  const out = await attachShelfPins({
    category: "resume-template",
    page: 1,
    items: [{ id: "library:old", title: "旧件" }],
    searchPinned: async (matcher) => {
      fetched.push(matcher.titlePrefix);
      if (matcher.titlePrefix === "OLR-0002") {
        return { id: "library:olr2", title: "OLR-0002 唯美四页" };
      }
      throw new Error("not ingested");
    },
  });
  assert.deepEqual(fetched, ["OLR-0001", "OLR-0002", "OLR-0003"]);
  assert.deepEqual(
    out.map((x) => x.id),
    ["library:olr2", "library:old"],
  );
});

test("itemMatchesPin 认标题前缀和 source", () => {
  assert.equal(
    itemMatchesPin({ id: "1", title: "OLR-0001 简历" }, { titlePrefix: "OLR-0001" }),
    true,
  );
  assert.equal(
    itemMatchesPin({ id: "1", title: "其它" }, { titlePrefix: "OLR-0001" }),
    false,
  );
  assert.equal(
    itemMatchesPin({ id: "1", source: "oceanleo-poster-wash" }, { source: "oceanleo-poster-wash" }),
    true,
  );
});
