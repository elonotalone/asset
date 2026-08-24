import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@oceanleo/ui/i18n/provider.js";

import * as kinds from "@/components/WorksKinds";
import { WorksDetail } from "@/components/WorksDetail";
import { WorksGallery, tallyWorkflows } from "@/components/WorksGallery";
import * as worksModule from "@/lib/works";

// 「这一件是哪条产线做的」这一格（合同 §3.2）的解析与显示。
//
// 三种 fixture，对应操作员会遇到的三种片段：**有这一格**（本波新件）、
// **没这一格**（69 件存量，故意留的对照组）、**形状坏了**（产线写错了）。
// 第三种的判据是「只丢那一格，条目照常上架」——把整条丢掉会让作品页在
// 9 位 owner 并发写片段的时候整格整格地消失，而谁都不会发现。

const DOCS = {
  base: "docs/design-guides/composite_image/base/composite_image.md",
  scene: "docs/design-guides/composite_image/xhs/_INDEX.md",
  style: "docs/design-guides/composite_image/xhs/xhs-photo-press.md",
  productGuide: "docs/design-guides/composite_image/xhs/_PRODUCT-DOC.md",
} as const;

const WORKFLOW: kinds.WorkWorkflow = {
  id: "composite_image/xhs/xhs-photo-press",
  name: "小红书封面 · 照片压字",
  docs: { ...DOCS },
};

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <I18nProvider locale="zh" messages={{}}>
      {node}
    </I18nProvider>,
  );
}

/** 一件本波新件：带 `workflow` 一格。 */
function withWorkflow(): kinds.WorkEntry {
  return {
    id: "xhs-photo-press-probe",
    artifactType: "composite_image",
    title: "照片压字封面",
    styleId: "xhs-photo-press",
    workflow: { ...WORKFLOW, docs: { ...DOCS } },
    summary: "工作流 fixture：有这一格。",
    cover: "/works/composite_image/probe.cover.webp",
    view: { kind: "design-document", src: "/works/composite_image/probe.json" },
    downloadable: false,
    attribution: [{ text: "OceanLeo fixture", licenseCode: "CC0-1.0", licenseUrl: "" }],
    sourceFile: "composite_image.xhs.json",
  };
}

/** 一件历史存量：没有这一格，只有 `styleId`。 */
function withoutWorkflow(): kinds.WorkEntry {
  const work = withWorkflow();
  delete work.workflow;
  return {
    ...work,
    id: "xhs-quiet-serif-probe",
    title: "留白衬线封面",
    styleId: "xhs-quiet-serif",
    summary: "工作流 fixture：没有这一格。",
  };
}

/** 真片段（`content/works/<file>` 的第 i 条）。路径都是盘上真存在的文件。 */
function realEntry(file: string, index = 0): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(`content/works/${file}`, "utf8"));
  assert.ok(Array.isArray(parsed) && parsed[index], `${file} 第 ${index} 条读不出来`);
  return parsed[index] as Record<string, unknown>;
}

/**
 * 真片段里第一条**没有**这一格的条目 —— 存量对照组只能这么取，不能按下标。
 *
 * 下标取法在 2026-08-16 真的假红过一次：新件按合同要求**排在片段最前**，
 * 而新件按同一份合同**必须带 `workflow`**，于是「第 0 条 = 存量」这个取样前提
 * 被产线自己的纪律推翻了，跟产物对不对没关系。取不到对照组时这里**判红**，
 * 不是静默跳过：存量条目真的一条不剩时，这条用例要证的事已经不存在，得换真夹具。
 */
function realEntryWithout(file: string, cell: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(`content/works/${file}`, "utf8")) as Record<string, unknown>[];
  assert.ok(Array.isArray(parsed), `${file} 不是数组`);
  const hit = parsed.find((entry) => !(cell in entry));
  assert.ok(hit, `${file} 里已经没有一条不带 \`${cell}\` 的存量条目 —— 对照组没了，这条用例得换夹具，不许改判据`);
  return hit;
}

function parse(raw: unknown, file: string) {
  const problems: string[] = [];
  return { entry: worksModule.parseEntry(raw, file, problems), problems };
}

