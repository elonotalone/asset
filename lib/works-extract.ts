// 成品正文抽取层 —— **构建期**把 .pptx / .docx / .xlsx / .pdf 的真字节打开，
// 抽成站内可渲染的结构（幻灯片 / 段落 / 表格 / 页文字）。
//
// 为什么要有这一层：查看器原来只认产线位额外给的 `view.pages[]`（一页一张预览图）。
// 产线位交的是裸 .pptx / .docx / .xlsx，于是 deck / document / pdf / grid 点开就是
// 一张放大的封面 —— 用户「打不开这些素材」。等 9 位产线位补预览图不是解法：
// 素材站本来就该有能打开这些格式的能力，缺预览图只是把缺陷推给上游。
//
// 三条自律：
//   1. **绝不把字节当文字摆出来。** 抽出来的必须是文档结构里的正文
//      （OOXML 的 w:t / a:t、PDF 的文本算子），抽不出就返回 null 由查看器如实说明。
//   2. 抽取只发生在服务端（构建期），产物是纯数据，客户端不碰 node:fs / node:zlib。
//   3. 任何一步失败都只降级不抛异常 —— 9 位产线位并发写文件，半成品是常态。

import { readFileSync, statSync } from "node:fs";
import { inflateRawSync, inflateSync } from "node:zlib";
import path from "node:path";

import * as XLSX from "xlsx";

import type {
  DeckSlide,
  DocBlock,
  ExtractedContent,
  ExtractedSheet,
  PdfPage,
  WorkEntry,
} from "@/components/WorksKinds";

export type {
  DeckSlide,
  DocBlock,
  DocParagraph,
  DocTable,
  ExtractedContent,
  ExtractedSheet,
  PdfPage,
} from "@/components/WorksKinds";

/** 单份素材的读盘上限。超过就不抽（构建期不为一件素材吃掉几百兆内存）。 */
const MAX_SOURCE_BYTES = 24 * 1024 * 1024;
/** 站内表格最多画多少行 / 多少列。再多不是「查看」，是「导出」。 */
const MAX_SHEET_ROWS = 400;
const MAX_SHEET_COLS = 40;

/* ------------------------------------------------------------------ *
 * zip：OOXML（docx / pptx / xlsx）都是 zip + XML
 * ------------------------------------------------------------------ */

/**
 * 最小 zip 读取器：只走中央目录，只认 store(0) 与 deflate(8)。
 * 够读 OOXML；不支持 zip64 与加密（遇到就当读不出，返回空表）。
 */
function readZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // 末端目录记录（EOCD）在文件尾部，注释最长 65535 字节。
  const tailFrom = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= tailFrom; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (localAt + 30 > buf.length || buf.readUInt32LE(localAt) !== 0x04034b50) continue;
    const lNameLen = buf.readUInt16LE(localAt + 26);
    const lExtraLen = buf.readUInt16LE(localAt + 28);
    const dataAt = localAt + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(dataAt, dataAt + compressedSize);
    try {
      out.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
    } catch {
      // 单个条目解不开不影响其余条目（比如加密过的那一条）。
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * XML：只做取文本，不做通用解析
 * ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9A-Fa-f]+|[a-z]+);/g, (m, ent: string) => {
    if (ent.startsWith("#x") || ent.startsWith("#X")) {
      const cp = parseInt(ent.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    if (ent.startsWith("#")) {
      const cp = parseInt(ent.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[ent] ?? m;
  });
}

/** 取出 `<tag …>…</tag>` 的全部片段（不处理同名嵌套，OOXML 的 w:p / a:p 不嵌套）。 */
function blocksOf(xml: string, tag: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "g");
  const close = `</${tag}>`;
  let m: RegExpExecArray | null;
  while ((m = open.exec(xml))) {
    const end = xml.indexOf(close, open.lastIndex);
    if (end < 0) break;
    out.push(xml.slice(m.index + m[0].length, end));
    open.lastIndex = end + close.length;
  }
  return out;
}

/**
 * 一个段落里的文字：`<w:t>` / `<a:t>` 的正文，`<br/>` 变换行、`<tab/>` 变制表符。
 *
 * 只压缩半角空白。**全角空格（U+3000）与制表符要原样留着** —— 产线位就是用它们
 * 分栏的（「车均日周转次数　　3.03 次　　2.41 次」），压掉等于把表格压成一行糊字。
 */
function runText(xml: string, textTag: string): string {
  const parts: string[] = [];
  const re = new RegExp(
    `<${textTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${textTag}>|<(?:w|a):(br|tab)\\s*/>`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) parts.push(decodeXml(m[1]));
    else parts.push(m[2] === "tab" ? "\t" : "\n");
  }
  return parts
    .join("")
    .replace(/\r/g, "")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[\s\u3000]+|[\s\u3000]+$/g, "");
}

