import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@oceanleo/ui/i18n/provider.js";

import { PluginGallery } from "@/components/PluginGallery";
import { PluginGalleryDetail } from "@/components/PluginGalleryDetail";
import * as galleryModule from "@/lib/plugin-gallery";
import {
  FORBIDDEN_ACTION_LABELS,
  FORBIDDEN_LINK_PATTERNS,
  PLUGIN_CATEGORIES,
  PLUGIN_GALLERY_POLICY,
  PLUGIN_ITEMS,
  editorAccessForPlugin,
  filterAvailablePlugins,
  filterPlugins,
  findPlugin,
  isEditorEntrypointUrl,
  pluginDetailHref,
  pluginIsAvailable,
} from "@/lib/plugin-gallery";

/**
 * 2026-08-19：22 件独立小工具整体下架，这一格只剩编辑器。
 *
 * 这份自测的第一职责因此换了个方向：以前证「22 件都在、都点得开」，现在证
 * **它们一件不剩**——数据、字节、封面、隔离域入口与源码分支都没了。判据来自
 * 操作员：办公追求简洁明确，独立小工具全部下架，编辑器全部留下。
 */
const RETIRED_IDS = [
  "annotatable-city-map",
  "interactive-globe",
  "floorplan-annotation",
  "ledger-register",
  "three-statement-model",
  "metrics-dashboard",
  "financial-calculator",
  "medical-calculator",
  "legal-calculator",
  "unit-converter",
  "literature-matrix",
  "search-query-builder",
  "concept-knowledge-graph",
  "self-test-quiz",
  "spaced-repetition-scheduler",
  "formula-derivation-walkthrough",
  "relationship-graph",
  "executable-notebook",
  "contract-assembly",
  "dialogue-branch-script",
  "voiceover-script",
  "world-map",
] as const;

const KEPT_IDS = [
  "image-editor",
  "design-canvas",
  "chart-editor",
  "richdoc-editor",
  "grid-editor",
  "deck-editor",
  "pdf-editor",
  "video-timeline",
  "audio-editor",
  "model-3d-editor",
  "website-editor",
  "game-editor",
  "workflow-canvas",
] as const;

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

test("13 件全部是编辑器，逐件列得出", () => {
  assert.equal(PLUGIN_ITEMS.length, 13);
  assert.deepEqual(
    PLUGIN_ITEMS.map((item) => item.id),
    [...KEPT_IDS],
    "保留清单变了；改它之前先改 docs/specs/oceanleo-plugins-v1/01-classification.md",
  );

  const ids = new Set<string>();
  for (const item of PLUGIN_ITEMS) {
    assert.equal(ids.has(item.id), false, `重复 id: ${item.id}`);
    ids.add(item.id);
    assert.equal(findPlugin(item.id)?.id, item.id);
    assert.match(listHtml, new RegExp(`href="/plugin-gallery/${item.id}"`));
    assert.ok(listHtml.includes(item.name), `列表缺卡片: ${item.name}`);
    // 编辑器的定义就是「先有一件素材」：每一件都必须有适配器与逐件接入结论。
    assert.ok(item.adapter, `${item.id} 没有适配器，它就不是编辑器`);
    assert.ok(editorAccessForPlugin(item), `${item.id} 没有逐件接入结论`);
  }
});

test("22 件独立小工具在数据层一件不剩", () => {
  for (const id of RETIRED_IDS) {
    assert.equal(findPlugin(id), null, `${id} 还在数据里`);
    assert.equal(
      listHtml.includes(`/plugin-gallery/${id}`),
      false,
      `${id} 还在列表里留着链接`,
    );
    assert.equal(
      filterPlugins({ text: id }).length,
      0,
      `${id} 还能被搜出来`,
    );
  }

  const rawJson = readFileSync("content/plugin-gallery.json", "utf8");
  assert.equal(
    rawJson.includes("standalone"),
    false,
    "JSON 里还留着 standalone 这一类",
  );
  for (const id of RETIRED_IDS) {
    assert.equal(rawJson.includes(id), false, `JSON 里还留着 ${id}`);
  }

  // 类别表也得跟着缩：出行与空间、财务与经营这些只服务独立小工具的类别不该留着。
  assert.equal(PLUGIN_CATEGORIES.length, 4);
  assert.deepEqual(
    PLUGIN_CATEGORIES.map((category) => category.id),
    ["visual-editor", "doc-editor", "media-editor", "source-editor"],
  );
  for (const category of PLUGIN_CATEGORIES) {
    assert.ok(
      PLUGIN_ITEMS.some((item) => item.category === category.id),
      `${category.id} 是空类别`,
    );
  }
});

