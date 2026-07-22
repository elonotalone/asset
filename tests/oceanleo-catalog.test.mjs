import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../app/api/oceanleo-catalog/v1/route.ts";
import {
  EDITOR_CLASSES,
  catalogContentDigest,
  readCatalog,
  validateCatalogShape,
  validateLocalCatalogFiles,
} from "../scripts/oceanleo-catalog-qc.mjs";

test("static catalog is the exact, locally complete 12-class export", async () => {
  const manifest = await readCatalog();
  assert.deepEqual(manifest.requiredEditorClasses, EDITOR_CLASSES);
  assert.deepEqual(
    manifest.items.map((item) => item.editorClass),
    EDITOR_CLASSES,
  );
  assert.equal(manifest.items.length, 12);
  assert.equal(catalogContentDigest(manifest), manifest.contentDigest);
  assert.deepEqual(validateCatalogShape(manifest), []);
  assert.deepEqual(await validateLocalCatalogFiles(manifest), []);

  const sourceDigests = new Set();
  const thumbnailDigests = new Set();
  for (const item of manifest.items) {
    assert.ok(item.roles.includes("catalog_more"));
    assert.equal(item.preview.derivedFromSourceDigest, item.source.digest);
    assert.equal(item.thumbnail.derivedFromSourceDigest, item.source.digest);
    assert.equal(sourceDigests.has(item.source.digest), false);
    assert.equal(thumbnailDigests.has(item.thumbnail.digest), false);
    sourceDigests.add(item.source.digest);
    thumbnailDigests.add(item.thumbnail.digest);
  }
});

test("API returns the canonical document and immutable catalog headers", async () => {
  const manifest = await readCatalog();
  const response = GET(
    new Request("https://asset.oceanleo.com/api/oceanleo-catalog/v1"),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(
    response.headers.get("etag"),
    `"${manifest.contentDigest}"`,
  );
  assert.equal(
    response.headers.get("x-oceanleo-catalog-digest"),
    manifest.contentDigest,
  );
  assert.match(response.headers.get("cache-control") || "", /s-maxage=3600/);
  assert.deepEqual(await response.json(), manifest);
});

test("API filters exactly and never falls back to another editor class", async () => {
  const websiteResponse = GET(
    new Request(
      "https://asset.oceanleo.com/api/oceanleo-catalog/v1?editorClass=website_finetuning",
    ),
  );
  const websiteBody = await websiteResponse.json();
  assert.equal(websiteBody.resultCount, 1);
  assert.deepEqual(websiteBody.query, {
    editorClass: "website_finetuning",
    artifactType: null,
  });
  assert.equal(websiteBody.items[0].artifactType, "website");
  assert.equal(websiteBody.items[0].source.format, "website-source@1");
  assert.equal(websiteBody.items[0].source.openMode, "structured-project");
  assert.equal(websiteBody.items[0].editor.editability, "native");
  assert.match(websiteBody.items[0].preview.mediaType, /^image\//);

  const missingResponse = GET(
    new Request(
      "https://asset.oceanleo.com/api/oceanleo-catalog/v1?editorClass=not-a-real-editor",
    ),
  );
  const missingBody = await missingResponse.json();
  assert.equal(missingBody.resultCount, 0);
  assert.deepEqual(missingBody.items, []);
});

test("QC rejects placeholder copy and unlinked rendition evidence", async () => {
  const manifest = await readCatalog();
  const invalid = structuredClone(manifest);
  invalid.items[0].title = "placeholder";
  invalid.items[0].thumbnail.derivedFromSourceDigest =
    invalid.items[1].source.digest;
  invalid.contentDigest = catalogContentDigest(invalid);
  const codes = new Set(validateCatalogShape(invalid).map((value) => value.code));
  assert.ok(codes.has("placeholder_title"));
  assert.ok(codes.has("rendition_source_mismatch"));
});