/* ------------------------------------------------------------------ *
 * .docx
 * ------------------------------------------------------------------ */

function headingLevelOf(paragraphXml: string): number {
  const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(paragraphXml)?.[1] ?? "";
  if (/^(Title|Subtitle)$/i.test(style)) return 1;
  const byName = /^Heading(\d)$/i.exec(style) ?? /^(\d)$/.exec(style);
  if (byName) return Math.min(6, Math.max(1, Number(byName[1])));
  const outline = /<w:outlineLvl\s+w:val="(\d+)"/.exec(paragraphXml)?.[1];
  if (outline !== undefined) return Math.min(6, Number(outline) + 1);
  return 0;
}

function extractDocx(buf: Buffer): ExtractedContent | null {
  const zip = readZip(buf);
  const doc = zip.get("word/document.xml");
  if (!doc) return null;
  const xml = doc.toString("utf8");
  const body = /<w:body[^>]*>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;

  const blocks: DocBlock[] = [];
  // 顺序扫描：段落与表格交替出现，表格里也有 w:p，所以按出现位置切，不能各扫各的。
  const re = /<w:tbl>([\s\S]*?)<\/w:tbl>|<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) {
      const rows = blocksOf(m[1], "w:tr")
        .map((tr) => blocksOf(tr, "w:tc").map((tc) => runText(tc, "w:t")))
        .filter((r) => r.length > 0);
      if (rows.length > 0) blocks.push({ kind: "table", rows });
      continue;
    }
    const p = m[2] ?? "";
    const text = runText(p, "w:t");
    if (!text) continue;
    const level = headingLevelOf(p);
    const listed = /<w:numPr>/.test(p);
    blocks.push({
      kind: level > 0 ? "heading" : listed ? "list" : "para",
      level,
      text,
    });
  }

  return blocks.length > 0 ? { form: "doc", from: "docx", blocks } : null;
}

/* ------------------------------------------------------------------ *
 * .pptx
 * ------------------------------------------------------------------ */

function slideLines(slideXml: string): { title: string; lines: string[] } {
  let title = "";
  const lines: string[] = [];

  for (const sp of blocksOf(slideXml, "p:sp")) {
    const isTitle = /<p:ph[^>]*\btype="(?:ctrTitle|title)"/.test(sp);
    const texts = blocksOf(sp, "a:p")
      .map((p) => runText(p, "a:t"))
      .filter(Boolean);
    if (texts.length === 0) continue;
    if (isTitle && !title) {
      title = texts.join(" ");
      if (texts.length > 1) lines.push(...texts.slice(1));
      continue;
    }
    lines.push(...texts);
  }

  // 表格里的文字也是这一页的正文，漏掉会让「数据页」看起来是空白页。
  for (const tbl of blocksOf(slideXml, "a:tbl")) {
    for (const tr of blocksOf(tbl, "a:tr")) {
      const cells = blocksOf(tr, "a:tc")
        .map((tc) => runText(tc, "a:t"))
        .filter(Boolean);
      if (cells.length > 0) lines.push(cells.join(" · "));
    }
  }

  return { title, lines };
}