test("22 件的运行字节、自测与封面在磁盘上一件不剩", () => {
  assert.equal(existsSync("content/active-runtime/plugin"), false);
  assert.equal(existsSync("tests/plugin-gallery-runtime"), false);
  assert.equal(existsSync("public/previews/tools"), false);
  // manifest 只登记那 22 个目录，目录没了它就是一份指向空处的名册。
  assert.equal(existsSync("content/active-runtime/manifest.plugin.json"), false);

  // 游戏与网站的运行物不是这一波的对象，必须原样还在——否则就是误删。
  assert.equal(existsSync("content/active-runtime/game"), true);
  assert.equal(existsSync("content/active-runtime/website"), true);
  assert.equal(existsSync("content/active-runtime/manifest.game-website.json"), true);

  // 根目录两份名册以前漏改：清单仍指向已不存在的 plugin/ 目录。
  const rootManifest = JSON.parse(
    readFileSync("active-runtime-manifest.json", "utf8"),
  ) as { items: { id: string; kind: string }[] };
  const rootPlan = JSON.parse(readFileSync("active-runtime-plan.json", "utf8")) as {
    items: { item: { id: string; kind: string } }[];
  };
  for (const item of rootManifest.items) {
    assert.notEqual(
      item.kind,
      "plugin",
      `根名册 active-runtime-manifest.json 仍登记 plugin ${item.id}：名册漏改会让 verify 指向空处`,
    );
  }
  for (const entry of rootPlan.items) {
    assert.notEqual(
      entry.item.kind,
      "plugin",
      `根名册 active-runtime-plan.json 仍登记 plugin ${entry.item.id}：名册漏改会让 verify 指向空处`,
    );
  }
  for (const id of RETIRED_IDS) {
    const runtimeId = `${id}-01`;
    assert.equal(
      rootManifest.items.some((item) => item.id === runtimeId || item.id === id),
      false,
      `根名册 active-runtime-manifest.json 仍出现 ${runtimeId}：名册漏改会让 verify 指向空处`,
    );
    assert.equal(
      rootPlan.items.some((entry) => entry.item.id === runtimeId || entry.item.id === id),
      false,
      `根名册 active-runtime-plan.json 仍出现 ${runtimeId}：名册漏改会让 verify 指向空处`,
    );
  }
});

test("隔离域运行入口连接收端都拆干净了", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  // UC-3: 同文档 §8.3
  // 没有条目要在隔离域里跑，就不该留着一个能被重新接上的入口判定。
  assert.equal(existsSync("app/plugin-gallery/runtime-plan.ts"), false);
  assert.equal(existsSync("components/PluginGalleryRunner.tsx"), false);
  assert.equal(existsSync("app/plugin-gallery/runtime"), false);
  assert.equal(existsSync("app/plugin-gallery/runtime-registry.ts"), false);

  // 判据是模块导出，不是注释：注释里写「已经拆了 oceanleo.app 入口」是交代，
  // 导出一个还能被重新接上的判定才是问题。
  const exported = galleryModule as unknown as Record<string, unknown>;
  for (const gone of [
    "isPluginRuntimeUrl",
    "pluginRuntimeDescriptors",
    "runtimeForPlugin",
    "runtimePluginIds",
    "PluginKind",
    "KIND_LABELS",
    "KIND_HINTS",
    "categoriesForKind",
  ]) {
    assert.equal(exported[gone], undefined, `${gone} 还导出着`);
  }

  for (const name of [
    "lib/plugin-gallery.ts",
    "components/PluginGalleryDetail.tsx",
    "components/PluginGallery.tsx",
  ]) {
    const source = readFileSync(name, "utf8");
    assert.doesNotMatch(source, /<iframe\b|srcdoc=|sandbox=/i, name);
    assert.doesNotMatch(
      source,
      /NEXT_PUBLIC_PLUGIN_SANDBOX_ORIGIN|pluginRuntimeSrc|pluginSandboxOrigin/,
      name,
    );
    // 反斜杠点只可能出现在正则字面量里，散文里写不出来。
    assert.doesNotMatch(source, /oceanleo\\\.app/, name);
    assert.doesNotMatch(source, /\[0-9a-f\]\{32\}/, name);
  }

  // 渲染结果里一个指向隔离域的**可点地址**都不该出现。正文里说明「用户生成的网站
  // 只在 oceanleo.app 隔离域运行」是交代事实，不是入口。
  for (const html of [listHtml, ...detailHtml]) {
    assert.doesNotMatch(html, /<iframe\b|srcdoc=/i);
    for (const attr of [
      ...html.matchAll(/(?:href|src|action|formaction)="([^"]*)"/gi),
    ]) {
      assert.doesNotMatch(
        attr[1],
        /oceanleo\.app/i,
        `出现了指向隔离域的可点地址: ${attr[1]}`,
      );
    }
  }
});

