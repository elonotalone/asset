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
/** 仲裁 01 裁定的那一套：顶层 `spec` + `document.elements[].props`。 */
const PROPS_FIXTURE = "tests/fixtures/poster/skeleton-poster.props.json";

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

/** 查看器给每个 text 接的兜底族（`POSTER_FALLBACK_STACK` 的第一个名）。 */
const FALLBACK_FAMILY = "Source Han Sans CN";

/**
 * 站点全局样式里实名写出来的字体族。海报字体一旦声明了这里面的名，
 * 全站正文就会跟着用上（`body{font-family: Noto Sans SC, …}` 就是这么一条）。
 */
function globalFontStackNames(): Set<string> {
  const css = [
    "app/globals.css",
    "node_modules/@oceanleo/ui/theme/ui.css",
    "node_modules/@oceanleo/ui/src/theme/ui.css",
  ]
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.ok(css.length > 0, "一份全局样式都没读到，这条检查会假绿");

  const names = new Set<string>();
  for (const hit of css.match(/font-family\s*:\s*([^;}]+)/g) ?? []) {
    const value = hit.replace(/^font-family\s*:\s*/, "");
    if (value.includes("var(")) continue; // 解不开的变量不猜
    for (const name of familyCandidates(value)) names.add(normalizeFamily(name));
  }
  assert.ok(names.size > 0, "全局字体栈一个名都没解出来，这条检查会假绿");
  return names;
}

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
  for (const file of [...files, FIXTURE, PROPS_FIXTURE]) {
    const doc = readDoc(file);
    if (doc) out.push({ file, doc });
  }
  return out;
}

/**
 * 两套序列化的字体名落点不同：flat 形在 `el.fontFamily`，props 形在
 * `el.props.fontFamily`（站内 684 张与本波产物都是后者）。两处都要收，
 * 少收一处就等于「新形状的字没被这条判据管住」。
 */