function extractPptx(buf: Buffer): ExtractedContent | null {
  const zip = readZip(buf);
  const names = [...zip.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)/.exec(a)![1]) - Number(/(\d+)/.exec(b)![1]));
  if (names.length === 0) return null;

  const raw = names.map((name, i) => {
    const { title, lines } = slideLines(zip.get(name)!.toString("utf8"));
    const noteXml = zip.get(name.replace("slides/slide", "notesSlides/notesSlide"));
    const notes = noteXml
      ? blocksOf(noteXml.toString("utf8"), "a:p")
          .map((p) => runText(p, "a:t"))
          .filter((t) => t && !/^\d+$/.test(t))
      : [];
    return { index: i + 1, title, lines, notes };
  });

  // 页脚与页码是母版套在每页上的固定字串，不是这一页的内容。
  // 出现在多数页上的那几行原样列出来，读者每翻一页都要再读一遍同样的话。
  const seenOn = new Map<string, number>();
  for (const s of raw) {
    for (const line of new Set(s.lines)) seenOn.set(line, (seenOn.get(line) ?? 0) + 1);
  }
  const chrome = (line: string) =>
    /^\d+\s*[/／]\s*\d+$/.test(line) ||
    (raw.length >= 4 && (seenOn.get(line) ?? 0) > raw.length / 2);

  const slides: DeckSlide[] = raw.map((s) => {
    const lines = s.lines.filter((l) => !chrome(l));
    // 没有标题占位符的版式（工具产的多半如此）：把这一页第一行当标题。
    const title = s.title || lines[0] || "";
    return { index: s.index, title, lines: s.title ? lines : lines.slice(1), notes: s.notes };
  });

  // 一页文字都没有的演示文稿（纯图版）不算「抽出来了」，让查看器走别的路。
  const anyText = slides.some((s) => s.title || s.lines.length > 0);
  return anyText ? { form: "slides", from: "pptx", slides } : null;
}

/* ------------------------------------------------------------------ *
 * .xlsx（SheetJS，站里本来就有这个依赖）
 * ------------------------------------------------------------------ */

function extractXlsx(buf: Buffer): ExtractedContent | null {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer", cellDates: true, cellStyles: false });
  } catch {
    return null;
  }

  const sheets: ExtractedSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
      raw: false,
    });
    if (matrix.length === 0) continue;

    const clip = (row: unknown[]) =>
      row.slice(0, MAX_SHEET_COLS).map((c) => {
        if (c === null || c === undefined || c === "") return null;
        if (typeof c === "number") return c;
        return String(c);
      });

    // 表头未必是第一行：产线位常把标题写成跨列的首行（只有一个非空格）。
    // 那样的行是**说明**，不是表头；把它们提到表上方，表头取第一行「像表头」的行。
    const filled = (row: unknown[]) => clip(row).filter((c) => c !== null && String(c).trim()).length;
    const widest = Math.max(...matrix.map(filled), 1);
    let headerAt = matrix.findIndex((row) => filled(row) >= 2 && filled(row) >= widest * 0.6);
    if (headerAt < 0) headerAt = 0;

    const caption = matrix
      .slice(0, headerAt)
      .map((row) => clip(row).filter((c) => c !== null && String(c).trim()).join(" "))
      .filter(Boolean);
    const header = clip(matrix[headerAt]).map((c) => (c === null ? "" : String(c)));
    const hasHeader = header.some((h) => h.trim().length > 0);

    sheets.push({
      name,
      caption: caption.length > 0 ? caption : undefined,
      header: hasHeader ? header : undefined,
      rows: matrix.slice(hasHeader ? headerAt + 1 : headerAt, headerAt + 1 + MAX_SHEET_ROWS).map(clip),
    });
  }

  return sheets.length > 0 ? { form: "sheets", from: "xlsx", sheets } : null;
}

/* ------------------------------------------------------------------ *
 * .pdf
 * ------------------------------------------------------------------ */

/** `<0041> <0042> <0043>` / `<00410042>` 这类十六进制串 → 字符串。 */
function hexToUnits(hex: string, bytesPerUnit: number): number[] {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, "");
  const step = bytesPerUnit * 2;
  const out: number[] = [];
  for (let i = 0; i + step <= clean.length; i += step) {
    out.push(parseInt(clean.slice(i, i + step), 16));
  }
  return out;
}

function hexToText(hex: string): string {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, "");
  let s = "";
  for (let i = 0; i + 4 <= clean.length; i += 4) {
    s += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
  }
  return s;
}

