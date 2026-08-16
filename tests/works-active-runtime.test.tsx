import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@oceanleo/ui/i18n/provider.js";

import * as kinds from "@/components/WorksKinds";
import { WorksDetail } from "@/components/WorksDetail";
import { WorksViewer } from "@/components/WorksViewer";
import * as worksModule from "@/lib/works";

const GAME_IDS = [
  "one-breath-reflex-01",
  "slow-ledger-tactics-01",
  "echo-recall-01",
  "paper-deduction-01",
  "one-shot-route-01",
  "one-shot-route-02",
  "quiet-consequence-01",
] as const;
const WEBSITE_IDS = [
  "law-intake-01",
  "salon-booking-01",
  "docfilm-portfolio-01",
] as const;
const RUNTIME_IDS = [...GAME_IDS, ...WEBSITE_IDS];
const THEMED_WORKFLOW_IDS = [
  "exclusive-triage-01",
  "state-machine-review-01",
  "fan-in-consolidate-01",
] as const;
const MANIFEST_PATH = "content/active-runtime/manifest.game-website.json";

type ActiveRuntimeManifestItem = {
  id: string;
  kind: "game" | "website";
  source: string;
  entry: "index.html";
};

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <I18nProvider locale="zh" messages={{}}>
      {node}
    </I18nProvider>,
  );
}

function recursiveFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((entry) => statSync(path.join(root, entry)).isFile())
    .sort();
}