test("有这一格：形状合法的 workflow 原样上屏，两段与三段 id 都收", () => {
  const problems: string[] = [];
  assert.deepEqual(
    worksModule.parseWorkflow(WORKFLOW, "composite_image", problems),
    WORKFLOW,
  );
  // 无场景的品类只有两段 id，`docs.scene` 缺席是合法的，不是缺陷。
  const twoSegment = {
    id: "document/document-metric-review",
    name: "文档 · 指标复盘",
    docs: {
      base: "docs/design-guides/document/base/document.md",
      style: "docs/design-guides/document/document-metric-review.md",
      productGuide: "docs/design-guides/document/_PRODUCT-DOC.md",
    },
    note: "合同没写的键忽略即可，不该判错",
  };
  const parsed = worksModule.parseWorkflow(twoSegment, "document", problems);
  assert.equal(parsed?.id, "document/document-metric-review");
  assert.equal(parsed?.docs.scene, undefined);
  assert.deepEqual(problems, []);

  // 真片段带上这一格：条目上架，这一格进详情页。
  // 复合图片 16 条已按 2026-08-24 裁定清空，改用仍在货架上的 chart 条目做文件存在性夹具。
  const raw = { ...realEntry("chart.json"), artifactType: "composite_image", workflow: WORKFLOW };
  const { entry, problems: why } = parse(raw, "chart.json");
  assert.ok(entry, "带合法 workflow 的真片段必须上架");
  assert.deepEqual(entry.workflow, WORKFLOW);
  assert.deepEqual(why, []);
});

test("没这一格：69 件存量照常上架，卡片退回 styleId", () => {
  const problems: string[] = [];
  assert.equal(worksModule.parseWorkflow(undefined, "composite_image", problems), undefined);
  assert.deepEqual(problems, [], "缺这一格是对照组，不是问题");

  const raw = realEntryWithout("chart.json", "workflow");
  assert.equal("workflow" in raw, false, "存量片段本来就没有这一格");
  const { entry, problems: why } = parse(raw, "chart.json");
  assert.ok(entry);
  assert.equal(entry.workflow, undefined);
  assert.deepEqual(why, []);

  const html = render(<WorksGallery groups={[group([withoutWorkflow()])]} total={1} />);
  assert.match(html, /xhs-quiet-serif/, "没挂产线时显示 styleId");
  assert.match(html, /还没有任何一件成品挂上工作流/);
});

test("形状坏了：只丢这一格，条目照常上架并留下一条原因", () => {
  const broken: [string, unknown][] = [
    ["不是对象", "composite_image/xhs/xhs-photo-press"],
    ["id 只有一段", { ...WORKFLOW, id: "xhs-photo-press" }],
    ["id 超过三段", { ...WORKFLOW, id: "composite_image/xhs/press/extra" }],
    ["id 的品类与本条对不上", { ...WORKFLOW, id: "deck/xhs-photo-press" }],
    ["name 缺失", { ...WORKFLOW, name: "   " }],
    ["docs 不是对象", { ...WORKFLOW, docs: "docs/design-guides" }],
    ["docs.style 不是仓内 .md", { ...WORKFLOW, docs: { ...DOCS, style: "/works/x.md" } }],
    ["docs.base 里有 ..", { ...WORKFLOW, docs: { ...DOCS, base: "docs/../etc/passwd.md" } }],
    ["docs.productGuide 缺失", { ...WORKFLOW, docs: { base: DOCS.base, style: DOCS.style } }],
    ["docs.scene 给了但形状不对", { ...WORKFLOW, docs: { ...DOCS, scene: "docs/x.txt" } }],
  ];

  for (const [what, cell] of broken) {
    const problems: string[] = [];
    assert.equal(
      worksModule.parseWorkflow(cell, "composite_image", problems),
      undefined,
      what,
    );
    assert.equal(problems.length, 1, `${what}：应当只记一条原因，实得 ${problems.length}`);

    const raw = { ...realEntry("chart.json"), artifactType: "composite_image", workflow: cell };
    const { entry, problems: why } = parse(raw, "chart.json");
    assert.ok(entry, `${what}：坏了一格不许把整条成品从页面上抹掉`);
    assert.equal(entry.workflow, undefined, what);
    assert.equal(why.length, 1, what);
  }
});

test("构建日志把「少一格」和「跳过整条」说成两句话", () => {
  const source = readFileSync("lib/works.ts", "utf8");
  assert.match(source, /dropped: "cell"/);
  assert.match(source, /p\.dropped === "cell" \? "少一格" : "跳过"/);
});

