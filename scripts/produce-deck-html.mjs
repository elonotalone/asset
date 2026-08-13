#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OCEANDINO_ROOT =
  process.env.OCEANDINO_ROOT || "/opt/cursor-workspaces/oceandino";
const H0_CLI = path.join(
  OCEANDINO_ROOT,
  "scripts/material-infra/assemblers/tools/deck-html.mjs",
);
const OLD_CATALOG = path.join(ROOT, "content/works/deck.json");
const PUBLIC_DECK_ROOT = path.join(ROOT, "public/works/deck");
const RUNTIME_ROOT = path.join(ROOT, "content/active-runtime/website");
const RECEIPT_ROOT = path.join(ROOT, "content/receipts/deck-html");
const WORKS_FILE = path.join(ROOT, "content/works/deck.html.json");
const MANIFEST_FILE = path.join(
  ROOT,
  "content/active-runtime/manifest.deck-html.json",
);
const F9_MANIFEST_FILE = path.join(
  ROOT,
  "active-runtime-manifest.deck-html.json",
);
const MEDIA_CAS_ROOT =
  "https://kvrtcumcmhyqhmawpzyc.supabase.co/storage/v1/object/public/media-uploads/_typed-artifacts/sha256";
const MEDIA_GATEWAY = "https://api.oceanleo.com/v1/media/proxy";