/** ToUnicode CMap → 字符码到文字的映射。认 bfchar 与 bfrange 两种写法。 */
function parseToUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const body of blocksBetween(cmap, "beginbfchar", "endbfchar")) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) map.set(parseInt(m[1], 16), hexToText(m[2]));
  }
  for (const body of blocksBetween(cmap, "beginbfrange", "endbfrange")) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (m[3] !== undefined) {
        const base = hexToUnits(m[3], 2);
        for (let c = lo; c <= hi && c - lo < 65_536; c++) {
          const units = [...base];
          units[units.length - 1] += c - lo;
          map.set(c, String.fromCharCode(...units));
        }
      } else if (m[4] !== undefined) {
        const items = [...m[4].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => hexToText(x[1]));
        items.forEach((t, i) => map.set(lo + i, t));
      }
    }
  }
  return map;
}

function blocksBetween(s: string, open: string, close: string): string[] {
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const a = s.indexOf(open, at);
    if (a < 0) break;
    const b = s.indexOf(close, a + open.length);
    if (b < 0) break;
    out.push(s.slice(a + open.length, b));
    at = b + close.length;
  }
  return out;
}

interface PdfObject {
  dict: string;
  stream: Buffer | null;
}

/** 扫全文取对象。不走 xref（增量更新的 PDF 里 xref 常常指不准），按 `N 0 obj` 直接切。 */
function readPdfObjects(buf: Buffer): Map<number, PdfObject> {
  const latin = buf.toString("latin1");
  const objs = new Map<number, PdfObject>();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin))) {
    const num = Number(m[1]);
    const bodyAt = m.index + m[0].length;
    const endAt = latin.indexOf("endobj", bodyAt);
    if (endAt < 0) continue;
    const body = latin.slice(bodyAt, endAt);

    const sIdx = body.indexOf("stream");
    let stream: Buffer | null = null;
    let dict = body;
    if (sIdx >= 0) {
      dict = body.slice(0, sIdx);
      const nl = /stream\r\n|stream\n|stream\r/.exec(body.slice(sIdx));
      if (nl) {
        const dataFrom = bodyAt + sIdx + nl.index + nl[0].length;
        const endStream = latin.indexOf("endstream", dataFrom);
        if (endStream > dataFrom) {
          stream = buf.subarray(dataFrom, endStream);
        }
      }
    }
    objs.set(num, { dict, stream });
  }
  return objs;
}

function decodeStream(obj: PdfObject): string | null {
  if (!obj.stream) return null;
  const filter = /\/Filter\s*\/(\w+)/.exec(obj.dict)?.[1];
  try {
    if (!filter) return obj.stream.toString("latin1");
    if (filter === "FlateDecode") return inflateSync(obj.stream).toString("latin1");
  } catch {
    return null;
  }
  return null; // LZW / DCT / 其它滤镜：不猜，交给降级路径
}

/** PDF 字符串字面量 `(…)` 的转义。 */
function pdfLiteral(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") {
      out.push(s.charCodeAt(i));
      continue;
    }
    const n = s[++i];
    if (n === undefined) break;
    const simple: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
    if (n in simple) out.push(simple[n]);
    else if (n >= "0" && n <= "7") {
      let oct = n;
      while (oct.length < 3 && s[i + 1] >= "0" && s[i + 1] <= "7") oct += s[++i];
      out.push(parseInt(oct, 8));
    } else if (n === "\n") continue;
    else out.push(n.charCodeAt(0));
  }
  return out;
}

interface PdfFont {
  twoByte: boolean;
  toUnicode: Map<number, string> | null;
}

function decodeCodes(codes: number[], font: PdfFont | undefined): string {
  if (!font) return codes.map((c) => String.fromCharCode(c)).join("");
  if (!font.twoByte) {
    return codes.map((c) => font.toUnicode?.get(c) ?? String.fromCharCode(c)).join("");
  }
  let s = "";
  for (let i = 0; i + 1 < codes.length; i += 2) {
    const code = (codes[i] << 8) | codes[i + 1];
    s += font.toUnicode?.get(code) ?? "";
  }
  return s;
}

