// A1 的抽取器自检 —— 一条命令证明「deck / document / pdf / grid 点开真的读得到内容」。
//
//   export PATH="/host/usr/bin:$PATH"
//   cd /root/projects/asset
//   bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- \
//     node --import ./tests/register-tsx.mjs lib/works-extract.selfcheck.mjs
//
// 两部分：
//   ① public/works/ 下产线位交上来的真 .pptx / .docx / .xlsx 全部逐件抽一遍，
//      打印抽到的页数 / 段落数 / 表格数与头几行原文 —— 抽不出的当场报 FAIL。
//   ② 现搓两份 PDF（标准字体一份、Type0 + ToUnicode 一份）打 PDF 那条路。
//      库里今天还没有 .pdf 成品（P5 未交），这一段是替它先把路走通，
//      也是「扫描件抽不出就如实降级」那条分支的对照组。
//
// 这是自检脚本，不是产品代码：它不进任何页面，只被人手动跑。

import { deflateSync } from "node:zlib";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { extractSourceFile } from "./works-extract.ts";

const PUBLIC_WORKS = path.join(process.cwd(), "public", "works");
const WANTED = /\.(pptx|docx|xlsx|pdf)$/i;

let failures = 0;

function head(label, s) {
  console.log(`      ${label}${s.length > 72 ? `${s.slice(0, 71)}…` : s}`);
}

function report(file, out) {
  if (!out) {
    failures++;
    console.log(`  FAIL  ${file} —— 抽不出可读正文`);
    return;
  }
  if (out.form === "slides") {
    console.log(`  ok    ${file}  幻灯片 ${out.slides.length} 页`);
    for (const s of out.slides.slice(0, 2)) head(`[${s.index}] `, s.title || s.lines[0] || "（无文字）");
  } else if (out.form === "doc") {
    const tables = out.blocks.filter((b) => b.kind === "table").length;
    console.log(`  ok    ${file}  段落块 ${out.blocks.length}（其中表格 ${tables}）`);
    for (const b of out.blocks.slice(0, 2)) head("", b.kind === "table" ? b.rows[0].join(" | ") : b.text);
  } else if (out.form === "sheets") {
    console.log(`  ok    ${file}  工作表 ${out.sheets.length}`);
    for (const s of out.sheets) head(`[${s.name}] `, (s.header ?? []).join(" | ") || `${s.rows?.length ?? 0} 行`);
  } else if (out.form === "pages") {
    // 抽 PDF 时最阴的一种失败：字符码没解码，原样以十六进制流进正文。
    // 它读起来「像文字」，`looksLikeText` 放行，眼睛也容易滑过去 —— 所以在这里钉住。
    const raw = out.pages.flatMap((p) => p.lines).join("\n").match(/\b[0-9A-F]{8,}\b/g);
    if (raw) {
      failures++;
      console.log(`  FAIL  ${file}  有 ${raw.length} 处字符码没解码：${raw[0]}`);
      return;
    }
    console.log(`  ok    ${file}  文字页 ${out.pages.length}`);
    for (const p of out.pages) head(`[${p.index}] `, p.lines.join(" / "));
  }
}

console.log("① public/works 下的真成品");
if (!existsSync(PUBLIC_WORKS)) {
  console.log("  （public/works 还不存在，产线位一件都没交）");
} else {
  const found = [];
  for (const type of readdirSync(PUBLIC_WORKS)) {
    const dir = path.join(PUBLIC_WORKS, type);
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names.filter((n) => WANTED.test(n))) found.push(path.join(dir, n));
  }
  if (found.length === 0) console.log("  （还没有 .pptx / .docx / .xlsx 成品）");
  for (const abs of found.sort()) report(path.relative(process.cwd(), abs), extractSourceFile(abs));
}

console.log("\n② 现搓的 PDF（库里还没有真 .pdf 成品时的替身）");

function pdf(objects) {
  let out = Buffer.from("%PDF-1.7\n", "latin1");
  objects.forEach((body, i) => {
    out = Buffer.concat([
      out,
      Buffer.from(`${i + 1} 0 obj\n`, "latin1"),
      Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"),
      Buffer.from("\nendobj\n", "latin1"),
    ]);
  });
  return Buffer.concat([out, Buffer.from("trailer <</Root 1 0 R>>\n%%EOF\n", "latin1")]);
}

function flateStream(data) {
  const z = deflateSync(Buffer.from(data, "latin1"));
  return Buffer.concat([
    Buffer.from(`<</Filter/FlateDecode/Length ${z.length}>>\nstream\n`, "latin1"),
    z,
    Buffer.from("\nendstream", "latin1"),
  ]);
}

const dir = mkdtempSync(path.join(tmpdir(), "a1-pdf-"));

const simple = pdf([
  "<</Type/Catalog/Pages 2 0 R>>",
  "<</Type/Pages/Kids[3 0 R]/Count 1>>",
  "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
  flateStream(
    "BT /F1 24 Tf 72 700 Td (Quarterly Field Report) Tj\n" +
      "0 -32 Td /F1 12 Tf [(Site B) -600 (11 checks) -600 (0 exceptions)] TJ ET",
  ),
  "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
]);
writeFileSync(path.join(dir, "simple.pdf"), simple);

const line = "冷链温控巡检记录";
const codes = [...line].map((_, i) => (i + 1).toString(16).padStart(4, "0")).join("");
const bfchar = [...line]
  .map((ch, i) => `<${(i + 1).toString(16).padStart(4, "0")}> <${ch.charCodeAt(0).toString(16).padStart(4, "0")}>`)
  .join("\n");
const cid = pdf([
  "<</Type/Catalog/Pages 2 0 R>>",
  "<</Type/Pages/Kids[3 0 R]/Count 1>>",
  "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources 6 0 R/Contents 4 0 R>>",
  flateStream(`BT /F2 18 Tf 72 700 Td <${codes}> Tj ET`),
  "<</Type/Font/Subtype/Type0/BaseFont/NotoSansCJKsc/Encoding/Identity-H/ToUnicode 7 0 R>>",
  "<</Font<</F2 5 0 R>>>>",
  flateStream(`begincmap\n${line.length} beginbfchar\n${bfchar}\nendbfchar\nendcmap`),
]);
writeFileSync(path.join(dir, "cid.pdf"), cid);

for (const [name, expect] of [
  ["simple.pdf", "Site B 11 checks 0 exceptions"],
  ["cid.pdf", line],
]) {
  const out = extractSourceFile(path.join(dir, name));
  report(name, out);
  const got = out?.form === "pages" ? out.pages.flatMap((p) => p.lines).join("\n") : "";
  if (!got.includes(expect)) {
    failures++;
    console.log(`  FAIL  ${name} 里读不回 ${JSON.stringify(expect)}`);
  }
}

console.log(failures === 0 ? "\n全部通过。" : `\n${failures} 项未通过。`);
process.exit(failures === 0 ? 0 : 1);
