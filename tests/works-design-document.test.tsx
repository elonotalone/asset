import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@oceanleo/ui/i18n/provider.js";

import { WorksDetail } from "@/components/WorksDetail";
import { WorksViewer } from "@/components/WorksViewer";
import type { WorkAttribution, WorkEntry } from "@/components/WorksKinds";

// works 页的海报承载判据只有一条：**用户点开一件海报，看到的必须和货架封面是同一张图。**
// 所以这里断言的不是「组件没崩」，而是两边会不会看出差别的那几处：
// 字有没有真的加载、path 有没有原样透传、叠序对不对、缺图看起来像不像缺陷、
// 署名有没有真的上屏、以及所有绝对像素量（圆角/描边）有没有跟着容器缩放。

const FONT_CSS = "app/poster-fonts.css";
const VIEWER = "components/WorksViewer.tsx";
const LAYOUT = "app/layout.tsx";
const FIXTURE = "tests/fixtures/poster/skeleton-poster.document.json";

/**
 * W2 的字体台账。它在另一个仓（文档仓 `/opt/cursor-workspaces/oceandino`），
 * 所以这里只在**它存在时**才拿它当准据：存在就必须逐条对齐 `status=approved`，
 * 不存在就只校验「文档用到的字都在 CSS 里」这一半。
 */
const FONT_LEDGER =
  process.env.OCEANLEO_POSTER_FONT_LEDGER ??
  "/opt/cursor-workspaces/oceandino/scripts/data/oceanleo-poster-fonts.json";

/** W1 的真实产出文档。路径由交付单给出，未就绪时回落到本仓 fixture。 */
const W1_DELIVERY =
  process.env.OCEANLEO_W1_DELIVERY ??
  "/opt/cursor-workspaces/oceandino/docs/work-logs/2026-08/poster-skeleton-pipeline/verdicts/W1-delivery.md";

interface DesignElement {
  id?: string;
  type?: string;
  text?: string;
  fontFamily?: string;
  pathData?: string;
  [key: string]: unknown;
}

interface DesignDoc {
  width?: number;
  height?: number;
  background?: string;
  elements?: DesignElement[];
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <I18nProvider locale="zh" messages={{}}>
      {node}
    </I18nProvider>,
  );
}

/** 一条 `@font-face` 摊出来的两样东西：族名与它指的字体文件。 */
interface Face {
  family: string;
  src: string;
  block: string;
}

function declaredFaces(css: string): Face[] {
  const faces: Face[] = [];
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const family = /font-family\s*:\s*([^;}]+)/.exec(block);
    const src = /url\("([^"]+)"\)/.exec(block);
    if (!family) continue;
    faces.push({
      family: family[1].trim().replace(/^["']|["']$/g, ""),
      src: src?.[1] ?? "",
      block,
    });
  }
  return faces;
}

/** 光栅器 `font.mjs` 是大小写不敏感地查族名的，判据也照它来。 */
function normalizeFamily(name: string): string {
  return name.trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
}

function declaredFamilies(css: string): Set<string> {
  return new Set(declaredFaces(css).map((face) => normalizeFamily(face.family)));
}

/**
 * `fontFamily` 的值是一条 CSS 字体栈，不是单个名（存量成品里就有
 * `"Noto Sans CJK SC, sans-serif"` 这样的写法）。按逗号拆开，通用族不需要 @font-face。
 * 拆法与光栅器 `font.mjs` 的 `familyCandidates()` 一致。
 */
const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
  "inherit",
  "initial",
  "unset",
]);

function familyCandidates(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, "").trim())
    .filter((part) => part && !GENERIC_FAMILIES.has(part.toLowerCase()));
}

function documentOf(raw: unknown): DesignDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = (raw as Record<string, unknown>).document;
  if (!doc || typeof doc !== "object") return null;
  const d = doc as DesignDoc;
  return Array.isArray(d.elements) ? d : null;
}