/** 一页内容流里的文字，按 Td / TD / T* / ' 断行。 */
function pageText(content: string, fonts: Map<string, PdfFont>): string[] {
  const lines: string[] = [];
  let current = "";
  let font: PdfFont | undefined;

  const flush = () => {
    const t = current.replace(/\s+/g, " ").trim();
    if (t) lines.push(t);
    current = "";
  };

  const re =
    /\/([^\s/<>[\]()]+)\s+[\d.]+\s+Tf|\((?:\\.|[^\\()])*\)\s*(Tj|TJ|'|")|\[((?:\\.|[^\\\]])*)\]\s*TJ|<([0-9A-Fa-f\s]*)>\s*Tj|(T\*|Td|TD|ET)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m[1] !== undefined) {
      font = fonts.get(m[1]);
      continue;
    }
    if (m[2] !== undefined) {
      const lit = /\((?:\\.|[^\\()])*\)/.exec(m[0])![0].slice(1, -1);
      if (m[2] === "'" || m[2] === '"') flush();
      current += decodeCodes(pdfLiteral(lit), font);
      continue;
    }
    if (m[3] !== undefined) {
      const parts = [...m[3].matchAll(/\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]+)>|(-?[\d.]+)/g)];
      for (const p of parts) {
        if (p[2] !== undefined) {
          // TJ 数组里的数字是字间微调（单位 1/1000 em）。负得多就是排版拉开的空档，
          // 抽文字时不补空格，「Site B」和「11 checks」会粘成一个词。
          if (Number(p[2]) < -120 && current && !/[\s\u3000]$/.test(current)) current += " ";
        } else if (p[1] !== undefined) {
          current += decodeCodes(hexToUnits(p[1], 1), font);
        } else {
          current += decodeCodes(pdfLiteral(p[0].slice(1, -1)), font);
        }
      }
      continue;
    }
    if (m[4] !== undefined) {
      current += decodeCodes(hexToUnits(m[4], 1), font);
      continue;
    }
    flush();
  }
  flush();
  return lines;
}

function fontsOfPage(pageDict: string, objs: Map<number, PdfObject>): Map<string, PdfFont> {
  const fonts = new Map<string, PdfFont>();
  let resources = /\/Resources\s*(<<[\s\S]*?>>\s*)\/?/.exec(pageDict)?.[1];
  const resRef = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(pageDict)?.[1];
  if (!resources && resRef) resources = objs.get(Number(resRef))?.dict;
  if (!resources) return fonts;

  let fontDict = /\/Font\s*<<([\s\S]*?)>>/.exec(resources)?.[1];
  const fontRef = /\/Font\s+(\d+)\s+\d+\s+R/.exec(resources)?.[1];
  if (!fontDict && fontRef) fontDict = objs.get(Number(fontRef))?.dict;
  if (!fontDict) return fonts;

  for (const [, name, num] of fontDict.matchAll(/\/([^\s/]+)\s+(\d+)\s+\d+\s+R/g)) {
    const fo = objs.get(Number(num));
    if (!fo) continue;
    const twoByte = /\/Subtype\s*\/Type0/.test(fo.dict);
    const tuRef = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(fo.dict)?.[1];
    const tu = tuRef ? objs.get(Number(tuRef)) : undefined;
    const cmap = tu ? decodeStream(tu) : null;
    fonts.set(name, { twoByte, toUnicode: cmap ? parseToUnicode(cmap) : null });
  }
  return fonts;
}

/** 页序：从 /Type /Pages 的 /Kids 递归展开；展不开就按对象号升序。 */
function pageOrder(objs: Map<number, PdfObject>): number[] {
  const isPage = (d: string) => /\/Type\s*\/Page\b/.test(d);
  const roots = [...objs.entries()].filter(([, o]) => /\/Type\s*\/Pages\b/.test(o.dict) && !/\/Parent\b/.test(o.dict));
  const out: number[] = [];
  const seen = new Set<number>();

  const walk = (num: number, depth: number) => {
    if (depth > 32 || seen.has(num)) return;
    seen.add(num);
    const o = objs.get(num);
    if (!o) return;
    if (isPage(o.dict)) {
      out.push(num);
      return;
    }
    const kids = /\/Kids\s*\[([\s\S]*?)\]/.exec(o.dict)?.[1] ?? "";
    for (const [, k] of kids.matchAll(/(\d+)\s+\d+\s+R/g)) walk(Number(k), depth + 1);
  };
  for (const [num] of roots) walk(num, 0);

  if (out.length === 0) {
    return [...objs.entries()]
      .filter(([, o]) => isPage(o.dict))
      .map(([n]) => n)
      .sort((a, b) => a - b);
  }
  return out;
}

