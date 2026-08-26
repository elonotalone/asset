// 素材站不再挂耐久成品面。共享包 ResultCanvas 仍在 @oceanleo/ui 里，本仓不许引用。
//
//   node --import ./tests/register-tsx.mjs --test tests/artifact-surface.test.tsx

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const library = readFileSync(new URL("../components/AssetLibrary.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/SiteShell.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("首页素材库不再挂 ResultCanvas / ArtifactShelf / 耐久块", () => {
  assert.doesNotMatch(library, /ResultCanvas/);
  assert.doesNotMatch(library, /ArtifactShelf/);
  assert.doesNotMatch(library, /耐久/);
  assert.doesNotMatch(library, /showContextShelf/);
  assert.doesNotMatch(library, /listCollectionIds|saveToCollection|removeFromCollection/);
});

test("左栏不再有成品 / 插件 / 我的素材库 / 网站模板 / 网页动效", () => {
  assert.doesNotMatch(shell, /href:\s*"\/works"/);
  assert.doesNotMatch(shell, /href:\s*"\/plugin-gallery"/);
  assert.doesNotMatch(shell, /href:\s*"\/collection"/);
  assert.doesNotMatch(shell, /href:\s*"\/templates"/);
  assert.doesNotMatch(shell, /href:\s*"\/elements"/);
  assert.match(shell, /href:\s*"\/licenses"/);
});

test("根布局不再为 /works 海报查看器加载专用字体", () => {
  assert.doesNotMatch(layout, /poster-fonts/);
});