function readDoc(file: string): DesignDoc | null {
  try {
    return documentOf(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

/** 站上现存的每一份设计稿正文 + 本波 fixture。判据要覆盖真货，不只覆盖 fixture。 */
function allDocuments(): { file: string; doc: DesignDoc }[] {
  const out: { file: string; doc: DesignDoc }[] = [];
  const shelf = "public/works/composite_image";
  const files = existsSync(shelf)
    ? readdirSync(shelf)
        .filter((name) => name.endsWith(".json"))
        .map((name) => path.join(shelf, name))
    : [];
  for (const file of [...files, FIXTURE]) {
    const doc = readDoc(file);
    if (doc) out.push({ file, doc });
  }
  return out;
}

function familiesUsedBy(doc: DesignDoc): string[] {
  return [
    ...new Set(
      (doc.elements ?? [])
        .filter((el): el is DesignElement & { fontFamily: string } => typeof el.fontFamily === "string")
        .flatMap((el) => familyCandidates(el.fontFamily)),
    ),
  ];
}

const FIXTURE_ENVELOPE = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
  document: DesignDoc;
  attribution: WorkAttribution[];
};

function fixtureWork(overrides: Partial<WorkEntry> = {}): WorkEntry {
  return {
    id: "w3-skeleton-fixture",
    artifactType: "composite_image",
    title: "W3 fixture · 海报骨架查看器验收稿",
    styleId: "skeleton-fixture",
    summary: "只在测试里存在的一份骨架稿，用来把查看器的每一支都走一遍。",
    cover: "/works/composite_image/w3-skeleton-fixture.cover.webp",
    view: {
      kind: "design-document",
      src: "/works/composite_image/w3-skeleton-fixture.json",
      assets: {
        bg: "/works/composite_image/w3-skeleton-fixture.bg.webp",
        logo: "/works/composite_image/w3-skeleton-fixture.logo.png",
      },
      download: "/works/composite_image/w3-skeleton-fixture.full.webp",
      aspect: 0.75,
    },
    downloadable: true,
    attribution: FIXTURE_ENVELOPE.attribution,
    sourceFile: FIXTURE,
    ...overrides,
  };
}

/* ── ① 文档里出现的每个 fontFamily，CSS 里都有一条同名 @font-face ─────────── */

test("① 设计稿用到的每一款美术字都有 @font-face（否则站内落到系统默认，和封面不是同一套字）", () => {
  const css = readFileSync(FONT_CSS, "utf8");
  const declared = declaredFamilies(css);
  assert.ok(declared.size >= 20, `${FONT_CSS} 只声明了 ${declared.size} 款，读空了当不了判据`);

  const docs = allDocuments();
  assert.ok(docs.length > 0, "一份设计稿都没读到，这条检查会假绿");

  let checked = 0;
  for (const { file, doc } of docs) {
    for (const family of familiesUsedBy(doc)) {
      assert.ok(
        declared.has(normalizeFamily(family)),
        `${file} 用了 "${family}"，但 ${FONT_CSS} 里没有同名 @font-face（站内会落到系统默认，和封面不是同一套字）`,
      );
      checked += 1;
    }
  }
  // fixture 自己就带了四款指名字体，所以这个数不该是 0 —— 是 0 说明上面白跑了。
  assert.ok(checked >= 4, `只核到 ${checked} 处 fontFamily，判据没真的落到字体上`);
});

test("① 兜底链上的三款也必须在 CSS 里，且这份 CSS 真的被站点加载", () => {
  const css = readFileSync(FONT_CSS, "utf8");
  const declared = declaredFamilies(css);
  // 查看器给每个 text 接的兜底族：光栅器兜底那副字，用台账 approved 的那个名。
  assert.ok(declared.has(normalizeFamily("Source Han Sans CN")), `兜底族在 ${FONT_CSS} 里没有 @font-face`);
  // 存量成品直接指名过光栅器的兜底体，站内也得认，否则那几件两边不是同一套字。
  assert.ok(
    declared.has(normalizeFamily("Noto Sans CJK SC")),
    `"Noto Sans CJK SC" 在 ${FONT_CSS} 里没有 @font-face（存量成品指名了它）`,
  );
  const viewer = readFileSync(VIEWER, "utf8");
  assert.match(viewer, /Source Han Sans CN/, "查看器没接兜底链，拉丁 display 字缺汉字时会落到系统 UI 字");

  // CSS 写了但没 import 等于没写。
  assert.match(readFileSync(LAYOUT, "utf8"), /poster-fonts\.css/, `${LAYOUT} 没有引入 ${FONT_CSS}`);

  // 每条 @font-face 都要给 swap，否则字体到位前那一段是空白，看起来像丢字。
  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  for (const block of blocks) {
    assert.match(block, /font-display\s*:\s*swap/, `缺 font-display: swap → ${block.slice(0, 80)}`);
    assert.match(block, /src\s*:\s*url\("https:\/\//, `src 不是 https OSS 直链 → ${block.slice(0, 80)}`);
  }
});

interface LedgerRow {
  family?: string;
  aliases?: string[];
  ossUrl?: string;
  status?: string;
  weight?: number;
}

function ledgerRows(): LedgerRow[] | null {
  if (!existsSync(FONT_LEDGER)) return null;
  const doc = JSON.parse(readFileSync(FONT_LEDGER, "utf8")) as unknown;
  const rows = Array.isArray(doc)
    ? (doc as LedgerRow[])
    : Array.isArray((doc as Record<string, unknown>).fonts)
      ? ((doc as Record<string, unknown>).fonts as LedgerRow[])
      : [];
  return rows.length > 0 ? rows : null;
}

test("① CSS 里的每一条 @font-face 都指向台账 approved 的字体文件", (t) => {
  const rows = ledgerRows();
  if (!rows) {
    t.diagnostic(`字体台账还没落盘（${FONT_LEDGER}），这一条按 W3.md 的约定暂不判；交卷前必须回来裁剪`);
    return;
  }
  const approved = rows.filter((row) => row.status === "approved");
  assert.ok(approved.length > 0, "台账里一款 approved 都没有，裁剪会把 CSS 清空");

  // 判据落在**文件**上而不是名字上：授权是文件的属性，一个文件在台账里可以有
  // `family` 与 `aliases` 好几个名（光栅器也是两套名都认）。
  const approvedFiles = new Set(approved.map((row) => String(row.ossUrl ?? "")).filter(Boolean));
  const otherFiles = new Set(
    rows.filter((row) => row.status !== "approved").map((row) => String(row.ossUrl ?? "")).filter(Boolean),
  );

  const faces = declaredFaces(readFileSync(FONT_CSS, "utf8"));
  assert.ok(faces.length >= 20, `${FONT_CSS} 只有 ${faces.length} 条 @font-face，读空了当不了判据`);

  for (const face of faces) {
    assert.equal(
      otherFiles.has(face.src),
      false,
      `${FONT_CSS} 里 "${face.family}" 指的是台账里 status != approved 的文件：${face.src}`,
    );
    assert.ok(
      approvedFiles.has(face.src),
      `${FONT_CSS} 里 "${face.family}" 指的文件不在台账里：${face.src}`,
    );
  }
});

test("① approved 的每一款都能按台账里的名（family 与 aliases）在站内取到", (t) => {
  const rows = ledgerRows();
  if (!rows) {
    t.diagnostic(`字体台账还没落盘（${FONT_LEDGER}）`);
    return;
  }
  const declared = declaredFamilies(readFileSync(FONT_CSS, "utf8"));
  const approved = rows.filter((row) => row.status === "approved");

  for (const row of approved) {
    for (const name of [row.family, ...(row.aliases ?? [])]) {
      if (!name) continue;
      assert.ok(
        declared.has(normalizeFamily(name)),
        `台账 approved 的 "${name}" 在 ${FONT_CSS} 里没有 @font-face —— ` +
          `光栅器按 family ∪ aliases 两套名都认，站内少一个名就渲不出`,
      );
    }
  }
  // 台账的 weight 必须逐条落到 CSS 的 font-weight 上：字重挑错了脸，
  // 站内会比封面胖一圈或瘦一圈（容器上 font-synthesis:none，不许合成粗体补救）。
  const faces = declaredFaces(readFileSync(FONT_CSS, "utf8"));
  for (const row of approved) {
    if (typeof row.weight !== "number" || !row.ossUrl) continue;
    for (const face of faces.filter((candidate) => candidate.src === row.ossUrl)) {
      assert.match(
        face.block,
        new RegExp(`font-weight:\\s*${row.weight}\\b`),
        `"${face.family}" 指的是 weight=${row.weight} 的脸，CSS 里的 font-weight 对不上`,
      );
    }
  }
});

test("① 这些族名不许撞站点的全局字体栈（撞上就是全站每页拉一份 8 MB 中文字）", () => {
  const declared = declaredFamilies(readFileSync(FONT_CSS, "utf8"));

  // 全家桶主题里有 body{font-family: Noto Sans SC, …}：站上今天没有这个名的
  // @font-face，正文落在系统字上。这一份 CSS 只该管 works 页的海报，
  // 一旦声明了全局栈里的名，全站每一页都会去 OSS 拉那份中文 OTF。
  const globalCss = [
    "app/globals.css",
    "node_modules/@oceanleo/ui/theme/ui.css",
    "node_modules/@oceanleo/ui/src/theme/ui.css",
  ]
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.ok(globalCss.length > 0, "一份全局样式都没读到，这条检查会假绿");

  const globalNames = new Set<string>();
  for (const hit of globalCss.match(/font-family\s*:\s*([^;}]+)/g) ?? []) {
    const value = hit.replace(/^font-family\s*:\s*/, "");
    if (value.includes("var(")) continue; // 解不开的变量不猜
    for (const name of familyCandidates(value)) globalNames.add(normalizeFamily(name));
  }
  assert.ok(globalNames.size > 0, "全局字体栈一个名都没解出来，这条检查会假绿");

  for (const family of declared) {
    assert.equal(
      globalNames.has(family),
      false,
      `${FONT_CSS} 声明的 "${family}" 也出现在站点全局字体栈里 —— ` +
        `海报字体会被全站正文用上，每页多拉一份中文字。改用它在台账里的另一个名。`,
    );
  }
});

/* ── ② path 原样透传成 <svg><path d> ─────────────────────────────────────── */

test("② path 元素渲成 <svg><path d>，d 原样透传，且不被父容器裁掉", () => {
  const html = render(<WorksViewer work={fixtureWork()} payload={FIXTURE_ENVELOPE} />);
  const paths = (FIXTURE_ENVELOPE.document.elements ?? []).filter((el) => el.type === "path");
  assert.ok(paths.length >= 4, "fixture 里的 path 太少，撑不起这条判据");

  for (const el of paths) {
    assert.ok(
      html.includes(`d="${el.pathData}"`),
      `path ${el.id} 的 d 没有原样出现在 DOM 里（被改写或被当矩形块画掉了）`,
    );
  }
  const svgCount = (html.match(/<svg/g) ?? []).length;
  assert.equal(svgCount, paths.length, `<svg> ${svgCount} 个，path 元素 ${paths.length} 个，对不上`);

  // svg 默认 inline + overflow:hidden：前者被行盒基线顶下去几像素，
  // 后者把压在 viewBox 边界上的半个线宽切掉。两样都要显式复位。
  for (const svg of html.match(/<svg[^>]*>/g) ?? []) {
    assert.match(svg, /display:block/, `svg 没有 display:block → ${svg.slice(0, 120)}`);
    assert.match(svg, /overflow:visible/, `svg 没有 overflow:visible → ${svg.slice(0, 120)}`);
    assert.match(svg, /viewBox="/, `svg 缺 viewBox → ${svg.slice(0, 120)}`);
  }

  // 描边色/填充色原样落地，别被默认值吞掉。
  assert.ok(html.includes('stroke="#B4451F"'), "path 的 stroke 没落地");
  assert.ok(html.includes('fill="#FFD54A"'), "path 的 fill 没落地");
});

/* ── ③ z 升序叠放、group 跳过 ────────────────────────────────────────────── */

test("③ 元素按 z 升序叠放，group 一层不落墨", () => {
  const html = render(<WorksViewer work={fixtureWork()} payload={FIXTURE_ENVELOPE} />);

  // 高亮块（z=10）必须排在标题字（z=13）之前 —— 排反了字就被块盖掉。
  const highlightAt = html.indexOf("#FFD54A");
  const titleAt = html.indexOf("一副骨架");
  assert.ok(highlightAt >= 0 && titleAt >= 0, "高亮块或标题没渲出来");
  assert.ok(highlightAt < titleAt, "高亮块排在了标题字之后，字会被块盖住");

  // 文档数组里 footer-note（z=90）写在最前面、bg（z=0）写在它后面：
  // 输出顺序必须按 z 而不是按数组顺序。
  const bgAt = html.indexOf("w3-skeleton-fixture.bg.webp");
  const footerAt = html.indexOf("OceanLeo 素材库 · 骨架");
  assert.ok(bgAt >= 0 && footerAt >= 0, "背景或落款没渲出来");
  assert.ok(bgAt < footerAt, "没按 z 升序排：z=0 的背景排到了 z=90 的落款之后");

  // group 只是分组，不许落墨。
  assert.equal(html.includes("只是分组，不落墨"), false, "group 层被画出来了");

  const elements = FIXTURE_ENVELOPE.document.elements ?? [];
  const groups = elements.filter((el) => el.type === "group").length;
  // 每个非 group 元素恰好一个顶层节点：div / img / svg 三种。
  const nodes =
    (html.match(/<div style="position:absolute/g) ?? []).length +
    (html.match(/<img /g) ?? []).length +
    (html.match(/<svg/g) ?? []).length;
  assert.equal(nodes, elements.length - groups, `落墨节点 ${nodes} 个，非 group 元素 ${elements.length - groups} 个`);
});

/* ── ④ 缺图占位块：保留 #EEF1F5，但要看得出是缺陷不是设计 ────────────────── */

test("④ 缺图画 #EEF1F5 占位块，并带 alt 文案说明图没跟着文档来", () => {
  const html = render(<WorksViewer work={fixtureWork()} payload={FIXTURE_ENVELOPE} />);
  assert.match(html, /#EEF1F5/, "缺图没画占位块");
  assert.ok(html.includes("主体抠图"), "占位块没带 alt 文案，看起来像一块设计");
  assert.match(html, /没有随文档提供/, "占位块没说清是缺图，这是已知的误判源");
  assert.match(html, /role="img"/, "占位块没有 role=img，读屏软件读不到它");

  // 有图的那两个 assetId 必须走 <img>，不许也掉进占位块。
  assert.ok(html.includes('src="/works/composite_image/w3-skeleton-fixture.bg.webp"'), "背景图没渲成 img");
  assert.ok(html.includes('src="/works/composite_image/w3-skeleton-fixture.logo.png"'), "icon 没渲成 img");

  // assets 一个都没给时，缺图的是全部 image/icon，但版面其余部分照旧。
  const bare = render(
    <WorksViewer work={fixtureWork({ view: { kind: "design-document", src: "/x.json" } })} payload={FIXTURE_ENVELOPE} />,
  );
  assert.equal(bare.includes("<img "), false, "assets 缺席时不该凭空造出 img");
  assert.ok(bare.includes("一副骨架"), "缺图不该拖累其他元素");
});

/* ── ⑤ attribution 三个字段都上屏 ────────────────────────────────────────── */

test("⑤ 署名与许可三个字段都出现在详情页 DOM 里，licenseUrl 是可点的外链", () => {
  const work = fixtureWork();
  const html = render(<WorksDetail work={work} payload={FIXTURE_ENVELOPE} extracted={null} />);
  assert.ok(work.attribution.length >= 2, "fixture 的 attribution 太少");

  // renderToStaticMarkup 会把正文里的引号转义成实体，先还原再逐字比对。
  const text = html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
  for (const a of work.attribution) {
    assert.ok(text.includes(a.text), `attribution 文本没上屏：${a.text}`);
    assert.ok(html.includes(a.licenseCode), `许可代号没上屏：${a.licenseCode}`);
    assert.ok(html.includes(`href="${a.licenseUrl}"`), `许可链接没上屏：${a.licenseUrl}`);
  }
  assert.match(html, /署名与许可/, "没有署名与许可这一节");
  assert.match(html, /rel="noopener noreferrer"/, "许可外链缺 rel=noopener");
});

/* ── ⑥ 真实产出文档渲染不抛错 ────────────────────────────────────────────── */

/** 从 W1 交付单里挑出一条真实产出文档路径。挑不到返回 null。 */
function w1DocumentPath(): string | null {
  if (!existsSync(W1_DELIVERY)) return null;
  const text = readFileSync(W1_DELIVERY, "utf8");
  for (const candidate of text.match(/[\w./-]+\.json/g) ?? []) {
    for (const base of ["", "/opt/cursor-workspaces/oceandino/"]) {
      const file = base + candidate;
      if (existsSync(file) && readDoc(file)) return file;
    }
  }
  return null;
}

test("⑥ 真实产出文档（W1 未就绪时用 fixture）渲染不抛错，且元素一个都不丢", (t) => {
  const real = w1DocumentPath();
  const file = real ?? FIXTURE;
  if (!real) t.diagnostic(`W1 的真实产出还没登记（${W1_DELIVERY}），这一条先用本仓 fixture：${FIXTURE}`);

  const envelope = JSON.parse(readFileSync(file, "utf8"));
  const doc = documentOf(envelope);
  assert.ok(doc, `${file} 里读不出 document.elements`);

  const assets = Object.fromEntries(
    (doc.elements ?? [])
      .map((el) => (typeof el.assetId === "string" ? el.assetId : null))
      .filter((id): id is string => Boolean(id))
      .map((id) => [id, `/works/composite_image/${id}.webp`]),
  );
  const html = render(
    <WorksViewer
      work={fixtureWork({ view: { kind: "design-document", src: "/x.json", assets } })}
      payload={envelope}
    />,
  );
  assert.ok(html.length > 0, "渲染出空串");

  const groups = (doc.elements ?? []).filter((el) => el.type === "group").length;
  const nodes =
    (html.match(/<div style="position:absolute/g) ?? []).length +
    (html.match(/<img /g) ?? []).length +
    (html.match(/<svg/g) ?? []).length;
  assert.equal(nodes, (doc.elements ?? []).length - groups, `${file}：落墨节点数与元素数对不上`);

  // 每段文字都要真的出现在 DOM 里（被吞掉的字在图上就是空白）。
  for (const el of doc.elements ?? []) {
    if (el.type !== "text" || typeof el.text !== "string" || !el.text.trim()) continue;
    const line = el.text.split("\n")[0].replace(/["'<>&]/g, "").trim();
    if (line) assert.ok(html.includes(line), `${file}：文字没上屏 → ${line}`);
  }
});

/* ── 与光栅器的其余对齐点（判据是「同一份文档，两边看起来是同一张图」）─────── */

test("绝对像素量（圆角 / 描边宽）跟着容器缩放，不写死屏幕像素", () => {
  const html = render(<WorksViewer work={fixtureWork()} payload={FIXTURE_ENVELOPE} />);
  const W = FIXTURE_ENVELOPE.document.width ?? 1240;
  // 画布单位 → 容器宽度的百分比。期望值按同一道换算算出来，不抄一串浮点数。
  const cqw = (v: number) => `${(v / W) * 100}cqw`;
  // 画布 1080、容器最宽 896：radius:32 若写成 32px，站内圆角比封面大一成半。
  assert.ok(html.includes(`border-radius:${cqw(32)}`), `radius 没换算成 cqw（期望 ${cqw(32)}）`);
  assert.ok(html.includes(`border:${cqw(3)} solid #1F2328`), `描边宽没换算成 cqw（期望 ${cqw(3)}）`);
  // 不许再出现「按屏幕像素写死的圆角/描边」。
  assert.equal(/border-radius:\d+px/.test(html), false, "还有写死 px 的圆角");
  assert.equal(/border:\d+px solid/.test(html), false, "还有写死 px 的描边");
});

test("排字复位钉死在容器上：块与字错开的每一个来源都显式复位", () => {
  const html = render(<WorksViewer work={fixtureWork()} payload={FIXTURE_ENVELOPE} />);
  for (const declaration of [
    "letter-spacing:normal",
    "word-spacing:normal",
    "font-synthesis:none",
    "font-kerning:normal",
    "font-feature-settings:normal",
    "font-variant-ligatures:normal",
    "text-transform:none",
  ]) {
    assert.ok(html.includes(declaration), `容器上少了 ${declaration}`);
  }
  // 换行点必须和光栅器的 tokenize 一致：拉丁词整体挪行，不拆词。
  assert.match(html, /overflow-wrap:normal/, "text 没复位 overflow-wrap，祖先的 break-words 会把拉丁词拆开");
  assert.match(html, /word-break:normal/, "text 没复位 word-break");
});

test("查看器仍然不引 iframe / srcdoc / innerHTML（UC-1 不许因为这一波松掉）", () => {
  const viewer = readFileSync(VIEWER, "utf8");
  // 与 tests/works-active-runtime 同一道口径，但更严一档：先把注释去掉再查，
  // 这样「安全说明里提到 srcdoc」不算命中，而代码里任何一处真用法都算。
  const code = viewer.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /<iframe\b|srcdoc|innerHTML/i);
  // path 那一支是本波新加的 svg 出口：`d` 只当属性值透传，React 会转义，
  // 不许有人图省事改成拼 HTML 字符串。
  assert.match(code, /<path\s+d=\{/);
});