function group(works: kinds.WorkEntry[]): { type: kinds.ArtifactType; label: string; works: kinds.WorkEntry[] } {
  return {
    type: works[0].artifactType,
    label: kinds.ARTIFACT_TYPE_LABELS[works[0].artifactType],
    works,
  };
}

test("读数不许撒谎：总数 = 已挂产线 + 历史存量", () => {
  const works = [withWorkflow(), withoutWorkflow(), { ...withWorkflow(), id: "second-probe" }];
  const { withWorkflow: hung, rows } = tallyWorkflows([group(works)]);
  assert.equal(hung, 2);
  assert.deepEqual(
    rows.map((row) => [row.id, row.count]),
    [[WORKFLOW.id, 2]],
    "同一条产线的两件合成一行，不重复陈列",
  );

  const html = render(<WorksGallery groups={[group(works)]} total={works.length} />);
  assert.match(html, /共\s*3\s*件/);
  assert.match(html, /1 件是历史存量/);
  assert.match(html, /小红书封面 · 照片压字/);
  assert.match(html, /composite_image\/xhs\/xhs-photo-press/);

  // 真目录的读数：页面拿到的总数就是装载器上架的件数，不是另算一套。
  const catalog = worksModule.loadWorks();
  const tally = tallyWorkflows(
    catalog.byType.map((byType) => ({
      type: byType.type,
      label: byType.label,
      works: byType.works,
    })),
  );
  assert.equal(
    catalog.byType.reduce((sum, byType) => sum + byType.works.length, 0),
    catalog.works.length,
  );
  assert.ok(tally.withWorkflow <= catalog.works.length);
});

test("详情页把三到四份文档摆成路径文本，不是点了 404 的链接", () => {
  const html = render(<WorksDetail work={withWorkflow()} payload={{}} extracted={null} />);
  assert.match(html, />工作流</, "详情页要有「工作流」这一行");
  assert.match(html, /小红书封面 · 照片压字/);
  for (const path of Object.values(DOCS)) {
    assert.match(html, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(html, new RegExp(`href="[^"]*${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
  assert.match(html, /这几份文档在文档仓里/);

  const legacy = render(<WorksDetail work={withoutWorkflow()} payload={{}} extracted={null} />);
  assert.doesNotMatch(legacy, />工作流</, "没挂产线的件不许摆一个空的产线区");
  assert.doesNotMatch(legacy, /这条产线的文档/);
});

test("裁定 9：那 6 件流程图的类目名是「流程图工程」，「工作流」只指产线", () => {
  assert.equal(kinds.ARTIFACT_TYPE_LABELS.workflow, "流程图工程");
  assert.equal(kinds.VIEW_KINDS.workflow.label, "流程图");

  const flowchart: kinds.WorkEntry = {
    ...withoutWorkflow(),
    id: "linear-conveyor-probe",
    artifactType: "workflow",
    title: "一条道传送带",
    styleId: "linear-conveyor",
    view: { kind: "workflow", src: "/works/workflow/probe.json" },
  };
  const html = render(<WorksDetail work={flowchart} payload={{}} extracted={null} />);
  assert.match(html, /流程图工程/);
  assert.doesNotMatch(
    html,
    />工作流</,
    "没挂产线的流程图件上不许再出现「工作流」这个词——它已经改指产线了",
  );

  // 盘上那 6 件的 `artifactType` 字符串一个字没动，只有显示名改了。
  const catalog = worksModule.loadWorks();
  const flowcharts = catalog.works.filter((work) => work.artifactType === "workflow");
  assert.ok(flowcharts.length >= 6, `流程图件数 ${flowcharts.length}`);
  assert.equal(
    flowcharts.every((work) => work.sourceFile === "workflow.json"),
    true,
  );
});

test("插件与编辑器指向 /plugin-gallery，不在这一页重复陈列", () => {
  const html = render(<WorksGallery groups={[group([withWorkflow()])]} total={1} />);
  assert.match(html, /href="\/plugin-gallery"/);
  assert.match(html, /不在这一页陈列/);
  assert.equal(kinds.ARTIFACT_TYPE_ORDER.includes("plugin" as kinds.ArtifactType), false);
  assert.equal(
    worksModule.loadWorks().works.some((work) => work.sourceFile === "plugin.json"),
    false,
    "插件不进作品页的清单",
  );
});