function familiesUsedBy(doc: DesignDoc): string[] {
  const names: string[] = [];
  for (const el of doc.elements ?? []) {
    const flat = typeof el.fontFamily === "string" ? el.fontFamily : null;
    const props = el.props && typeof el.props === "object" ? (el.props as Record<string, unknown>) : null;
    const inProps = props && typeof props.fontFamily === "string" ? props.fontFamily : null;
    for (const value of [flat, inProps]) {
      if (value) names.push(...familyCandidates(value));
    }
  }
  return [...new Set(names)];
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
  const css = readFileSync(FONT_CSS, "utf8");
  const declared = declaredFamilies(css);
  const faces = declaredFaces(css);
  const approved = rows.filter((row) => row.status === "approved");
  const globalNames = globalFontStackNames();
  const fallbackFiles = new Set(
    faces.filter((face) => normalizeFamily(face.family) === normalizeFamily(FALLBACK_FAMILY)).map((f) => f.src),
  );

  for (const row of approved) {
    for (const name of [row.family, ...(row.aliases ?? [])]) {
      if (!name) continue;
      if (declared.has(normalizeFamily(name))) continue;

      // 允许缺席的**唯一**理由：这个名撞了站点全局字体栈（声明它就等于把全站正文
      // 换成这份中文 OTF），而它指的文件已经在兜底族名下声明过 —— 查看器给每个
      // text 都接了兜底链，所以指名它的文字最终落到的是同一份文件、同一副字。
      // 两个条件缺一个都算真的缺款。
      assert.ok(
        globalNames.has(normalizeFamily(name)),
        `台账 approved 的 "${name}" 在 ${FONT_CSS} 里没有 @font-face —— ` +
          `光栅器按 family ∪ aliases 两套名都认，站内少一个名就渲不出`,
      );
      assert.ok(
        row.ossUrl && fallbackFiles.has(row.ossUrl),
        `"${name}" 撞了站点全局字体栈所以不能声明，但它指的 ${row.ossUrl} ` +
          `也没有挂在兜底族 "${FALLBACK_FAMILY}" 名下 —— 那指名它的文字两边就不是同一副字`,
      );
      assert.match(
        readFileSync(VIEWER, "utf8"),
        new RegExp(`"${FALLBACK_FAMILY}"`),
        `查看器没接兜底族 "${FALLBACK_FAMILY}"，上面那条豁免就不成立`,
      );
    }
  }
  // 台账的 weight 必须逐条落到 CSS 的 font-weight 上：字重挑错了脸，
  // 站内会比封面胖一圈或瘦一圈（容器上 font-synthesis:none，不许合成粗体补救）。
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
  const globalNames = globalFontStackNames();

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

  // 与光栅器约好的口径：两边都**裁到元素盒子**（`raster.mjs` 的 path 分支按
  // rect(x,y,w,h) clip）。站内这里写成显式 hidden，把 svg 的默认变成写下来的契约；
  // 一边裁一边不裁，同一份 d 就会画出两张图。
  for (const svg of html.match(/<svg[^>]*>/g) ?? []) {
    assert.match(svg, /display:block/, `svg 没有 display:block → ${svg.slice(0, 120)}`);
    assert.match(svg, /overflow:hidden/, `svg 没有 overflow:hidden（与光栅器的 clip 对不上）`);
    assert.match(svg, /viewBox="/, `svg 缺 viewBox → ${svg.slice(0, 120)}`);
  }

  // viewBox 必须就是元素盒子（文档绝对坐标），`d` 才能按绝对坐标写。
  for (const el of paths) {
    assert.ok(
      html.includes(`viewBox="${el.x} ${el.y} ${el.width} ${el.height}"`),
      `path ${el.id} 的 viewBox 不是它的盒子，d 的绝对坐标就落错地方`,
    );
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

  // 两套序列化各有自己的落墨节点形状：flat 形一个元素一个 div/img/svg，
  // props 形一个元素一个 <g transform>。判形错了就等于这条判据没在管事，
  // 所以先按文档自己的形状选口径，再数。
  const isProps = (doc.elements ?? []).some((el) => el.props && typeof el.props === "object");
  if (isProps) {
    const drawable = (doc.elements ?? []).filter(
      (el) => el.hidden !== true && (el.type === "shape" || el.type === "text" || el.type === "image"),
    ).length;
    const nodes = (html.match(/<g transform="translate\(/g) ?? []).length;
    assert.equal(nodes, drawable, `${file}：props 形落墨节点数与元素数对不上`);
  } else {
    const groups = (doc.elements ?? []).filter((el) => el.type === "group").length;
    const nodes =
      (html.match(/<div style="position:absolute/g) ?? []).length +
      (html.match(/<img /g) ?? []).length +
      (html.match(/<svg/g) ?? []).length;
    assert.equal(nodes, (doc.elements ?? []).length - groups, `${file}：落墨节点数与元素数对不上`);
  }

  // 每段文字都要真的出现在 DOM 里（被吞掉的字在图上就是空白）。
  for (const el of doc.elements ?? []) {
    if (el.type !== "text") continue;
    const props = el.props && typeof el.props === "object" ? (el.props as Record<string, unknown>) : null;
    const raw = typeof el.text === "string" ? el.text : typeof props?.text === "string" ? props.text : null;
    if (!raw || !raw.trim()) continue;
    const line = raw.split("\n")[0].replace(/["'<>&]/g, "").trim();
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

/* ══════════════ props 形（仲裁 01 裁定的那一套）══════════════════════════════
 *
 * 判据仍然只有一条：**用户点开一件海报，看到的必须和货架封面是同一张图。**
 * props 形的渲染端是 `design/lib/render.ts` 的 `exportDocumentToSVG`（684 张模板与
 * 用户编辑器都走它），所以这一节断言的是「站内画出来的几何与效果，和那一端
 * 逐个数字对得上」，而不是「组件没崩」。期望值一律按渲染端的公式当场算，
 * 不抄一串浮点数 —— 抄下来的数字改了公式也不会红。
 */

const PROPS_ENVELOPE = JSON.parse(readFileSync(PROPS_FIXTURE, "utf8")) as {
  spec: Record<string, unknown>;
  document: DesignDoc;
  attribution: WorkAttribution[];
};

function propsWork(overrides: Partial<WorkEntry> = {}): WorkEntry {
  return {
    ...fixtureWork(),
    id: "w3-props-fixture",
    title: "W3 fixture · props 形查看器验收稿",
    styleId: "props-fixture",
    attribution: PROPS_ENVELOPE.attribution,
    sourceFile: PROPS_FIXTURE,
    ...overrides,
  };
}

function renderProps(): string {
  return render(<WorksViewer work={propsWork()} payload={PROPS_ENVELOPE} />);
}

function elementOf(id: string): DesignElement & { props: Record<string, unknown> } {
  const el = (PROPS_ENVELOPE.document.elements ?? []).find((e) => e.id === id);
  assert.ok(el, `fixture 里没有 id=${id} 这个元素`);
  return el as DesignElement & { props: Record<string, unknown> };
}

/** 渲染端 `render.ts:968-972` 的角度换算。站内那一份必须给出同样的四个数。 */
function gradientAxis(deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return {
    x1: ((50 - Math.cos(rad) * 50) / 100).toFixed(4),
    y1: ((50 - Math.sin(rad) * 50) / 100).toFixed(4),
    x2: ((50 + Math.cos(rad) * 50) / 100).toFixed(4),
    y2: ((50 + Math.sin(rad) * 50) / 100).toFixed(4),
  };
}

test("⑦ 判形：props 形走 props 分支、flat 形照旧、认不出的文档说认不出", () => {
  const propsHtml = renderProps();
  const doc = PROPS_ENVELOPE.document;
  assert.ok(
    propsHtml.includes(`viewBox="0 0 ${doc.width} ${doc.height}"`),
    "props 形没渲成文档尺寸的 svg 画布",
  );
  // props 形不该落到 flat 那一支的绝对定位 div 上（落过去就是几何全错）。
  assert.equal(propsHtml.includes('<div style="position:absolute'), false, "props 形掉进了 flat 分支");

  // flat 形不许被这一波带走：存量四件封面还在用它。
  const flatHtml = render(<WorksViewer work={fixtureWork()} payload={FIXTURE_ENVELOPE} />);
  assert.ok(flatHtml.includes('<div style="position:absolute'), "flat 分支被换掉了，存量四件会渲错");

  // 判不出来的时候要说话：空白页会被当成没做，灰块会被当成设计。
  const alien = render(
    <WorksViewer work={propsWork()} payload={{ document: { width: 100, height: 100, elements: [{ id: "x", type: "shape" }] } }} />,
  );
  assert.match(alien, /认不出/, "认不出的文档没说认不出");
  assert.equal(alien.includes("<svg"), false, "认不出的文档还是画了一张图出来");
  assert.match(alien, /props 形/, "认不出的提示没说清本站认哪两套");
});

test("⑧ 背景与色块的 linear-gradient 字符串真的变成 SVG 渐变（角度、停靠都对得上）", () => {
  const html = renderProps();

  // 背景：linear-gradient(160deg, #0b1120, #1e293b)
  const bgAxis = gradientAxis(160);
  assert.match(html, /<linearGradient id="bg-gradient"/, "背景渐变没落地");
  assert.ok(
    html.includes(`x1="${bgAxis.x1}" y1="${bgAxis.y1}" x2="${bgAxis.x2}" y2="${bgAxis.y2}"`),
    `背景渐变的角度换算与渲染端不一致（期望 ${JSON.stringify(bgAxis)}）`,
  );
  assert.ok(html.includes('fill="url(#bg-gradient)"'), "背景没有用上那条渐变");

  // 色块：linear-gradient(180deg, rgba(2,6,23,0.1), #020617 78%)
  // ⚠️ rgba() 里的逗号不许当成停靠分隔符；带百分比的停靠要落到 offset 上。
  assert.match(html, /<linearGradient id="sg-scrim"/, "色块渐变没落地（202 处实测用量走的就是这一支）");
  assert.ok(html.includes('stop-color="rgba(2,6,23,0.1)"'), "rgba 停靠被逗号拆坏了");
  assert.ok(html.includes('offset="78.0%"'), "带百分比的停靠没落到 offset 上");
  assert.ok(html.includes('fill="url(#sg-scrim)"'), "色块没有用上它自己的渐变");

  // 背景纹理（544/684 张在用）：dots 走 pattern，间距按渲染端公式。
  const gap = Math.max(36, (PROPS_ENVELOPE.document.width ?? 1080) * 0.05);
  assert.ok(html.includes(`<pattern id="ov-dots" width="${gap}" height="${gap}"`), "背景纹理 dots 没落地");
});

test("⑨ 文字三档效果（shadow / outline2 / gradient）与长影：数字逐个对齐渲染端", () => {
  const html = renderProps();

  // shadow：dy = fs*0.05、stdDeviation = fs*0.06（`render.ts:1417`）。
  const title = elementOf("title");
  const tfs = title.props.fontSize as number;
  assert.match(html, /<filter id="sh-title"/, "shadow 效果没落地");
  assert.ok(
    html.includes(`dy="${Number((tfs * 0.05).toFixed(1))}" stdDeviation="${Number((tfs * 0.06).toFixed(1))}"`),
    `投影的偏移/模糊与渲染端不一致（fs=${tfs}）`,
  );
  assert.ok(html.includes('flood-color="rgba(2,6,23,0.62)"'), "shadowColorHex 没落地，投影会变成默认色");

  // outline2：内描边 fs*sc、外描边 fs*sc*2.1，外层在下（先画白后画彩再画字）。
  const outlined = elementOf("outlined");
  const ofs = outlined.props.fontSize as number;
  const sc = outlined.props.strokeScale as number;
  const inner = Number(Math.max(1, ofs * sc).toFixed(1));
  const outer = Number(Math.max(2, ofs * sc * 2.1).toFixed(1));
  assert.match(html, /paint-order="stroke"/, "描边没写 paint-order=stroke，描边会盖住字身");
  // 三层用的是同一段字，所以按「含这段字的 <text> 标签」逐层取，不按字符串位置猜。
  const layers = html.match(/<text [^>]*><tspan[^>]*>双层描边标题<\/tspan><\/text>/g) ?? [];
  assert.equal(layers.length, 3, `outline2 应当是三层（外描边 / 内描边 / 字），实际 ${layers.length} 层`);
  assert.ok(layers[0].includes(`stroke-width="${outer}"`), `最底层不是外描边（期望宽 ${outer}）`);
  assert.ok(layers[1].includes(`stroke-width="${inner}"`), `中间层不是内描边（期望宽 ${inner}）`);
  assert.equal(layers[2].includes("stroke="), false, "最上层不是干净的字身，描边会把字埋掉");
  assert.ok(layers[0].includes('fill="#ffffff"') && layers[1].includes('fill="#7f1d1d"'), "两层描边的颜色接反了");

  // gradient：fillGradient 变成 SVG 渐变并接到字的 fill 上。
  assert.match(html, /<linearGradient id="tg-gradient-line"/, "渐变字没落地");
  assert.ok(html.includes('fill="url(#tg-gradient-line)"'), "渐变字的 fill 没接上渐变");
  assert.ok(html.includes('offset="45.0%"'), "渐变字中间那个停靠丢了");

  // longshadow：层数 = clamp(round(fs*0.14), 6, 14)，每层沿 45° 偏 s*fs*0.02。
  const ls = elementOf("long-shadow");
  const lfs = ls.props.fontSize as number;
  const steps = Math.min(14, Math.max(6, Math.round(lfs * 0.14)));
  const copies = (html.match(/fill="rgba\(0,0,0,0\.34\)"/g) ?? []).length;
  assert.equal(copies, steps, `长影层数不对（期望 ${steps} 层）`);
  const far = Number((steps * lfs * 0.02).toFixed(1));
  assert.ok(html.includes(`translate(${far} ${far})`), `长影最远那一层的偏移不对（期望 ${far}）`);
});

test("⑩ effect: highlight 不再自己估算叠块（仲裁 03：块宽由引擎显式给），但要点名", () => {
  const html = renderProps();
  const el = elementOf("legacy-highlight");
  const color = el.props.highlightColor as string;

  // 渲染端那套「全角≈1.0em、ASCII≈0.55em」的估算对美术字大幅失真，
  // 叠上去就是重影加错位 —— 所以这一侧一个估算块都不许出现。
  assert.equal(html.includes(color), false, "又自己估算了一层高亮块，会与引擎显式给的块重影");
  assert.equal(/<rect[^>]*rx="[\d.]+"[^>]*fill="#fde047"/.test(html), false, "高亮块以别的写法漏了出来");

  // 但字本身照旧要上屏，而且要把「块由引擎给」这件事说出来，不静默吃掉。
  assert.ok(html.includes(el.props.text as string), "高亮那段字没上屏");
  assert.match(html, /effect: highlight/, "遇到 highlight 没点名，用户看不到块也不知道为什么");
});

test("⑪ props.src 只收 https:// 与 data:image/，别的一律不加载（入库校验 B1/B6 同一条闸）", () => {
  const html = renderProps();
  const scene = elementOf("scene");
  const badge = elementOf("badge");

  assert.ok(html.includes(`href="${scene.props.src}"`), "https 图没渲成 <image href>");
  assert.ok(html.includes(`href="${badge.props.src}"`), "data:image 图没渲成 <image href>");

  // 敌意 src 一个字都不许进 DOM，并且这一格要看得出是缺陷不是设计。
  assert.equal(html.includes("javascript:"), false, "javascript: 的 src 进了 DOM");
  assert.equal(html.includes("alert(document.domain)"), false, "敌意 src 的正文进了 DOM");
  assert.match(html, /#EEF1F5/, "被拒的图没画占位块");
  assert.match(html, /不是 https/, "被拒的图没点名，看起来就像设计里本来就有一块灰");
  // 拒掉的那串一个字都不许回显：回显等于把不可信内容搬进页面。
  assert.equal(html.includes("document.domain"), false, "被拒的 src 被原样念了出来");

  // `data:` 收的形状要与光栅器 props-raster.mjs 完全一样：它只解
  // data:image/<png|jpeg|webp>;base64,…。站内多收一种，就是站内显示得出、
  // 封面解不开 —— 又一处「两边不是同一张图」。
  const svgPayload = JSON.parse(JSON.stringify(PROPS_ENVELOPE)) as typeof PROPS_ENVELOPE;
  const target = (svgPayload.document.elements ?? []).find((e) => e.id === "badge") as DesignElement & {
    props: Record<string, unknown>;
  };
  target.props.src = "data:image/svg+xml;base64,PHN2Zy8+";
  const svgHtml = render(<WorksViewer work={propsWork()} payload={svgPayload} />);
  assert.equal(svgHtml.includes("data:image/svg+xml"), false, "data:image/svg+xml 被收下了，光栅器那边解不开");
});

test("⑮ 缺尺寸时的兜底画布与光栅器同一组数（不然长宽比都不是一个）", () => {
  const payload = {
    spec: { id: "no-size" },
    document: { elements: [{ id: "a", type: "shape", x: 0, y: 0, w: 10, h: 10, z: 1, props: { kind: "rect", fill: "#000000" } }] },
  };
  const html = render(<WorksViewer work={propsWork()} payload={payload} />);
  // props-raster.mjs:50-51 的 PROPS_DEFAULT_WIDTH / HEIGHT。
  assert.ok(html.includes('viewBox="0 0 1242 1656"'), "缺尺寸时的兜底画布与光栅器不一致");
});

test("⑫ 图的裁剪 / 圆角 / 翻转 / 落影与渲染端同一套算法", () => {
  const html = renderProps();
  const scene = elementOf("scene");
  const w = scene.w as number;
  const h = scene.h as number;
  const crop = scene.props.crop as { x: number; y: number; w: number; h: number };

  // 裁剪：`editor-interactions.ts:382` 的投影 —— 整张图铺在裁剪窗下面。
  const destX = (-crop.x / crop.w) * w;
  const destW = w / crop.w;
  assert.ok(html.includes(`x="${destX}"`), `裁剪后的横向偏移不对（期望 ${destX}）`);
  assert.ok(html.includes(`width="${destW}"`), `裁剪后的宽不对（期望 ${destW}）`);
  assert.match(html, /preserveAspectRatio="none"/, "图没按渲染端的 preserveAspectRatio=none 铺（会变形口径不一致）");

  // 圆角走 clipPath（不是 CSS 圆角）：与渲染端同一处裁法。
  assert.ok(html.includes(`<clipPath id="clip-scene"><rect x="0" y="0" width="${w}" height="${h}" rx="${scene.props.radius}">`), "图的圆角没走 clipPath");

  // 翻转：先平移一整个宽再镜像，图才不会跑出盒子。
  assert.ok(html.includes(`translate(${w} 0) scale(-1 1)`), "flipX 的变换不对");

  // 抠图落影三档：dim = min(w,h)，soft 档 dy = dim*0.015、blur = dim*0.035。
  const dim = Math.min(w, h);
  assert.ok(
    html.includes(`dy="${Number((dim * 0.015).toFixed(1))}" stdDeviation="${Number((dim * 0.035).toFixed(1))}"`),
    "抠图落影的偏移/模糊与渲染端不一致",
  );
  // CSS 滤镜白名单：filter=vivid 只许映射成渲染端那一条。
  assert.match(html, /filter:saturate\(1\.5\) contrast\(1\.05\)/, "图的 filter 没按渲染端的映射落地");
});

test("⑬ 几何：z 升序、旋转绕中心、hidden 不落墨、认不出的一律点名", () => {
  const html = renderProps();

  // z 升序：底色块（z=1）必须排在正文字（z=20）之前。
  const scrimAt = html.indexOf("url(#sg-scrim)");
  const kickerAt = html.indexOf("秋季公开课");
  assert.ok(scrimAt >= 0 && kickerAt >= 0, "底色块或正文字没渲出来");
  assert.ok(scrimAt < kickerAt, "没按 z 升序排：底色块盖到字上面了");

  // 旋转绕元素中心，与渲染端 `render.ts:1142` 同一条 transform。
  const wedge = elementOf("wedge");
  const x = wedge.x as number;
  const y = wedge.y as number;
  const w = wedge.w as number;
  const h = wedge.h as number;
  assert.ok(
    html.includes(`translate(${x + w / 2} ${y + h / 2}) rotate(${wedge.rotation}) translate(${-w / 2} ${-h / 2})`),
    "旋转不是绕元素中心，元素会甩到别处",
  );

  // 几何真的画出来了（不是所有 kind 都被兜成矩形）。
  assert.match(html, /<ellipse cx="210" cy="210"/, "circle 没画成椭圆（16,470 个实测用量走这一支）");
  assert.ok(html.includes(`points="${w / 2},0 ${w},${h} 0,${h}"`), "triangle 的三个点不对");
  // 几何一律写在元素本地坐标里（位移由外面那层 transform 给），所以 sparkle 从 (w/2, 0) 起笔。
  const sparkle = elementOf("sparkle-1");
  assert.ok(
    html.includes(`<path d="M ${(sparkle.w as number) / 2} 0 C`),
    "sparkle 没画成星芒（1,385 个实测用量走这一支）",
  );

  // 隐藏层一笔不落。
  assert.equal(html.includes("#ff00ff"), false, "hidden 的层被画出来了");

  // 认不出的东西一律点名：图形 kind、文字 effect、元素 type、背景纹理。
  assert.match(html, /kind=hexagon/, "认不出的图形没点名");
  assert.match(html, /effect: wobble/, "认不出的文字效果没点名");
  assert.match(html, /type=sticker/, "认不出的元素类型没点名");
  assert.equal(html.includes("✨"), false, "认不出的元素被硬画了出来");
});

test("⑭ props 形的字也接兜底链，且用到的每一款都在 poster-fonts.css 里", () => {
  const html = renderProps();
  const declared = declaredFamilies(readFileSync(FONT_CSS, "utf8"));
  const used = familiesUsedBy(PROPS_ENVELOPE.document);
  assert.ok(used.length >= 3, `props fixture 只用了 ${used.length} 款字，撑不起这条判据`);

  for (const family of used) {
    assert.ok(
      declared.has(normalizeFamily(family)),
      `props 形文档用了 "${family}"，${FONT_CSS} 里没有它的 @font-face（站内会落到系统字，和封面不是同一套）`,
    );
    // 每一处 fontFamily 后面都要接兜底链：拉丁 display 字没有汉字时，
    // 两边都落到 Source Han Sans CN，才不会「站内是系统 UI 字、封面是思源黑」。
    const chain = `&quot;${family}&quot;, &quot;${FALLBACK_FAMILY}&quot;, sans-serif`;
    // 指名的就是兜底那一款时，`"X", sans-serif` 本身就是那条链，不必再接一遍。
    const selfIsFallback = `font-family="&quot;${FALLBACK_FAMILY}&quot;, sans-serif"`;
    assert.ok(
      html.includes(`font-family="${chain}"`) ||
        (family === FALLBACK_FAMILY && html.includes(selfIsFallback)),
      `"${family}" 没接兜底链`,
    );
  }

  // 存量文档写 `Smiley Sans`、字体文件声明的是 `Smiley Sans Oblique`（仲裁 04）：
  // 按 alias 声明之后，文档里那个常见写法必须能命中。
  assert.ok(declared.has(normalizeFamily("Smiley Sans")), "台账 alias 没落进 CSS，存量写法 Smiley Sans 会命不中");
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