function readManifest(): { schema: string; items: ActiveRuntimeManifestItem[] } {
  assert.equal(existsSync(MANIFEST_PATH), true, `缺 ${MANIFEST_PATH}`);
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function validPlan(items: ActiveRuntimeManifestItem[]) {
  return {
    schema: "oceanleo.active-runtime-plan.v1",
    manifest: "active-runtime-manifest.json",
    manifestSha256: "a".repeat(64),
    itemCount: items.length,
    totalBytes: items.length,
    items: items.map((item, index) => {
      const host = `s-${String(index + 1).padStart(32, "0")}.oceanleo.app`;
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
}

test("UC-1：十件运行字节移出 public，安全源与 F9 manifest 留下", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  const publicFiles = recursiveFiles("public");
  assert.ok(publicFiles.length > 0, "public 读空会让检查假绿");

  for (const id of RUNTIME_IDS) {
    const executable = publicFiles.filter(
      (file) => file.includes(id) && /\.(?:html?|m?js|cjs|css)$/i.test(file),
    );
    assert.deepEqual(executable, [], `${id} 仍有可从 asset 域直接 GET 的执行字节`);
  }

  for (const id of GAME_IDS) {
    assert.equal(existsSync(`public/works/game/${id}.cover.png`), true);
    assert.equal(existsSync(`public/works/game/${id}.game.json`), true);
  }
  for (const id of WEBSITE_IDS) {
    assert.equal(existsSync(`public/works/website/${id}.cover.webp`), true);
    assert.equal(existsSync(`public/works/website/${id}-source.zip`), true);
    assert.equal(existsSync(`public/works/website/${id}/site.json`), true);
    assert.equal(existsSync(`public/works/website/${id}/oceanleo.starter.json`), true);
  }

  const manifest = readManifest();
  assert.equal(manifest.schema, "oceanleo.active-runtime-manifest.v1");
  assert.equal(manifest.items.length, 10);
  assert.deepEqual(
    new Set(manifest.items.map((item) => item.id)),
    new Set(RUNTIME_IDS),
  );
  for (const item of manifest.items) {
    assert.deepEqual(Object.keys(item).sort(), ["entry", "id", "kind", "source"]);
    assert.equal(item.source, `content/active-runtime/${item.kind}/${item.id}`);
    assert.equal(item.entry, "index.html");
    const root = item.source;
    assert.equal(lstatSync(root).isDirectory(), true);
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    assert.equal(lstatSync(path.join(root, item.entry)).isFile(), true);
    for (const file of recursiveFiles(root)) {
      assert.equal(lstatSync(path.join(root, file)).isSymbolicLink(), false);
    }
  }
});

test("UC-1：runtime URL validator 只收精确 namespace-C /embed", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  const validator = (kinds as unknown as {
    isActiveRuntimeUrl?: (value: unknown) => boolean;
  }).isActiveRuntimeUrl;
  assert.equal(typeof validator, "function");
  const valid = "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed";
  assert.equal(validator?.(valid), true);
  for (const rejected of [
    "/works/game/one-breath-reflex-01.html",
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
    assert.equal(validator?.(rejected), false, rejected);
  }
});

test("UC-1：WorksViewer 源码锁死无 iframe、srcdoc 与同站 runtime fallback", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  const viewer = readFileSync("components/WorksViewer.tsx", "utf8");
  assert.doesNotMatch(viewer, /<iframe\b|srcdoc=/i);
  assert.doesNotMatch(
    viewer,
    /NEXT_PUBLIC_[A-Z0-9_]*(?:SANDBOX|RUNTIME)|\/works\/(?:game|website)\/.*\.html/i,
  );
  assert.match(viewer, /target="_blank"/);
  assert.match(viewer, /rel="noopener noreferrer"/);
  assert.match(viewer, /isActiveRuntimeUrl\(runtime\)/);
});

test("F9 sidecar 与 fragment 逐件对账，缺失或歪 URL 单件 fail-closed", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  const manifest = readManifest();
  const parser = (worksModule as unknown as {
    activeRuntimeUrlsFrom?: (
      manifestValue: unknown,
      planValue: unknown,
    ) => Map<string, string>;
  }).activeRuntimeUrlsFrom;
  assert.equal(typeof parser, "function");

  const plan = validPlan(manifest.items);
  const urls = parser?.(manifest, plan);
  assert.equal(urls?.size, 10);
  for (const item of plan.items) {
    assert.equal(urls?.get(item.item.id), item.entryUrl);
  }
  assert.equal(parser?.(manifest, null).size, 0);

  for (const rejected of [
    "https://user@s-0123456789abcdef0123456789abcdef.oceanleo.app/embed",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app:443/embed",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed?x=1",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed#x",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app.evil/embed",
  ]) {
    const malformed = structuredClone(plan);
    malformed.items[0].entryUrl = rejected;
    assert.equal(parser?.(manifest, malformed).has(manifest.items[0].id), false, rejected);
    assert.equal(parser?.(manifest, malformed).size, 9, "坏一件不应误关其余九件");
  }
});

test("plugin 不再是 works 类型，独立 plugin gallery 路由仍在", () => {
  const catalog = worksModule.loadWorks();
  assert.equal(catalog.works.some((work) => String(work.artifactType) === "plugin"), false);
  assert.equal(catalog.works.some((work) => String(work.view.kind) === "plugin"), false);
  assert.equal(existsSync("content/works/plugin.json"), false);
  assert.equal(existsSync("app/plugin-gallery/page.tsx"), true);
  assert.equal(existsSync("app/plugin-gallery/[id]/page.tsx"), true);
  assert.equal((kinds.ARTIFACT_TYPE_ORDER as readonly string[]).includes("plugin"), false);
  assert.equal((kinds.VIEW_KIND_IDS as readonly string[]).includes("plugin"), false);
});

test("game payload 在服务端摘掉 runnable source 后才交给 React", () => {
  const catalog = worksModule.loadWorks();
  for (const id of GAME_IDS) {
    const work = catalog.works.find((candidate) => candidate.id === id);
    assert.ok(work, `loader 丢了 ${id}`);
    assert.equal(work.view.src, `/works/game/${id}.game.json`);
    const payload = worksModule.readWorkPayload(work) as Record<string, unknown> | null;
    assert.ok(payload, `${id} 没有结构化 payload`);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "source"), false);
    assert.equal(payload.sourceOmitted, true);
    assert.equal(typeof payload.sourceChars, "number");
    assert.doesNotMatch(JSON.stringify(payload), /<!doctype html>|<script/i);
  }
});

test("website 下载包逐件带权威 site.json 与 starter companion", () => {
  for (const id of WEBSITE_IDS) {
    const archive = `public/works/website/${id}-source.zip`;
    const listed = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    const entries = listed.stdout.trim().split("\n");
    assert.ok(entries.includes("site.json"), `${id} zip 缺 site.json`);
    assert.ok(entries.includes("oceanleo.starter.json"), `${id} zip 缺 starter`);
  }
});

