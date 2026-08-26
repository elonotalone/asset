// asset 站是纯素材展示站：共享外壳带进来的助手浮窗和账户菜单会链到已删除路由。
//
//   node --import ./tests/register-tsx.mjs --test tests/site-chrome.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/SiteShell.tsx", import.meta.url), "utf8");
const local = readFileSync(new URL("../components/AssetSiteShell.tsx", import.meta.url), "utf8");

test("根布局不再挂 LeoAssistant 浮窗", () => {
  assert.doesNotMatch(layout, /LeoAssistant/);
  assert.doesNotMatch(layout, /@oceanleo\/ui\/shell/);
});

test("SiteShell 不再把账户/余额/退出交给共享 AppShell", () => {
  assert.equal(shell.includes('from "@/components/AppShell"'), false);
  assert.doesNotMatch(shell, /userEmail/);
  assert.doesNotMatch(shell, /getCredits/);
  assert.doesNotMatch(shell, /onSignOut/);
  assert.doesNotMatch(shell, /signOutEverywhere/);
  assert.doesNotMatch(shell, /\/account/);
  assert.doesNotMatch(shell, /\/settings/);
  assert.match(shell, /AssetSiteShell/);
});

test("本地外壳不渲染账户按钮、余额胶囊、我的应用轨", () => {
  const code = local.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /["'`]\/account/);
  assert.doesNotMatch(code, /["'`]\/settings/);
  assert.doesNotMatch(code, /["'`]\/cost/);
  assert.doesNotMatch(code, /accountHref/);
  assert.doesNotMatch(code, /MyAppsRail/);
  assert.doesNotMatch(code, /token 余额/);
  assert.doesNotMatch(code, /credits/);
  assert.match(local, /showUserMenu/);
});