test("UC-3 编辑器入口只接受逐条核验的第一方产品页", () => {
  // UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md §8.3
  // 信任只能来自硬编码白名单，绝不能从主机名后缀推断。
  assert.equal(
    isEditorEntrypointUrl("https://video.oceanleo.com/canvas-board"),
    true,
  );
  for (const rejected of [
    "http://video.oceanleo.com/canvas-board",
    "https://video.oceanleo.com/canvas-board/",
    "https://video.oceanleo.com/canvas-board?blank=1",
    "https://video.oceanleo.com/canvas-board#x",
    "https://video.oceanleo.com.evil.com/canvas-board",
    "https://website.oceanleo.com/embed/site-editor",
    "https://design.oceanleo.com/embed/editor",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed",
    "https://plugins.oceanleo.app/unit-converter-01/",
  ]) {
    assert.equal(isEditorEntrypointUrl(rejected), false, rejected);
  }
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
        href.startsWith("/plugin-gallery") ||
          href.startsWith("/works/") ||
          isEditorEntrypointUrl(href),
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

test("可用性只由已核验的编辑器入口算出", () => {
  const rawData = JSON.parse(readFileSync("content/plugin-gallery.json", "utf8")) as {
    items: Record<string, unknown>[];
  };
  for (const item of rawData.items) {
    assert.equal(Object.hasOwn(item, "status"), false, "JSON 不得手写可用状态");
    assert.equal(Object.hasOwn(item, "available"), false, "JSON 不得手写可用结论");
    assert.equal(Object.hasOwn(item, "runtimeUrl"), false, "JSON 不得手写运行地址");
    assert.equal(Object.hasOwn(item, "entryUrl"), false, "JSON 不得手写编辑器入口");
  }

  const adapters = PLUGIN_ITEMS.map((item) => item.adapter);
  assert.equal(new Set(adapters).size, PLUGIN_ITEMS.length, "两条目撞了同一个适配器");
  for (const item of PLUGIN_ITEMS) {
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
    filterAvailablePlugins(PLUGIN_ITEMS).map((item) => item.id),
    ["workflow-canvas"],
  );

  for (const item of PLUGIN_ITEMS) {
    assert.ok(item.statusNote.length >= 30, `${item.id} 的能力依据不完整`);
    assert.ok(item.specPath.startsWith("docs/specs/oceanleo-plugins-v1/"));
    // 22 件的设计文档已随它们一起下架，保留的必须全指到 editors/。
    assert.match(item.specPath, /^docs\/specs\/oceanleo-plugins-v1\/editors\//);
  }
});

test("UC-3 13 格逐格都有可点入口或说清楚的下一步", () => {
  // UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md §8.3
  // 入口只能是逐条核验过的第一方产品页；没有核验过的入口时页面必须如实说明缺口，
  // 绝不允许退回本站地址或任意 oceanleo.app 主机。
  for (const item of PLUGIN_ITEMS) {
    const access = editorAccessForPlugin(item);
    assert.ok(access, `${item.id} 没有编辑器接入结论`);
    const html = render(<PluginGalleryDetail item={item} />);
    assert.match(html, new RegExp(`href="${access.demoHref}"`));
    if (isEditorEntrypointUrl(access.entryUrl)) {
      assert.match(html, new RegExp(`href="${access.entryUrl}"`));
      assert.match(html, /target="_blank"/);
      assert.match(html, /rel="noopener noreferrer"/);
      assert.match(html, />打开使用<\/a>/);
    } else {
      assert.ok(html.includes(access.unavailableReason));
      assert.ok(html.includes(access.nextStep));
      assert.match(html, /暂不能匿名直达/);
    }
  }
});

test("统计与只看可用筛选共用同一份入口判定", () => {
  assert.deepEqual(
    filterAvailablePlugins(PLUGIN_ITEMS).map((item) => item.id),
    ["workflow-canvas"],
  );
  assert.match(listHtml, /共 13 件，全部是编辑器/);
  assert.match(listHtml, /1 件现在有经过核验的使用入口；12 件入口尚未接通/);
});

test("开场白说清这里是平台能干的活，不是小工具集市", () => {
  assert.ok(listHtml.includes("不是小工具集市"), "开场白没说清这一格是什么");
  assert.ok(
    listHtml.includes("独立小工具已经整体下架"),
    "没有如实交代 22 件去哪了",
  );
  // 「工具能力」这种行话不该再出现在标题上。
  assert.ok(listHtml.includes("平台能干的活"));
});

/** `public/` 下的任何东西都能被直接 GET 到，不需要经过页面。 */
function publicFiles(): string[] {
  if (!existsSync("public")) return [];
  return readdirSync("public", { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => statSync(path.join("public", entry)).isFile());
}

test("public 里没有一件下架工具的残留", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  // 「界面上没有下载按钮」不等于「下不到」：运行字节必须完全移出 public。
  const files = publicFiles();
  assert.ok(files.length > 0, "public 读空了，这条检查会假绿");
  assert.equal(
    files.some((file) => file.startsWith("works/plugin/")),
    false,
    "旧同源 runtime 路径仍有可公开文件",
  );
  assert.equal(
    files.some((file) => file.startsWith("previews/tools/")),
    false,
    "封面还在 public 里",
  );

  const ids = new Set<string>(PLUGIN_ITEMS.map((item) => item.id));
  for (const file of files) {
    const name = path.basename(file).toLowerCase();
    assert.doesNotMatch(
      file.toLowerCase(),
      /(^|\/)plugin/,
      `public 下出现了插件相关文件: ${file}`,
    );
    const stem = name.replace(/\.[^.]+$/, "");
    assert.equal(ids.has(stem), false, `public 下出现了以工具 id 命名的文件: ${file}`);
    for (const retired of RETIRED_IDS) {
      assert.equal(
        file.toLowerCase().includes(retired),
        false,
        `public 下还留着下架工具的文件: ${file}`,
      );
    }
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

// 上面几条量的是组件渲染结果与磁盘。真正发给用户的是**整页**：站点外壳、左栏、
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

test("下架的 22 条详情地址真的 404 了", async (t) => {
  if (!servedBaseUrl) {
    t.skip("没给 PLUGIN_GALLERY_BASE_URL");
    return;
  }
  for (const id of RETIRED_IDS) {
    const response = await fetch(`${servedBaseUrl}${pluginDetailHref(id)}`);
    assert.equal(response.status, 404, `${id} 的详情页还打得开`);
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
    "/previews/tools/unit-converter-01.cover.webp",
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
  assert.equal(filterPlugins().length, 13);

  const doc = filterPlugins({ category: "doc-editor" });
  assert.equal(doc.length, 4);
  assert.ok(doc.every((item) => item.category === "doc-editor"));
  assert.equal(
    PLUGIN_CATEGORIES.reduce(
      (total, category) => total + filterPlugins({ category: category.id }).length,
      0,
    ),
    13,
    "每件只能落在一个类别里",
  );

  // 搜「你想干的事」而不是工具名，也要搜得到。
  assert.ok(
    filterPlugins({ text: "字幕" }).some((item) => item.id === "video-timeline"),
  );
  assert.ok(
    filterPlugins({ text: "台账" }).some((item) => item.id === "grid-editor"),
    "表格编辑器明说了「不会被套成台账」，搜台账应当落到它身上",
  );
  assert.ok(filterPlugins({ text: "台账" }).length < PLUGIN_ITEMS.length);
  assert.equal(filterPlugins({ text: "这个词不该命中任何工具" }).length, 0);
});
