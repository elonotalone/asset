import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@oceanleo/ui/i18n/provider.js";
import { TRUSTED_EDITOR_REGISTRY } from "@oceanleo/ui/workbench";

import { PluginGallery } from "@/components/PluginGallery";
import { PluginGalleryDetail } from "@/components/PluginGalleryDetail";
import {
  FORBIDDEN_ACTION_LABELS,
  FORBIDDEN_LINK_PATTERNS,
  PLUGIN_CATEGORIES,
  PLUGIN_GALLERY_POLICY,
  PLUGIN_ITEMS,
  filterPlugins,
  findPlugin,
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

/**
 * 平台侧的真相要**跑出来**，不能在源码里搜字符串——源码里出现一个适配器名字，
 * 不代表用户到得了它。`plugin-module.ts` 不在包的 exports 里，只能按真实路径导入。
 */
const { pluginModules } = (await import(
  realpathSync("node_modules/@oceanleo/ui/src/shell/plugin-module.ts")
)) as { pluginModules: () => unknown[] };

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

test("状态如实：未实装的不许伪装成能用，也不给可点入口", () => {
  const shipped = PLUGIN_ITEMS.filter((item) => item.status === "shipped");
  const planned = PLUGIN_ITEMS.filter((item) => item.status === "spec-only");
  assert.equal(shipped.length + planned.length, PLUGIN_ITEMS.length);

  // 21 个非编辑类工具一个都还没实装。判据是**跑一次**平台的 pluginModules()：
  // 它返回空数组，就是说这些工具在任何 app 上都没有入口。
  assert.deepEqual(pluginModules(), []);
  for (const item of PLUGIN_ITEMS.filter((entry) => entry.kind === "standalone")) {
    assert.equal(item.status, "spec-only", `${item.id} 没有入口却标成了已上线`);
    assert.equal(item.adapter, undefined, `${item.id} 不该有适配器`);
  }

  // 13 个编辑类工具逐个拿自己的适配器 id 去注册表里查 routable。
  // 只判「注册表源码里有这串字」是判不出真假的：一个适配器可以列在那里却不可路由
  // （`office` 就是），那样的东西标成已上线就是骗人。
  const registry = TRUSTED_EDITOR_REGISTRY as Record<
    string,
    { routable: boolean; routeType: string } | undefined
  >;
  assert.equal(registry.office?.routable, false, "反证失效：office 变成可路由了");
  for (const item of PLUGIN_ITEMS.filter((entry) => entry.kind === "editor")) {
    assert.equal(item.status, "shipped", `${item.id} 状态与注册表不符`);
    assert.ok(item.adapter, `${item.id} 没有绑定适配器，无从核实`);
    const entry = registry[item.adapter as string];
    assert.ok(entry, `注册表里没有适配器 ${item.adapter}（${item.id}）`);
    assert.equal(
      entry?.routable,
      true,
      `适配器 ${item.adapter} 不可路由，${item.id} 不能标已上线`,
    );
    assert.notEqual(entry?.routeType, "none");
  }
  const adapters = PLUGIN_ITEMS.map((item) => item.adapter).filter(Boolean);
  assert.equal(new Set(adapters).size, adapters.length, "两条目撞了同一个适配器");

  // 每条状态都要给出可复核的依据，不能只写一个标签。
  for (const item of PLUGIN_ITEMS) {
    assert.ok(item.statusNote.length >= 30, `${item.id} 的状态没有依据`);
    assert.ok(item.specPath.startsWith("docs/specs/oceanleo-plugins-v1/"));
  }

  // 未实装的条目在详情页上不出现任何「打开 / 试用」按钮。
  for (const item of planned) {
    const html = render(<PluginGalleryDetail item={item} />);
    for (const label of interactiveLabels(html)) {
      assert.doesNotMatch(label, /打开|试用|开始使用|立即/);
    }
    assert.ok(html.includes("规格已定未实装"));
  }
});

/** `public/` 下的任何东西都能被直接 GET 到，不需要经过页面。 */
function publicFiles(): string[] {
  if (!existsSync("public")) return [];
  return readdirSync("public", { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => statSync(path.join("public", entry)).isFile());
}

test("产物文件没有裸放在 public 下可直接 GET", () => {
  // 「界面上没有下载按钮」不等于「下不到」：只要文件躺在 public 下，
  // 猜到路径就能 GET 走，按钮有没有都一样。这一格必须连文件都不存在。
  const files = publicFiles();
  assert.ok(files.length > 0, "public 读空了，这条检查会假绿");

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

test("构建产物里真正发出去的 HTML 也没有下载入口", (t) => {
  const root = ".next/server/app";
  if (!existsSync(root)) {
    t.skip("未构建：先跑 next build 再复核这一条");
    return;
  }

  const pages = readdirSync(root, { recursive: true })
    .map((entry) => String(entry))
    .filter(
      (entry) =>
        entry.endsWith(".html") &&
        (entry === "plugin-gallery.html" || entry.startsWith("plugin-gallery/")),
    );
  assert.ok(
    pages.length >= PLUGIN_ITEMS.length,
    `预渲染页面只有 ${pages.length} 份，少于 ${PLUGIN_ITEMS.length} 件工具`,
  );

  for (const page of pages) {
    const html = readFileSync(path.join(root, page), "utf8");
    // 这是**整页**，含左栏与站点外壳，不只是我这两个组件。
    assert.doesNotMatch(html, /<a\b[^>]*\bdownload\b/i, `${page} 有下载属性`);
    assert.doesNotMatch(html, /blob:|data:application/i, `${page} 有内联文件`);
    for (const href of hrefs(html)) {
      for (const pattern of FORBIDDEN_LINK_PATTERNS) {
        assert.equal(
          href.toLowerCase().includes(pattern),
          false,
          `${page} 的链接指向了一个文件: ${href}`,
        );
      }
    }
    for (const label of interactiveLabels(html)) {
      for (const word of FORBIDDEN_ACTION_LABELS) {
        assert.equal(
          label.toLowerCase().includes(word.toLowerCase()),
          false,
          `${page} 上有可点的下载入口: ${label}`,
        );
      }
    }
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
  assert.equal(filterPlugins({ status: "shipped" }).length, 13);

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
