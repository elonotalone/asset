import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createSiteZip } from "../lib/site-zip.ts";
import { emitStandaloneSite } from "../lib/template-emit-site.ts";
import { allTemplates, subByKey, TARGET_TOTAL } from "../lib/template-taxonomy.ts";
import { dnaFor } from "../lib/template-dna.ts";
import { GET, generateStaticParams } from "../app/templates/[slug]/route.ts";

const PROJECT_ROOT = new URL("..", import.meta.url).pathname;

// 收敛后差异只剩构成与装两根轴，按版式家族取样只能拿到 4 个站，覆盖不了判据。
function samplesByLayout() {
  const samples = new Map();
  for (const meta of allTemplates()) {
    const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
    const key = `${dna.shape.key}|${dna.skin.key}`;
    if (!samples.has(key)) samples.set(key, meta);
  }
  return [...samples.values()];
}

function contextFor(meta) {
  const found = subByKey(meta.subKey);
  assert.ok(found, `${meta.slug}: 找不到子类`);
  return { meta, industry: found.ind, sub: found.sub };
}

function textFile(site, path) {
  const file = site.files.find((candidate) => candidate.path === path);
  assert.ok(file?.text, `${site.slug}: ${path} 缺失或为空`);
  return file.text;
}

function withoutInertSvgNamespaces(text) {
  return text.replace(/xmlns=(["'])http:\/\/www\.w3\.org\/2000\/svg\1/g, "");
}

function assertNoExternalUrl(text, label) {
  assert.doesNotMatch(withoutInertSvgNamespaces(text), /https?:\/\//i, `${label} 留有外链`);
}

test("跨版式发射的站点只引相对 CSS/JS，每张图都随包携带", () => {
  const samples = samplesByLayout();
  assert.ok(samples.length >= 20, `版式家族抽样不足：${samples.length}`);
  let varietyChecks = 0;

  for (const meta of samples) {
    const { industry, sub } = contextFor(meta);
    const site = emitStandaloneSite(meta, industry, sub);
    assert.equal(site.slug, meta.slug);
    assert.equal(new Set(site.files.map((file) => file.path)).size, site.files.length);

    for (const file of site.files) {
      if (file.text !== undefined) assertNoExternalUrl(file.text, `${meta.slug}/${file.path}`);
    }

    const html = textFile(site, "index.html");
    const css = textFile(site, "assets/site.css");
    const js = textFile(site, "assets/site.js");
    assert.match(html, /<link rel="stylesheet" href="assets\/site\.css"\/>/);
    assert.match(html, /<script src="assets\/site\.js"><\/script>/);
    assert.doesNotMatch(html, /<style\b/i, `${meta.slug}: 引擎样式未拆出`);
    assert.match(css, /body\{font-family:/, `${meta.slug}: 引擎自带样式未进 CSS`);
    assert.match(js, /function\s+show\(page\)/, `${meta.slug}: 页内交互未进 JS`);

    const srcs = [...html.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1/gi)].map((match) => match[2]);
    assert.ok(srcs.length > 0, `${meta.slug}: 没有任何图片`);
    const emittedPaths = new Set(site.files.map((file) => file.path));
    for (const src of srcs) {
      assert.match(src, /^images\/[\w.-]+\.webp$/);
      assert.ok(emittedPaths.has(src), `${meta.slug}: ${src} 未随站点发射`);
    }
    for (const file of site.files.filter((candidate) => candidate.path.startsWith("images/"))) {
      assert.ok(file.sourcePath, `${meta.slug}/${file.path}: 缺镜像源路径`);
      assert.ok(existsSync(join(PROJECT_ROOT, file.sourcePath)), `${meta.slug}/${file.path}: 镜像文件不存在`);
    }

    const zhSrcs = srcs.slice(0, srcs.length / 2);
    if (zhSrcs.length >= 2) {
      varietyChecks += 1;
      const firstPoolWalk = zhSrcs.slice(0, Math.min(14, zhSrcs.length));
      assert.equal(
        new Set(firstPoolWalk).size,
        firstPoolWalk.length,
        `${meta.slug}: 图池未用完就重复配图`,
      );
    }
    if (srcs.length >= 3) {
      const counts = new Map();
      for (const src of srcs) counts.set(src, (counts.get(src) ?? 0) + 1);
      assert.ok(Math.max(...counts.values()) / srcs.length <= 0.5, `${meta.slug}: 单图超过全站图片的一半`);
    }
  }
  assert.ok(varietyChecks >= 10, `可检查配图去重的版式不足：${varietyChecks}`);
});

test("同一 slug 反复发射的文件与图片选择恒定", () => {
  const { meta, industry, sub } = contextFor(samplesByLayout()[0]);
  const first = emitStandaloneSite(meta, industry, sub);
  const second = emitStandaloneSite(meta, industry, sub);
  assert.deepEqual(second, first);
});

test("ZIP 书写器产物恒定，且标准 unzip 可完整读回", () => {
  const entries = [
    { path: "index.html", data: "<!doctype html><title>离线站点</title>" },
    { path: "assets/site.css", data: "body{color:#123}" },
    { path: "images/photo.webp", data: new Uint8Array([0, 255, 19, 128, 7]) },
  ];
  const first = createSiteZip(entries);
  const second = createSiteZip(entries);
  assert.deepEqual(first, second, "相同输入应产生逐字节相同的 ZIP");

  const dir = mkdtempSync(join(tmpdir(), "template-site-zip-"));
  const archive = join(dir, "site.zip");
  try {
    writeFileSync(archive, first);
    const listed = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    assert.deepEqual(listed.stdout.trim().split("\n"), entries.map((entry) => entry.path));

    for (const entry of entries) {
      const extracted = spawnSync("unzip", ["-p", archive, entry.path]);
      assert.equal(extracted.status, 0, extracted.stderr.toString());
      const expected = typeof entry.data === "string" ? Buffer.from(entry.data) : Buffer.from(entry.data);
      assert.deepEqual(extracted.stdout, expected, `${entry.path} 解压后字节不一致`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ZIP 书写器拒绝路径穿越和重名文件", () => {
  assert.throws(() => createSiteZip([{ path: "../outside", data: "x" }]), /Unsafe/);
  assert.throws(
    () => createSiteZip([{ path: "same", data: "a" }, { path: "same", data: "b" }]),
    /Duplicate/,
  );
});

test("预览路由内联样式与交互，配图只走同源镜像", async () => {
  const meta = samplesByLayout().find((candidate) => {
    const { industry, sub } = contextFor(candidate);
    return emitStandaloneSite(candidate, industry, sub).files.some((file) => file.path.startsWith("images/"));
  });
  assert.ok(meta);
  const response = await GET(
    new Request(`http://asset.local/templates/${meta.slug}?lang=en`),
    { params: Promise.resolve({ slug: meta.slug }) },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
  assert.equal(response.headers.get("content-disposition"), null);
  const html = await response.text();
  assert.match(html, /<style>[\s\S]*body\{font-family:/);
  assert.match(html, /<script>[\s\S]*function\s+show\(page\)/);
  assert.match(html, /src="\/template-photos\/[\w.-]+\.webp"/);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assertNoExternalUrl(html, `${meta.slug}/preview`);
});

test("下载路由返回完整 ZIP，且 404 与静态参数保持正常", async () => {
  const { meta, industry, sub } = contextFor(samplesByLayout()[0]);
  const expected = emitStandaloneSite(meta, industry, sub, { defaultLang: "zh" });
  const response = await GET(
    new Request(`http://asset.local/templates/${meta.slug}?download=1`),
    { params: Promise.resolve({ slug: meta.slug }) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.equal(
    response.headers.get("content-disposition"),
    `attachment; filename="${meta.slug}.zip"`,
  );

  const dir = mkdtempSync(join(tmpdir(), "template-route-zip-"));
  const archive = join(dir, `${meta.slug}.zip`);
  try {
    writeFileSync(archive, new Uint8Array(await response.arrayBuffer()));
    const listed = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    assert.deepEqual(
      listed.stdout.trim().split("\n"),
      expected.files.map((file) => file.path),
    );
    const index = spawnSync("unzip", ["-p", archive, "index.html"], { encoding: "utf8" });
    assert.equal(index.status, 0, index.stderr);
    assertNoExternalUrl(index.stdout, `${meta.slug}.zip/index.html`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  assert.equal(generateStaticParams().length, TARGET_TOTAL);
  const missing = await GET(
    new Request("http://asset.local/templates/not-a-template"),
    { params: Promise.resolve({ slug: "not-a-template" }) },
  );
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), "Template not found");
});