test("WorkflowViewer 严格消费八角色 theme，三件 SVG 不再同皮", () => {
  const catalog = worksModule.loadWorks();
  const rendered: string[] = [];
  for (const id of THEMED_WORKFLOW_IDS) {
    const work = catalog.works.find((candidate) => candidate.id === id);
    assert.ok(work, `loader 丢了 ${id}`);
    const payload = worksModule.readWorkPayload(work) as {
      theme?: Record<string, string>;
    } | null;
    assert.ok(payload?.theme, `${id} flow 缺 theme`);
    assert.deepEqual(Object.keys(payload.theme).sort(), [
      "accent",
      "edge",
      "muted",
      "node",
      "nodeBorder",
      "surface",
      "text",
      "warning",
    ]);
    const html = render(<WorksViewer work={work} payload={payload} />);
    for (const [role, color] of Object.entries(payload.theme)) {
      assert.ok(html.toLowerCase().includes(color.toLowerCase()), `${id} 没消费 ${role}=${color}`);
    }
    rendered.push(html);
  }
  assert.notEqual(rendered[0], rendered[1]);
  assert.notEqual(rendered[1], rendered[2]);
  assert.notEqual(rendered[0], rendered[2]);

  const work = catalog.works.find((candidate) => candidate.id === THEMED_WORKFLOW_IDS[0]);
  assert.ok(work);
  const unsafe = {
    nodes: [{ id: "a", label: "A" }],
    edges: [],
    theme: {
      surface: "#000000",
      node: "#111111",
      nodeBorder: "#222222",
      text: "#333333",
      muted: "#444444",
      edge: "#555555",
      accent: "#666666",
      warning: "red; background:url(https://evil.invalid/x)",
      arbitraryCss: "position:fixed",
    },
  };
  const fallback = render(<WorksViewer work={work} payload={unsafe} />);
  assert.match(fallback, /#F5F7FA/i);
  assert.match(fallback, /#D0D7DE/i);
  assert.match(fallback, /#7D8590/i);
  assert.match(fallback, /#1F2328/i);
  assert.doesNotMatch(fallback, /evil\.invalid|position:fixed/i);
});

test("十件 SSR 都有 cover、说明、合法外开与安全下载/源码入口", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  const catalog = worksModule.loadWorks();
  RUNTIME_IDS.forEach((id, index) => {
    const work = catalog.works.find((candidate) => candidate.id === id);
    assert.ok(work, `loader 丢了 ${id}`);
    const runtime =
      `https://s-${String(index + 20).padStart(32, "0")}.oceanleo.app/embed`;
    const withRuntime = {
      ...work,
      view: { ...work.view, runtime },
    };
    const payload = worksModule.readWorkPayload(work);
    const html = render(
      <WorksDetail work={withRuntime} payload={payload} extracted={null} />,
    );

    assert.ok(html.includes(`src="${work.cover}"`), `${id} 缺 cover`);
    assert.ok(html.includes(work.title), `${id} 缺标题/说明`);
    assert.ok(html.includes(`href="${runtime}"`), `${id} 缺合法 runtime`);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.doesNotMatch(html, /<iframe\b|srcdoc=/i);
    assert.ok(html.includes(`href="${work.view.download}"`), `${id} 缺安全下载`);
    assert.match(html, /\bdownload=""/);

    if (work.artifactType === "game") {
      assert.match(html, />打开试玩<\/a>/);
      assert.match(html, /玩法|游戏/);
    } else {
      assert.match(html, />打开网站<\/a>/);
      assert.match(html, /给谁使用|希望访客做什么/);
      assert.ok(work.view.source, `${id} 没登记权威 source`);
      assert.ok(html.includes(`href="${work.view.source}"`), `${id} 缺 site.json 入口`);
      assert.match(html, /查看 site\.json/);
    }
  });
});

test("查看器对缺失或畸形 runtime 只显示不可用，不回退 asset 路径", () => {
  // UC-1: docs/architecture/oceanleo-untrusted-content-isolation.md §8.1
  const work = worksModule.loadWorks().works.find((candidate) => candidate.id === GAME_IDS[0]);
  assert.ok(work);
  for (const runtime of [
    undefined,
    "/works/game/one-breath-reflex-01.html",
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed?fallback=1",
  ]) {
    const html = render(
      <WorksViewer
        work={{ ...work, view: { ...work.view, runtime } }}
        payload={worksModule.readWorkPayload(work)}
      />,
    );
    assert.match(html, /暂不可用/);
    if (runtime) assert.equal(html.includes(runtime), false);
    assert.doesNotMatch(html, /<iframe\b|srcdoc=/i);
  }
});