/** 抽出来的东西像不像人话：控制字符与替换符太多就当没抽出来。 */
function looksLikeText(s: string): boolean {
  if (s.trim().length < 8) return false;
  const bad = (s.match(/[\uFFFD\u0000-\u0008\u000B\u000E-\u001F]/g) ?? []).length;
  return bad / s.length < 0.05;
}

function extractPdf(buf: Buffer): ExtractedContent | null {
  const objs = readPdfObjects(buf);
  if (objs.size === 0) return null;

  const pages: PdfPage[] = [];
  pageOrder(objs).forEach((num, i) => {
    const page = objs.get(num)!;
    const contentRefs = [
      ...(/\/Contents\s+(\d+)\s+\d+\s+R/.exec(page.dict)
        ? [/\/Contents\s+(\d+)\s+\d+\s+R/.exec(page.dict)![1]]
        : []),
      ...[...(/\/Contents\s*\[([\s\S]*?)\]/.exec(page.dict)?.[1] ?? "").matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => m[1]),
    ];
    const content = contentRefs
      .map((r) => {
        const o = objs.get(Number(r));
        return o ? decodeStream(o) : null;
      })
      .filter((c): c is string => Boolean(c))
      .join("\n");
    if (!content) return;
    const lines = pageText(content, fontsOfPage(page.dict, objs));
    if (lines.length > 0) pages.push({ index: i + 1, lines });
  });

  if (pages.length === 0) return null;
  const all = pages.flatMap((p) => p.lines).join("\n");
  if (!looksLikeText(all)) return null;
  return { form: "pages", from: "pdf", pages };
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

const PUBLIC_DIR = path.join(process.cwd(), "public");

/** 同一份文件构建期只抽一次。键里带 mtime，dev 下改了文件会重抽。 */
const cache = new Map<string, ExtractedContent | null>();

/** 按扩展名开一份文件。自检脚本直接打这个入口（不必先造一条清单片段）。 */
export function extractSourceFile(abs: string): ExtractedContent | null {
  const ext = path.extname(abs).toLowerCase();
  const buf = readFileSync(abs);
  switch (ext) {
    case ".docx":
      return extractDocx(buf);
    case ".pptx":
      return extractPptx(buf);
    case ".xlsx":
    case ".xlsm":
      return extractXlsx(buf);
    case ".pdf":
      return extractPdf(buf);
    default:
      return null;
  }
}

/**
 * 一件成品的站内可读正文。抽不出来返回 null —— 查看器据此如实说明，
 * **绝不拿字节凑一屏文字**。
 */
export function extractWorkContent(work: WorkEntry): ExtractedContent | null {
  const rel = work.view.src.split(/[?#]/)[0];
  if (!rel.startsWith("/") || rel.includes("..")) return null;
  const abs = path.join(PUBLIC_DIR, decodeURIComponent(rel));
  if (!abs.startsWith(PUBLIC_DIR + path.sep)) return null;

  let key: string;
  try {
    const st = statSync(abs);
    if (!st.isFile()) return null;
    if (st.size > MAX_SOURCE_BYTES) {
      console.warn(`[works] ${work.id} 的 ${rel} 超过 ${MAX_SOURCE_BYTES} 字节，站内不抽正文`);
      return null;
    }
    key = `${abs}:${st.mtimeMs}:${st.size}`;
  } catch {
    return null;
  }

  if (cache.has(key)) return cache.get(key)!;
  let out: ExtractedContent | null = null;
  try {
    out = extractSourceFile(abs);
  } catch (err) {
    console.warn(`[works] ${work.id} 的 ${rel} 抽正文失败：${String(err)}`);
  }
  if (!out) {
    console.warn(`[works] ${work.id} 的 ${rel} 抽不出站内可读正文，详情页只能给封面 + 下载`);
  }
  cache.set(key, out);
  return out;
}