const DEFINITIONS = Object.freeze([
  {
    id: "deck-html-nocturne-01",
    twinId: "deck-nocturne-01",
    purpose: "图像主导的年度夜间观测汇报",
    axes: { style: "neon", scene: "sc-review", domain: "dm-public" },
    appId: "year-summary",
    tags: ["html-deck", "年度汇报", "图像主导", "neon"],
  },
  {
    id: "deck-html-monotype-01",
    twinId: "deck-monotype-01",
    purpose: "文字与数据主导的内部成本备忘",
    axes: {
      style: "editorial",
      scene: "sc-review",
      domain: "dm-finance",
    },
    appId: "report-duty",
    tags: ["html-deck", "内部复盘", "数据备忘", "editorial"],
  },
  {
    id: "deck-html-manual-01",
    twinId: "deck-manual-01",
    purpose: "步骤主导的社区共享书屋落地手册",
    axes: { style: "blueprint", scene: "sc-teaching", domain: "dm-public" },
    appId: "public-lesson",
    tags: ["html-deck", "操作手册", "步骤教程", "blueprint"],
  },
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function measure(file) {
  const bytes = readFileSync(file);
  return {
    path: relative(file),
    byteSize: bytes.length,
    sha256: sha256(bytes),
  };
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function copyMeasured(source, destination) {
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  const sourceReading = measure(source);
  const destinationReading = measure(destination);
  if (
    sourceReading.sha256 !== destinationReading.sha256 ||
    sourceReading.byteSize !== destinationReading.byteSize
  ) {
    throw new Error(`copy mismatch: ${source} -> ${destination}`);
  }
  return destinationReading;
}

function extensionFor(mediaType) {
  const extensions = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
  };
  const extension = extensions[mediaType];
  if (!extension) throw new Error(`unsupported source media type ${mediaType}`);
  return extension;
}

function durableMediaUrl(sha) {
  const upstream = `${MEDIA_CAS_ROOT}/${sha.slice(0, 2)}/${sha}`;
  return `${MEDIA_GATEWAY}?url=${encodeURIComponent(upstream)}`;
}

function runH0Cli({ inputFile, outputFile, receiptFile }) {
  const result = spawnSync(
    process.execPath,
    [
      H0_CLI,
      "--in",
      inputFile,
      "--out",
      outputFile,
      "--receipt",
      receiptFile,
    ],
    {
      cwd: OCEANDINO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        OCEANLEO_UI_DIR:
          process.env.OCEANLEO_UI_DIR || "/root/projects/oceanleo-ui",
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `H0 deck-html CLI failed for ${inputFile}\n${result.stdout}\n${result.stderr}`,
    );
  }
  const receipt = JSON.parse(readFileSync(receiptFile, "utf8"));
  if (
    receipt.ok !== true ||
    receipt.writer !== "oceanleo-ui deck-html-package.ts"
  ) {
    throw new Error(`invalid H0 receipt at ${receiptFile}`);
  }
  return receipt;
}

function assertDeclaredMedia(sourceDir, body) {
  const readings = [];
  for (const asset of body.assets || []) {
    const source = path.join(
      sourceDir,
      "media",
      `${asset.id}${extensionFor(asset.mediaType)}`,
    );
    if (!existsSync(source)) throw new Error(`missing licensed source media ${source}`);
    const bytes = readFileSync(source);
    if (bytes.length !== asset.byteSize || sha256(bytes) !== asset.sha256) {
      throw new Error(`source media declaration mismatch for ${asset.id}`);
    }
    readings.push({ asset, source });
  }
  return readings;
}

function productionFor(definition, oldById) {
  const twin = oldById.get(definition.twinId);
  if (!twin) throw new Error(`missing PPTX twin ${definition.twinId}`);
  const twinSourceDir = path.join(
    PUBLIC_DECK_ROOT,
    "src",
    definition.twinId,
  );
  const twinInput = JSON.parse(
    readFileSync(path.join(twinSourceDir, "deck.json"), "utf8"),
  );
  if (twinInput.body?.schema !== "oceanleo.deck.v1") {
    throw new Error(`${definition.twinId} does not contain oceanleo.deck.v1`);
  }

  const sourceDir = path.join(PUBLIC_DECK_ROOT, "src", definition.id);
  const sourceFile = path.join(sourceDir, "deck.json");
  mkdirSync(sourceDir, { recursive: true });
  rmSync(path.join(sourceDir, "media"), { recursive: true, force: true });
  const sourceMedia = assertDeclaredMedia(
    twinSourceDir,
    twinInput.body,
  ).map(({ asset, source }) => {
    const destination = path.join(
      sourceDir,
      "media",
      `${asset.id}${extensionFor(asset.mediaType)}`,
    );
    const reading = copyMeasured(source, destination);
    return {
      id: asset.id,
      reference: `asset://media/${asset.id}`,
      mediaType: asset.mediaType,
      licenseCode: asset.licenseCode ?? null,
      ...reading,
      sourcePath: measure(source).path,
      url: durableMediaUrl(reading.sha256),
      origin: `byte-identical licensed source media from ${definition.twinId}`,
    };
  });
  const assetUrls = Object.fromEntries(
    sourceMedia.map((media) => [media.id, media.url]),
  );
  writeJson(sourceFile, {
    schema: "oceanleo.deck.v1",
    data: twinInput.body,
    assetUrls,
    assetMetadata: sourceMedia.map((media) => ({
      id: media.id,
      reference: media.reference,
      url: media.url,
      path: media.path,
      sha256: media.sha256,
      byteSize: media.byteSize,
      mediaType: media.mediaType,
      licenseCode: media.licenseCode,
    })),
  });

  const coverFile = path.join(PUBLIC_DECK_ROOT, `${definition.id}.cover.webp`);
  const cover = copyMeasured(
    path.join(PUBLIC_DECK_ROOT, `${definition.twinId}.cover.webp`),
    coverFile,
  );
  const pages = twin.view.pages.map((oldPage, index) => {
    const destination = path.join(
      PUBLIC_DECK_ROOT,
      "pages",
      definition.id,
      `${String(index + 1).padStart(2, "0")}.webp`,
    );
    return copyMeasured(path.join(ROOT, "public", oldPage), destination);
  });

  const receiptDir = path.join(RECEIPT_ROOT, definition.id);
  const writerReceiptFile = path.join(receiptDir, "writer.json");
  const inputFile = path.join(
    twinSourceDir,
    `.deck-html-input-${definition.id}.json`,
  );
  const runtimeFile = path.join(RUNTIME_ROOT, definition.id, "index.html");
  mkdirSync(path.dirname(runtimeFile), { recursive: true });
  mkdirSync(receiptDir, { recursive: true });
  writeJson(inputFile, {
    tool: "deck-html",
    version: 1,
    meta: {
      ...(twinInput.meta || {}),
      slug: definition.id,
      title: twinInput.body.title,
    },
    ...(twinInput.mediaDir ? { mediaDir: "media/" } : {}),
    body: twinInput.body,
  });

  let writerReceipt;
  try {
    writerReceipt = runH0Cli({
      inputFile,
      outputFile: runtimeFile,
      receiptFile: writerReceiptFile,
    });
  } finally {
    rmSync(inputFile, { force: true });
  }

  const structuredSource = {
    ...measure(sourceFile),
    mediaType: "application/vnd.oceanleo.deck+json",
  };
  const fullRendition = {
    ...measure(runtimeFile),
    format: "html",
    mediaType: "text/html",
  };
  if (
    fullRendition.sha256 !== writerReceipt.readings.sha256 ||
    fullRendition.byteSize !== writerReceipt.readings.byteSize
  ) {
    throw new Error(`final HTML differs from writer receipt for ${definition.id}`);
  }

  const orderId = `wo-h1-${definition.id}-v1`;
  const ingestDir = path.join(receiptDir, "ingest");
  const artifactBytes = {
    $object: "artifact-bytes",
    orderId,
    itemIndex: 0,
    artifactType: "deck",
    deliveryFamily: "html",
    entrypoint: structuredSource.path,
    files: [
      {
        path: structuredSource.path,
        byteSize: structuredSource.byteSize,
        sha256: structuredSource.sha256,
        mediaType: structuredSource.mediaType,
        role: "primary",
      },
      {
        path: cover.path,
        byteSize: cover.byteSize,
        sha256: cover.sha256,
        mediaType: "image/webp",
        role: "preview",
      },
    ],
    fullRendition: {
      path: fullRendition.path,
      format: "html",
      byteSize: fullRendition.byteSize,
      sha256: fullRendition.sha256,
      mediaType: "text/html",
    },
    closureShape: "single-file",
    closureDigest: structuredSource.sha256,
    assemblerId: "asm-web",
    formingAssemblerId: "asm-web",
    references: [],
    previewHint: "auto-firstpage",
    preview: {
      path: cover.path,
      byteSize: cover.byteSize,
      sha256: cover.sha256,
      mediaType: "image/webp",
    },
    bytesDir: ROOT,
    materialSha256: {},
  };
  const workOrder = {
    $object: "work-order@accepted",
    orderId,
    sourceSpec: "docs/design-guides/deck/html/_INDEX.md",
    artifactType: "deck",
    count: 1,
    siteTargets: [
      {
        siteKey: "ppt",
        appId: definition.appId,
        count: 1,
        positionRange: { from: 6, to: 6 },
      },
    ],
    acceptance: [
      {
        id: "H1-HTML-FORMAT",
        stage: "ingest",
        field: "artifact.renditions.full.format",
        op: "==",
        value: "html",
        source: "carrier",
        runnable: true,
      },
      {
        id: "H1-DECK-SOURCE-FORMAT",
        stage: "ingest",
        field: "artifact_revisions.source_format",
        op: "==",
        value: "oceanleo.deck.v1",
        source: "carrier",
        runnable: true,
      },
      {
        id: "H1-HTML-DELIVERY-FAMILY",
        stage: "ingest",
        field: "artifact_revisions.metadata.deliveryFamily",
        op: "==",
        value: "html",
        source: "carrier",
        runnable: true,
      },
    ],
    materialNeeds: [],
    productionMode: "assemble",
    retryBudget: 1,
    carrierParams: {
      sourceFormat: "oceanleo.deck.v1",
      projectSchema: "oceanleo.deck.v1",
      fullFormat: "html",
      fullMediaType: "text/html",
      deliveryFamily: "html",
      closureShape: "single-file",
      editorCapability: "deck-editor",
      downloadKind: "artifact_rendition",
    },
  };
  const contentSpec = {
    $object: "content-spec",
    orderId,
    itemIndex: 0,
    slug: definition.id,
    title: twin.title,
    summary: twin.summary,
    tags: definition.tags,
    body: twinInput.body,
    bodyShape: "deck-slides",
    materialRefs: [],
    unusedMaterials: [],
    previewHint: "auto-firstpage",
    provenance: {
      materialOrigin: "official-authored",
      fictionalSample: true,
      userDerived: false,
    },
  };
  writeJson(path.join(ingestDir, "artifact-bytes.json"), artifactBytes);
  writeJson(path.join(ingestDir, "work-order.json"), workOrder);
  writeJson(path.join(ingestDir, "content-spec.json"), contentSpec);
  writeJson(path.join(ingestDir, "bom.json"), {
    $object: "bill-of-materials@frozen",
    orderId,
    items: [],
  });

  const productionReceipt = {
    schema: "oceanleo.deck-html-production-receipt.v1",
    id: definition.id,
    artifactType: "deck",
    deliveryFamily: "html",
    twinId: definition.twinId,
    purpose: definition.purpose,
    axes: definition.axes,
    writerReceipt: relative(writerReceiptFile),
    structuredSource,
    sourceMedia,
    sourceResolver: {
      strategy: "payload.assetUrls",
      assetUrls,
      resolvedCount: sourceMedia.length,
    },
    fullRendition,
    cover: {
      ...cover,
      mediaType: "image/webp",
      origin: `byte-identical static cover from ${definition.twinId}`,
    },
    pages: pages.map((page, index) => ({
      ...page,
      mediaType: "image/webp",
      index: index + 1,
      origin: `byte-identical vetted static page from ${definition.twinId}`,
    })),
    closure: {
      utf8: writerReceipt.readings.utf8,
      remoteDependencyCount:
        writerReceipt.readings.remoteDependencies.count,
      externalScriptCount: writerReceipt.readings.scriptClosure.externalCount,
      forbiddenRuntimeApiCount:
        writerReceipt.readings.scriptClosure.forbiddenRuntimeApiCount,
      navigationPaths: writerReceipt.readings.navigationPaths,
      pageSemantics: writerReceipt.readings.pageSemantics,
    },
    license: writerReceipt.readings.license,
    ingestFixtures: {
      artifactBytes: relative(path.join(ingestDir, "artifact-bytes.json")),
      billOfMaterials: relative(path.join(ingestDir, "bom.json")),
      workOrder: relative(path.join(ingestDir, "work-order.json")),
      contentSpec: relative(path.join(ingestDir, "content-spec.json")),
    },
  };
  writeJson(path.join(receiptDir, "production.json"), productionReceipt);

  return {
    definition,
    twin,
    writerReceipt,
    productionReceipt,
    workEntry: {
      id: definition.id,
      artifactType: "deck",
      deliveryFamily: "html",
      title: twin.title,
      styleId: definition.axes.style,
      summary: twin.summary,
      cover: `/${cover.path.replace(/^public\//, "")}`,
      view: {
        kind: "deck",
        src: `/${structuredSource.path.replace(/^public\//, "")}`,
        source: `/${structuredSource.path.replace(/^public\//, "")}`,
        pages: pages.map(
          (page) => `/${page.path.replace(/^public\//, "")}`,
        ),
        aspect: twin.view.aspect,
      },
      downloadable: true,
      attribution: twin.attribution,
      readings: {
        deliveryFamily: "html",
        sourceTwin: definition.twinId,
        style: definition.axes.style,
        scene: definition.axes.scene,
        domain: definition.axes.domain,
        writer: writerReceipt.writer,
        writerVersion: writerReceipt.writerVersion,
        finalHtmlByteSize: fullRendition.byteSize,
        finalHtmlSha256: fullRendition.sha256,
        slideCount: writerReceipt.readings.slideCount,
        inlineImageReferenceCount:
          writerReceipt.readings.inlineImages.referenceCount,
        inlineImageEmbeddedCount:
          writerReceipt.readings.inlineImages.embeddedCount,
        remoteDependencyCount:
          writerReceipt.readings.remoteDependencies.count,
        externalScriptCount:
          writerReceipt.readings.scriptClosure.externalCount,
        forbiddenRuntimeApiCount:
          writerReceipt.readings.scriptClosure.forbiddenRuntimeApiCount,
        pageSemanticsConsistent:
          writerReceipt.readings.pageSemantics.consistent,
      },
    },
  };
}

function main() {
  if (!existsSync(H0_CLI)) throw new Error(`missing H0 CLI ${H0_CLI}`);
  const oldCatalog = JSON.parse(readFileSync(OLD_CATALOG, "utf8"));
  const oldById = new Map(oldCatalog.map((entry) => [entry.id, entry]));
  const results = DEFINITIONS.map((definition) =>
    productionFor(definition, oldById),
  );

  writeJson(
    WORKS_FILE,
    results.map((result) => result.workEntry),
  );
  const manifest = {
    schema: "oceanleo.active-runtime-manifest.v1",
    items: results.map(({ definition }) => ({
      id: definition.id,
      kind: "website",
      source: `content/active-runtime/website/${definition.id}`,
      entry: "index.html",
    })),
  };
  // content/ 下的是 consumer fragment；仓根逐字副本是 F9 唯一允许的 plan 输入。
  writeJson(MANIFEST_FILE, manifest);
  writeJson(F9_MANIFEST_FILE, manifest);

  const summary = {
    schema: "oceanleo.deck-html-production-summary.v1",
    artifactType: "deck",
    deliveryFamily: "html",
    count: results.length,
    items: results.map(({ definition, productionReceipt }) => ({
      id: definition.id,
      twinId: definition.twinId,
      purpose: definition.purpose,
      axes: definition.axes,
      structuredSource: productionReceipt.structuredSource,
      fullRendition: productionReceipt.fullRendition,
      productionReceipt: `content/receipts/deck-html/${definition.id}/production.json`,
    })),
  };
  writeJson(path.join(RECEIPT_ROOT, "production-summary.json"), summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[deck-html-production] ${error.stack || error.message}\n`);
  process.exitCode = 1;
}
