import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@oceanleo/ui/i18n/provider.js";

import { PluginGallery } from "@/components/PluginGallery";
import { PluginGalleryDetail } from "@/components/PluginGalleryDetail";
import { PluginGalleryRunner } from "@/components/PluginGalleryRunner";
import { pluginRuntimeDescriptorsFrom } from "@/app/plugin-gallery/runtime-plan";
import {
  FORBIDDEN_ACTION_LABELS,
  FORBIDDEN_LINK_PATTERNS,
  PLUGIN_CATEGORIES,
  PLUGIN_GALLERY_POLICY,
  PLUGIN_ITEMS,
  editorAccessForPlugin,
  filterPlugins,
  findPlugin,
  isEditorEntrypointUrl,
  isPluginRuntimeUrl,
  pluginDetailHref,
  pluginIsAvailable,
} from "@/lib/plugin-gallery";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <I18nProvider locale="zh" messages={{}}>
      {node}
    </I18nProvider>,
  );
}

/** 每一个 <a href> 与 <button> 的可见文字，用来判断有没有可点的下载入口。 */
function interactiveLabels(html: string): string[] {
  const labels: string[] = [];
  for (const match of html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    labels.push(match[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
  }
  return labels;
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

const listHtml = render(<PluginGallery />);
const detailHtml = PLUGIN_ITEMS.map((item) =>
  render(<PluginGalleryDetail item={item} />),
);
const pluginManifest = JSON.parse(
  readFileSync("content/active-runtime/manifest.plugin.json", "utf8"),
);
const runtimeHostById: Record<string, string> = Object.fromEntries(
  pluginManifest.items.map((item: Record<string, unknown>, index: number) => [
    String(item.id),
    `s-${(index + 1).toString(16).padStart(32, "0")}.oceanleo.app`,
  ]),
);
const validPlan = {
  schema: "oceanleo.active-runtime-plan.v1",
  manifest: "active-runtime-manifest.json",
  manifestSha256: "a".repeat(64),
  itemCount: pluginManifest.items.length,
  totalBytes: pluginManifest.items.length,
  items: pluginManifest.items.map((item: Record<string, unknown>) => {
    const host = runtimeHostById[String(item.id)];
    return {
      item,
      host,
      entryUrl: `https://${host}/embed`,
      closureSha256: "b".repeat(64),
      fileCount: 1,
      totalBytes: 1,
      files: [{ path: "index.html", sha256: "c".repeat(64), bytes: 1 }],
    };
  }),
};

test("34 件工具全部列得出，且每件都点得开", () => {
  assert.equal(PLUGIN_ITEMS.length, 34);
  assert.equal(PLUGIN_ITEMS.filter((item) => item.kind === "standalone").length, 21);
  assert.equal(PLUGIN_ITEMS.filter((item) => item.kind === "editor").length, 13);

  const ids = new Set<string>();
  for (const item of PLUGIN_ITEMS) {
    assert.equal(ids.has(item.id), false, `重复 id: ${item.id}`);
    ids.add(item.id);
    assert.equal(findPlugin(item.id)?.id, item.id);
    assert.match(listHtml, new RegExp(`href="/plugin-gallery/${item.id}"`));
    assert.ok(listHtml.includes(item.name), `列表缺卡片: ${item.name}`);
  }
});

test("21 份独立工具规格保留，manifest runtime 与规格逐一对应", () => {
  assert.equal(PLUGIN_ITEMS.filter((item) => item.kind === "standalone").length, 21);
  assert.equal(pluginManifest.schema, "oceanleo.active-runtime-manifest.v1");
  assert.ok(pluginManifest.items.length >= 3);
  assert.ok(pluginManifest.items.every((item: { kind: string }) => item.kind === "plugin"));

  const descriptors = pluginRuntimeDescriptorsFrom(pluginManifest, validPlan);
  assert.deepEqual(
    descriptors.map(({ pluginId, runtimeId }) => ({ pluginId, runtimeId })),
    pluginManifest.items.map((item: { id: string }) => ({
      pluginId: item.id.replace(/-\d+$/, ""),
      runtimeId: item.id,
    })),
  );
  assert.ok(descriptors.every((descriptor) => isPluginRuntimeUrl(descriptor.runtimeUrl)));
  assert.ok(
    pluginRuntimeDescriptorsFrom(pluginManifest, null).every(
      (descriptor) => descriptor.runtimeUrl === null,
    ),
    "缺 plan 侧车时必须保留 cover 但关闭运行入口",
  );
  const tamperedPlan = structuredClone(validPlan);
  tamperedPlan.items[0].entryUrl += "?unexpected=1";
  const tamperedDescriptors = pluginRuntimeDescriptorsFrom(pluginManifest, tamperedPlan);
  const firstRuntimeId = String(pluginManifest.items[0].id);
  assert.equal(
    tamperedDescriptors.find(
      (descriptor) => descriptor.runtimeId === firstRuntimeId,
    )?.runtimeUrl,
    null,
  );
  assert.ok(
    tamperedDescriptors
      .filter((descriptor) => descriptor.runtimeId !== firstRuntimeId)
      .every((descriptor) => isPluginRuntimeUrl(descriptor.runtimeUrl)),
  );
  const escapedPlan = structuredClone(validPlan);
  escapedPlan.items[1].files[0].path = "../index.html";
  const secondRuntimeId = String(pluginManifest.items[1].id);
  assert.equal(
    pluginRuntimeDescriptorsFrom(pluginManifest, escapedPlan).find(
      (descriptor) => descriptor.runtimeId === secondRuntimeId,
    )?.runtimeUrl,
    null,
  );

  for (const item of pluginManifest.items as { source: string }[]) {
    assert.deepEqual(readdirSync(item.source).sort(), [
      "engine.js",
      "index.html",
      "style.css",
      "ui.js",
    ]);
    for (const file of readdirSync(item.source)) {
      assert.equal(lstatSync(path.join(item.source, file)).isSymbolicLink(), false);
      assert.equal(lstatSync(path.join(item.source, file)).isFile(), true);
    }
  }
});

test("UC-1 runtime URL 只接受精确 namespace-C /embed", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  const valid =
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed";
  assert.equal(isPluginRuntimeUrl(valid), true);
  for (const rejected of [
    "/plugin-gallery/runtime/unit-converter-01/index.html",
    "http://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed",
    "https://oceanleo.app/embed",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.com/embed",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app.evil.com/embed",
    "https://user@s-0123456789abcdef0123456789abcdef.oceanleo.app/embed",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app:443/embed",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed?x=1",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed#x",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed/",
    "https://s-0123456789ABCDEF0123456789ABCDEF.oceanleo.app/embed",
  ]) {
    assert.equal(isPluginRuntimeUrl(rejected), false, rejected);
  }
});

test("详情只给真实 cover 与安全新窗口入口，歪 URL 时 fail-closed", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  const item = findPlugin("unit-converter");
  assert.ok(item);
  const valid =
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed";
  const preview = "/previews/tools/unit-converter-01.cover.webp";
  const openHtml = render(
    <PluginGalleryRunner item={item} previewPath={preview} runtimeUrl={valid} />,
  );
  assert.match(openHtml, new RegExp(`src="${preview}"`));
  assert.match(openHtml, new RegExp(`href="${valid}"`));
  assert.match(openHtml, /target="_blank"/);
  assert.match(openHtml, /rel="noopener noreferrer"/);
  assert.match(openHtml, />打开使用<\/a>/);
  assert.doesNotMatch(openHtml, /<iframe\b|srcdoc=/i);
  assert.doesNotMatch(openHtml, /\bdownload(?:=|\s|>)/i);

  const closedHtml = render(
    <PluginGalleryRunner
      item={item}
      previewPath={preview}
      runtimeUrl="/plugin-gallery/runtime/unit-converter-01/index.html"
    />,
  );
  assert.match(closedHtml, /暂不可用/);
  assert.doesNotMatch(closedHtml, /<a\b|<iframe\b/i);
  assert.doesNotMatch(closedHtml, /\/plugin-gallery\/runtime\//);
});

test("卡片与详情有实质内容，不是一行标题", () => {
  for (const item of PLUGIN_ITEMS) {
    assert.ok(item.summary.length >= 20, `${item.id} 的一句话太短`);
    assert.ok(item.does.length >= 2, `${item.id} 没说清能用它干什么`);
    assert.ok(item.scenarios.length >= 1, `${item.id} 没有适用场景`);
    assert.ok(item.input.length >= 8 && item.output.length >= 8);
    assert.ok(item.firstOpen.length >= 20);
    assert.ok(item.where.length >= 8);
    assert.ok(PLUGIN_CATEGORIES.some((entry) => entry.id === item.category));
  }

  const html = render(<PluginGalleryDetail item={PLUGIN_ITEMS[0]} />);
  for (const line of [...PLUGIN_ITEMS[0].does, ...PLUGIN_ITEMS[0].scenarios]) {
    assert.ok(html.includes(line), `详情页漏掉一条: ${line}`);
  }
  assert.ok(html.includes(PLUGIN_ITEMS[0].input));
  assert.ok(html.includes(PLUGIN_ITEMS[0].output));
  assert.ok(html.includes(PLUGIN_ITEMS[0].firstOpen));
  assert.ok(html.includes(PLUGIN_ITEMS[0].where));
});

test("任何路径都没有下载或安装入口", () => {
  assert.equal(PLUGIN_GALLERY_POLICY.downloadable, false);

  // ① 数据层：没有任何指向文件的字段。
  const rawJson = readFileSync("content/plugin-gallery.json", "utf8");
  const dataKeys = new Set<string>();
  JSON.parse(rawJson, function collect(key) {
    if (key) dataKeys.add(key);
    // eslint-disable-next-line prefer-rest-params
    return arguments[1];
  });
  for (const banned of [
    "url",
    "href",
    "downloadUrl",
    "download_url",
    "file",
    "package",
    "installUrl",
    "artifactUrl",
    "bytes",
    "size",
  ]) {
    assert.equal(dataKeys.has(banned), false, `数据里出现了文件字段: ${banned}`);
  }

  // ② 界面层：没有一个可点的下载/安装入口，也没有一条链接指向文件。
  for (const html of [listHtml, ...detailHtml]) {
    for (const label of interactiveLabels(html)) {
      for (const word of FORBIDDEN_ACTION_LABELS) {
        assert.equal(
          label.toLowerCase().includes(word.toLowerCase()),
          false,
          `出现了可点的下载入口: ${label}`,
        );
      }
    }
    for (const href of hrefs(html)) {
      assert.ok(
        href.startsWith("/plugin-gallery"),
        `出现了指向站外或文件的链接: ${href}`,
      );
      for (const pattern of FORBIDDEN_LINK_PATTERNS) {
        assert.equal(
          href.toLowerCase().includes(pattern),
          false,
          `链接指向了一个文件: ${href}`,
        );
      }
    }
    assert.doesNotMatch(html, /<a\b[^>]*\bdownload\b/i);
    assert.doesNotMatch(html, /blob:|data:application/i);
  }
});

test("可用性只由 runtime descriptor 或已核验编辑器入口算出", () => {
  const rawData = JSON.parse(readFileSync("content/plugin-gallery.json", "utf8")) as {
    items: Record<string, unknown>[];
  };
  for (const item of rawData.items) {
    assert.equal(Object.hasOwn(item, "status"), false, "JSON 不得手写可用状态");
    assert.equal(Object.hasOwn(item, "available"), false, "JSON 不得手写可用结论");
    assert.equal(Object.hasOwn(item, "runtimeUrl"), false, "JSON 不得手写运行地址");
    assert.equal(Object.hasOwn(item, "entryUrl"), false, "JSON 不得手写编辑器入口");
  }

  const oneRuntime = new Set(["unit-converter"]);
  for (const item of PLUGIN_ITEMS.filter((entry) => entry.kind === "standalone")) {
    assert.equal(item.adapter, undefined, `${item.id} 不该有编辑器适配器`);
    assert.equal(pluginIsAvailable(item, []), false, `${item.id} 不得脱离 plan 判可用`);
    assert.equal(
      pluginIsAvailable(item, oneRuntime),
      item.id === "unit-converter",
      `${item.id} 没有按 runtime descriptor 判定`,
    );
  }

  const editors = PLUGIN_ITEMS.filter((entry) => entry.kind === "editor");
  const adapters = editors.map((item) => item.adapter);
  assert.equal(new Set(adapters).size, editors.length, "两条目撞了同一个适配器");
  for (const item of editors) {
    const access = editorAccessForPlugin(item);
    assert.ok(access, `${item.id} 没有逐件接入结论`);
    assert.equal(access.adapter, item.adapter);
    assert.match(access.demoHref, /^\/works\/[a-z0-9-]+$/);
    assert.ok(access.demoName.length >= 2, `${item.id} 没有真实演示素材名`);
    assert.equal(pluginIsAvailable(item), isEditorEntrypointUrl(access.entryUrl));
    if (access.entryUrl === null) {
      assert.ok(access.unavailableReason.length >= 20, `${item.id} 没说清直达缺口`);
      assert.ok(access.nextStep.length >= 20, `${item.id} 没给下一步`);
    }
  }
  assert.deepEqual(
    editors.filter((item) => pluginIsAvailable(item)).map((item) => item.id),
    ["workflow-canvas"],
  );

  for (const item of PLUGIN_ITEMS) {
    assert.ok(item.statusNote.length >= 30, `${item.id} 的能力依据不完整`);
    assert.ok(item.specPath.startsWith("docs/specs/oceanleo-plugins-v1/"));
  }
});

/** `public/` 下的任何东西都能被直接 GET 到，不需要经过页面。 */
function publicFiles(): string[] {
  if (!existsSync("public")) return [];
  return readdirSync("public", { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => statSync(path.join("public", entry)).isFile());
}

test("public 只保留安全 cover，不含插件 HTML/JS/CSS", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  // 「界面上没有下载按钮」不等于「下不到」：运行字节必须完全移出 public。
  const files = publicFiles();
  assert.ok(files.length > 0, "public 读空了，这条检查会假绿");
  assert.equal(
    files.some((file) => file.startsWith("works/plugin/")),
    false,
    "旧同源 runtime 路径仍有可公开文件",
  );

  const ids = new Set(PLUGIN_ITEMS.map((item) => item.id));
  for (const file of files) {
    const name = path.basename(file).toLowerCase();
    assert.doesNotMatch(
      file.toLowerCase(),
      /(^|\/)plugin/,
      `public 下出现了插件相关文件: ${file}`,
    );
    const stem = name.replace(/\.[^.]+$/, "");
    assert.equal(ids.has(stem), false, `public 下出现了以工具 id 命名的文件: ${file}`);
  }

  const expectedCovers = pluginManifest.items.map(
    (item: { id: string }) => `previews/tools/${item.id}.cover.webp`,
  );
  for (const cover of expectedCovers) {
    assert.ok(files.includes(cover), `缺真实 cover: ${cover}`);
    assert.ok(statSync(path.join("public", cover)).size > 0, `cover 是空文件: ${cover}`);
  }
  for (const runtimeId of Object.keys(runtimeHostById)) {
    const executable = files.filter(
      (file) =>
        file.includes(runtimeId) && /\.(?:html?|m?js|cjs|css)$/i.test(file),
    );
    assert.deepEqual(executable, [], `${runtimeId} 的运行字节仍在 public`);
  }

  // 数据本身也不许被静态托管：它在仓库根的 content/ 下，构建期 import 进包，
  // 不经过 public，所以没有一个 URL 指得到它。
  assert.ok(existsSync("content/plugin-gallery.json"));
  assert.equal(existsSync("public/content"), false);
  assert.equal(existsSync("public/plugin-gallery.json"), false);
  assert.equal(
    files.some((file) => file.toLowerCase().endsWith("plugin-gallery.json")),
    false,
  );
});

test("UC-1 源码锁死无 iframe、无同源 runtime 路由、无 fallback", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  assert.equal(existsSync("app/plugin-gallery/runtime/[...path]/route.ts"), false);
  assert.equal(existsSync("app/plugin-gallery/runtime-registry.ts"), false);

  const runner = readFileSync("components/PluginGalleryRunner.tsx", "utf8");
  assert.doesNotMatch(runner, /<iframe\b|srcdoc=|sandbox=/i);
  assert.match(runner, /target="_blank"/);
  assert.match(runner, /rel="noopener noreferrer"/);

  const dataLayer = readFileSync("lib/plugin-gallery.ts", "utf8");
  assert.doesNotMatch(
    dataLayer,
    /NEXT_PUBLIC_PLUGIN_SANDBOX_ORIGIN|pluginRuntimeSrc|pluginSandboxOrigin/,
  );
  assert.doesNotMatch(dataLayer, /return\s+origin\s*\?/);
  assert.match(
    dataLayer,
    /\^https:\\\/\\\/s-\[0-9a-f\]\{32\}\\\.oceanleo\\\.app\\\/embed\$/,
  );
});

// 上面两条量的是组件渲染结果与磁盘。真正发给用户的是**整页**：站点外壳、左栏、
// 共享包的组件都在里面，我这两个组件只是其中一块。所以还要对着一个真在跑的
// 服务器把每条 URL 走一遍。这是非浏览器的 HTTP 检查，不是浏览器验证。
//
//   PLUGIN_GALLERY_BASE_URL=http://127.0.0.1:3210 \
//     node --import ./tests/register-tsx.mjs --test tests/plugin-gallery.test.tsx
const servedBaseUrl = process.env.PLUGIN_GALLERY_BASE_URL || "";

test("真正发出去的整页上也没有下载入口", async (t) => {
  if (!servedBaseUrl) {
    t.skip(
      "没给 PLUGIN_GALLERY_BASE_URL：起一个 next dev/start，再带这个变量重跑本文件",
    );
    return;
  }

  const paths = ["/plugin-gallery", ...PLUGIN_ITEMS.map((item) => pluginDetailHref(item.id))];
  for (const urlPath of paths) {
    const response = await fetch(`${servedBaseUrl}${urlPath}`);
    assert.equal(response.status, 200, `${urlPath} 打不开`);
    const html = await response.text();

    assert.doesNotMatch(html, /<a\b[^>]*\bdownload\b/i, `${urlPath} 有下载属性`);
    assert.doesNotMatch(html, /blob:|data:application/i, `${urlPath} 有内联文件`);
    for (const href of hrefs(html)) {
      for (const pattern of FORBIDDEN_LINK_PATTERNS) {
        assert.equal(
          href.toLowerCase().includes(pattern),
          false,
          `${urlPath} 的链接指向了一个文件: ${href}`,
        );
      }
    }
    for (const label of interactiveLabels(html)) {
      for (const word of FORBIDDEN_ACTION_LABELS) {
        assert.equal(
          label.toLowerCase().includes(word.toLowerCase()),
          false,
          `${urlPath} 上有可点的下载入口: ${label}`,
        );
      }
    }
  }
});

test("猜路径也 GET 不到这一格的数据", async (t) => {
  if (!servedBaseUrl) {
    t.skip("没给 PLUGIN_GALLERY_BASE_URL");
    return;
  }
  // 数据在仓库根的 content/ 下，构建期 import 进包。这几条是最容易猜的 URL，
  // 都必须打不开——否则「界面上没有按钮」就只是个摆设。
  for (const urlPath of [
    "/content/plugin-gallery.json",
    "/plugin-gallery.json",
    "/plugin-gallery/plugin-gallery.json",
    "/plugin-gallery/image-editor.json",
    "/plugin-gallery/image-editor.zip",
  ]) {
    const response = await fetch(`${servedBaseUrl}${urlPath}`);
    assert.notEqual(response.status, 200, `${urlPath} 居然 GET 得到`);
  }
});

test("用户可见的界面不出现内部概念名「插件」", () => {
  for (const item of PLUGIN_ITEMS) {
    assert.doesNotMatch(item.name, /插件/, `${item.id} 的名字含内部概念名`);
    assert.doesNotMatch(item.summary, /插件/);
  }
  // 标题、卡片与筛选器都不许出现它；状态依据里引用平台的登记表文件名不算界面文案。
  const chrome = listHtml.replace(/<\/?[a-z][^>]*>/gi, " ");
  assert.doesNotMatch(chrome, /插件/);
});

test("搜索与类别筛选真的会缩小结果", () => {
  assert.equal(filterPlugins().length, 34);
  assert.equal(filterPlugins({ kind: "editor" }).length, 13);
  assert.equal(filterPlugins({ kind: "standalone" }).length, 21);

  const calc = filterPlugins({ category: "calc" });
  assert.equal(calc.length, 4);
  assert.ok(calc.every((item) => item.category === "calc"));

  const ledger = filterPlugins({ text: "台账" }).map((item) => item.id);
  assert.ok(ledger.includes("ledger-register"));
  // 表格编辑器也命中，因为它明说了「不会被套成台账」——这正是用户搜这个词时
  // 需要看到的区分，不是误命中。命中面必须比全集小。
  assert.ok(ledger.length < PLUGIN_ITEMS.length);
  // 搜「你想干的事」而不是工具名，也要搜得到。
  assert.ok(
    filterPlugins({ text: "月供" }).some((item) => item.id === "financial-calculator"),
  );
  assert.ok(
    filterPlugins({ text: "字幕" }).some((item) => item.id === "video-timeline"),
  );
  assert.equal(filterPlugins({ text: "这个词不该命中任何工具" }).length, 0);
});
