import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDS = [
  "deck-html-nocturne-01",
  "deck-html-monotype-01",
  "deck-html-manual-01",
];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function bytes(relativePath) {
  return readFileSync(path.join(ROOT, relativePath));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertReading(reading) {
  const value = bytes(reading.path);
  assert.equal(value.length, reading.byteSize, reading.path);
  assert.equal(sha256(value), reading.sha256, reading.path);
}

function simulateEditorResolver(source) {
  const urls = {};
  for (const [id, candidate] of Object.entries(source.assetUrls || {})) {
    const url = new URL(candidate);
    assert.equal(url.protocol, "https:");
    urls[id] = url.toString();
  }
  return urls;
}

async function simulateEditorFetch(url, sourceMedia) {
  const media = sourceMedia.find((item) => item.url === url);
  assert.ok(media, url);
  return bytes(media.path);
}

function allFiles(root) {
  const out = [];
  for (const name of readdirSync(root)) {
    const candidate = path.join(root, name);
    const stat = lstatSync(candidate);
    assert.equal(stat.isSymbolicLink(), false, candidate);
    if (stat.isDirectory()) out.push(...allFiles(candidate));
    else out.push(candidate);
  }
  return out;
}

test("three official HTML decks close source, preview, runtime and receipt bytes", async () => {
  const works = readJson("content/works/deck.html.json");
  const manifest = readJson("content/active-runtime/manifest.deck-html.json");
  const rootManifest = readJson("active-runtime-manifest.deck-html.json");
  const plan = readJson("active-runtime-plan.deck-html.json");
  const summary = readJson(
    "content/receipts/deck-html/production-summary.json",
  );

  assert.deepEqual(
    works.map((item) => item.id),
    IDS,
  );
  assert.deepEqual(rootManifest, manifest);
  assert.deepEqual(
    manifest.items.map((item) => item.id),
    IDS,
  );
  assert.deepEqual(
    plan.items.map((item) => item.item.id),
    IDS,
  );
  assert.deepEqual(
    summary.items.map((item) => item.id),
    IDS,
  );
  assert.equal(summary.count, 3);

  assert.equal(new Set(works.map((item) => item.styleId)).size, 3);
  assert.equal(new Set(summary.items.map((item) => item.purpose)).size, 3);
  const artifactIds = new Set();
  const revisionIds = new Set();

  for (const work of works) {
    assert.equal(work.artifactType, "deck");
    assert.equal(work.deliveryFamily, "html");
    assert.equal(Object.hasOwn(work.view, "runtime"), false);
    assert.equal(work.view.src, work.view.source);
    assert.ok(work.view.pages.length >= 8);

    const receipt = readJson(
      `content/receipts/deck-html/${work.id}/production.json`,
    );
    const writer = readJson(
      `content/receipts/deck-html/${work.id}/writer.json`,
    );
    const planned = readJson(
      `content/receipts/deck-html/${work.id}/ingest/planned-attested.json`,
    );
    const ingestReport = readJson(
      `content/receipts/deck-html/${work.id}/ingest/ingest-plan-report.json`,
    );
    const executionReport = readJson(
      `content/receipts/deck-html/${work.id}/ingest/ingest-execution-report.json`,
    );
    const ingested = readJson(
      `content/receipts/deck-html/${work.id}/ingest/ingested-attested.json`,
    );
    const planItem = plan.items.find((item) => item.item.id === work.id);

    assert.equal(receipt.id, work.id);
    assert.equal(receipt.artifactType, "deck");
    assert.equal(receipt.deliveryFamily, "html");
    assert.equal(writer.writer, "oceanleo-ui deck-html-package.ts");
    assert.equal(writer.readings.utf8, true);
    assert.equal(writer.readings.remoteDependencies.count, 0);
    assert.equal(writer.readings.inlineImages.allEmbedded, true);
    assert.equal(writer.readings.scriptClosure.externalCount, 0);
    assert.equal(writer.readings.scriptClosure.externalStyleCount, 0);
    assert.equal(writer.readings.scriptClosure.forbiddenRuntimeApiCount, 0);
    assert.deepEqual(writer.readings.navigationPaths, {
      keyboard: { previous: true, next: true },
      click: { previous: true, next: true, stageHalves: true },
      touch: { previous: true, next: true, pointerEvents: true },
    });
    assert.equal(writer.readings.pageSemantics.consistent, true);

    assertReading(receipt.structuredSource);
    assertReading(receipt.fullRendition);
    assertReading(receipt.cover);
    receipt.pages.forEach(assertReading);
    receipt.sourceMedia.forEach(assertReading);

    const source = readJson(receipt.structuredSource.path);
    assert.equal(source.schema, "oceanleo.deck.v1");
    assert.equal(source.data.schema, "oceanleo.deck.v1");
    assert.equal(source.data.slides.length, writer.readings.slideCount);
    assert.equal(receipt.pages.length, source.data.slides.length);
    assert.deepEqual(source.assetUrls, receipt.sourceResolver.assetUrls);
    assert.equal(
      receipt.sourceResolver.resolvedCount,
      (source.data.assets || []).length,
    );
    const resolved = simulateEditorResolver(source);
    for (const asset of source.data.assets || []) {
      const media = receipt.sourceMedia.find((item) => item.id === asset.id);
      assert.ok(media, `${work.id}/${asset.id}`);
      assert.equal(media.sha256, asset.sha256);
      assert.equal(media.byteSize, asset.byteSize);
      assert.equal(media.licenseCode, asset.licenseCode);
      assert.equal(media.reference, `asset://media/${asset.id}`);
      assert.equal(resolved[asset.id], media.url);
      assert.equal(sha256(await simulateEditorFetch(resolved[asset.id], receipt.sourceMedia)), asset.sha256);
      const gateway = new URL(media.url);
      assert.equal(gateway.origin, "https://api.oceanleo.com");
      assert.equal(gateway.pathname, "/v1/media/proxy");
      assert.match(
        gateway.searchParams.get("url") || "",
        new RegExp(`/_typed-artifacts/sha256/${asset.sha256.slice(0, 2)}/${asset.sha256}$`),
      );
    }

    const runtimeDir = path.join(
      ROOT,
      "content/active-runtime/website",
      work.id,
    );
    assert.deepEqual(readdirSync(runtimeDir), ["index.html"]);
    const html = bytes(receipt.fullRendition.path).toString("utf8");
    assert.match(html, /^<!doctype html>\n/);
    assert.doesNotMatch(html, /<script[^>]+\bsrc=/i);
    assert.doesNotMatch(html, /<link\b/i);
    assert.doesNotMatch(
      html,
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB)\b/,
    );

    const publicSourceDir = path.join(
      ROOT,
      "public/works/deck/src",
      work.id,
    );
    for (const file of allFiles(publicSourceDir)) {
      assert.doesNotMatch(file, /\.(?:html?|[cm]?js|css)$/i);
      assert.equal(statSync(file).isFile(), true);
    }

    assert.ok(planItem);
    assert.equal(planItem.item.kind, "website");
    assert.equal(planItem.item.entry, "index.html");
    assert.equal(planItem.fileCount, 1);
    assert.equal(planItem.totalBytes, receipt.fullRendition.byteSize);
    assert.equal(planItem.files[0].sha256, receipt.fullRendition.sha256);
    assert.match(
      planItem.entryUrl,
      /^https:\/\/s-[0-9a-f]{32}\.oceanleo\.app\/embed$/,
    );

    assert.equal(planned.artifactType, "deck");
    assert.equal(planned.deliveryFamily, "html");
    assert.equal(planned.sourceFormat, "oceanleo.deck.v1");
    assert.equal(planned.editability, "native");
    assert.equal(planned.editorCapability, "deck-editor");
    assert.equal(planned.fullRendition.format, "html");
    assert.equal(planned.fullRendition.mediaType, "text/html");
    assert.equal(ingestReport.blocked.length, 0);
    assert.equal(ingestReport.passed.length, 1);
    assert.equal(executionReport.blocked.length, 0);
    assert.equal(executionReport.passed.length, 1);
    assert.equal(ingested.state, "ingested");
    assert.equal(ingested.deliveryFamily, "html");
    assert.equal(ingested.fullRendition.format, "html");
    assert.equal(
      ingested.fullRendition.sha256,
      receipt.fullRendition.sha256,
    );
    assert.equal(ingested.closureDigest, planned.closureDigest);
    assert.match(ingested.artifactId, UUID);
    assert.match(ingested.artifactRevisionId, UUID);
    artifactIds.add(ingested.artifactId);
    revisionIds.add(ingested.artifactRevisionId);
  }
  assert.equal(artifactIds.size, 3);
  assert.equal(revisionIds.size, 3);
});
