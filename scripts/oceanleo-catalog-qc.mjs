import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import sharp from "sharp";

export const CATALOG_PATH = resolve(
  "public/oceanleo-catalog/v1/manifest.json",
);
export const PUBLIC_ROOT = resolve("public");

export const EDITOR_CLASSES = [
  "video_editing",
  "website_finetuning",
  "design_canvas",
  "presentation_editing",
  "document_editing",
  "spreadsheet_editing",
  "image_editing",
  "pdf_editing",
  "audio_editing",
  "chart_editing",
  "video_canvas",
  "model_3d",
];
export const MINIMUM_ITEMS_PER_EDITOR_CLASS = 1;

const CONTRACT_BY_CLASS = {
  video_editing: {
    artifactType: "video",
    sourceFormat: "mp4",
    editorCapability: "video-timeline",
    adapter: "video-timeline",
    projectSchema: "oceanleo.timeline.v1",
  },
  website_finetuning: {
    artifactType: "website",
    sourceFormat: "website-source@1",
    editorCapability: "website-editor",
    adapter: "website",
    projectSchema: "website-source@1",
  },
  design_canvas: {
    artifactType: "composite_image",
    sourceFormat: "oceanleo.design-document.v1",
    editorCapability: "design-canvas",
    adapter: "design-canvas",
    projectSchema: "oceanleo.design-document.v1",
  },
  presentation_editing: {
    artifactType: "deck",
    sourceFormat: "pptx",
    editorCapability: "deck-editor",
    adapter: "deck",
    projectSchema: "oceanleo.deck.v1",
  },
  document_editing: {
    artifactType: "document",
    sourceFormat: "docx",
    editorCapability: "richdoc-editor",
    adapter: "richdoc",
    projectSchema: "tiptap-json@1",
  },
  spreadsheet_editing: {
    artifactType: "grid",
    sourceFormat: "xlsx",
    editorCapability: "grid-editor",
    adapter: "grid",
    projectSchema: "oceanleo.grid.v1",
  },
  image_editing: {
    artifactType: "single_file_image",
    sourceFormat: "webp",
    editorCapability: "image-editor",
    adapter: "image",
    projectSchema: "oceanleo.fabric-image.v1",
  },
  pdf_editing: {
    artifactType: "pdf",
    sourceFormat: "pdf",
    editorCapability: "pdf-editor",
    adapter: "pdf",
    projectSchema: "pdf-binary@1",
  },
  audio_editing: {
    artifactType: "audio",
    sourceFormat: "mp3",
    editorCapability: "audio-editor",
    adapter: "audio",
    projectSchema: "oceanleo.audio-project.v1",
  },
  chart_editing: {
    artifactType: "chart",
    sourceFormat: "oceanleo.chart.v1",
    editorCapability: "chart-editor",
    adapter: "chart-editor@1",
    projectSchema: "oceanleo.chart.v1",
  },
  video_canvas: {
    artifactType: "workflow",
    sourceFormat: "oceanleo.video.project.v2",
    editorCapability: "video-canvas",
    adapter: "video-canvas",
    projectSchema: "oceanleo.video-canvas.v1",
  },
  model_3d: {
    artifactType: "model_3d",
    sourceFormat: "gltf",
    editorCapability: "model-3d-editor",
    adapter: "threed",
    projectSchema: "oceanleo.model-view@1",
  },
};

const RESOURCE_CONTRACT_BY_CLASS = {
  video_editing: {
    integrity: "content_addressed",
    openMode: "native-file",
    editability: "bounded",
    previewDerivation: "source",
    thumbnailDerivation: "poster-frame",
  },
  website_finetuning: {
    integrity: "complete_dependency_closure",
    openMode: "structured-project",
    editability: "native",
    previewDerivation: "rendered-site",
    thumbnailDerivation: "rendered-site",
  },
  design_canvas: {
    integrity: "content_addressed",
    openMode: "structured-project",
    editability: "native",
    previewDerivation: "rendered-design-document",
    thumbnailDerivation: "rendered-design-document",
  },
  presentation_editing: {
    integrity: "content_addressed",
    openMode: "native-file",
    editability: "native",
    previewDerivation: "slide-1-render",
    thumbnailDerivation: "deck-cover-render",
  },
  document_editing: {
    integrity: "content_addressed",
    openMode: "native-file",
    editability: "native",
    previewDerivation: "document-page-render",
    thumbnailDerivation: "document-page-render",
  },
  spreadsheet_editing: {
    integrity: "content_addressed",
    openMode: "native-file",
    editability: "native",
    previewDerivation: "worksheet-render",
    thumbnailDerivation: "worksheet-render",
  },
  image_editing: {
    integrity: "content_addressed",
    openMode: "native-file",
    editability: "bounded",
    previewDerivation: "source",
    thumbnailDerivation: "resized-source",
  },
  pdf_editing: {
    integrity: "content_addressed",
    openMode: "native-file",
    editability: "bounded",
    previewDerivation: "pdf-page-render",
    thumbnailDerivation: "pdf-page-render",
  },
  audio_editing: {
    integrity: "content_addressed",
    openMode: "native-file",
    editability: "bounded",
    previewDerivation: "source",
    thumbnailDerivation: "embedded-id3-artwork",
  },
  chart_editing: {
    integrity: "content_addressed",
    openMode: "structured-project",
    editability: "native",
    previewDerivation: "echarts-render",
    thumbnailDerivation: "echarts-render",
  },
  video_canvas: {
    integrity: "complete_dependency_closure",
    openMode: "structured-project",
    editability: "native",
    previewDerivation: "workflow-graph-render",
    thumbnailDerivation: "workflow-graph-render",
  },
  model_3d: {
    integrity: "complete_dependency_closure",
    openMode: "native-file",
    editability: "bounded",
    previewDerivation: "model-render",
    thumbnailDerivation: "model-render",
  },
};

const ALLOWED_ASSET_HOSTS = new Set([
  "asset.oceanleo.com",
  "oceanleo-assets.oss-cn-guangzhou.aliyuncs.com",
]);
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9:._-]{7,159}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (record(value)) {
    return `{${Object.entries(value)
      // JSON canonical keys use deterministic UTF-16 code-unit order. Avoid
      // localeCompare: its ICU locale ordering cannot be reproduced reliably
      // by non-JavaScript catalog consumers.
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${canonicalJson(child)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function catalogContentDigest(manifest) {
  const projection = structuredClone(manifest);
  delete projection.contentDigest;
  return sha256(canonicalJson(projection));
}

export async function readCatalog(path = CATALOG_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

function issue(issues, code, itemId, detail) {
  issues.push({ code, itemId: itemId || null, detail });
}

function validAssetUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.startsWith("/") &&
      ALLOWED_ASSET_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

function validPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.includes(".") &&
      url.hostname !== "localhost" &&
      !url.hostname.endsWith(".test") &&
      !url.hostname.endsWith(".invalid")
    );
  } catch {
    return false;
  }
}

function validateDigestResource(
  issues,
  item,
  resource,
  name,
  { requireDimensions = false, requireDuration = false } = {},
) {
  if (!record(resource)) {
    issue(issues, `missing_${name}`, item.id, `${name} is required`);
    return;
  }
  if (!validAssetUrl(resource.url)) {
    issue(
      issues,
      `invalid_${name}_url`,
      item.id,
      `${name}.url is not an approved stable HTTPS asset URL`,
    );
  }
  if (!SHA256.test(resource.digest || "")) {
    issue(
      issues,
      `missing_${name}_digest`,
      item.id,
      `${name}.digest must be sha256`,
    );
  }
  if (
    !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(
      resource.mediaType || "",
    ) ||
    !Number.isSafeInteger(resource.byteSize) ||
    resource.byteSize < 1
  ) {
    issue(
      issues,
      `invalid_${name}_metadata`,
      item.id,
      `${name} needs mediaType and positive byteSize`,
    );
  }
  if (
    requireDimensions &&
    (!(resource.width > 0) || !(resource.height > 0))
  ) {
    issue(
      issues,
      `missing_${name}_dimensions`,
      item.id,
      `${name} needs positive width and height`,
    );
  }
  if (
    requireDuration &&
    (!Number.isSafeInteger(resource.durationMs) || resource.durationMs < 1)
  ) {
    issue(
      issues,
      `missing_${name}_duration`,
      item.id,
      `${name} needs a positive integer durationMs`,
    );
  }
}

function validateLicense(issues, item) {
  const license = item.provenance?.license;
  if (
    !license?.code ||
    !validPublicHttpsUrl(license.url) ||
    license.commercialOk !== true ||
    license.modifyOk !== true ||
    typeof license.attributionRequired !== "boolean" ||
    (license.attributionRequired && !license.attributionText?.trim())
  ) {
    issue(
      issues,
      "invalid_license",
      item.id,
      "license code/url/edit rights and required attribution must be explicit",
    );
  }
}

function validateDependencies(issues, item) {
  const dependencies = item.source?.dependencies;
  if (!Array.isArray(dependencies)) {
    issue(
      issues,
      "missing_dependency_manifest",
      item.id,
      "source.dependencies must be an array",
    );
    return;
  }
  const paths = new Set();
  const urls = new Set();
  for (const dependency of dependencies) {
    if (
      !dependency.path ||
      dependency.path.startsWith("/") ||
      dependency.path.split("/").includes("..") ||
      paths.has(dependency.path) ||
      urls.has(dependency.url) ||
      !validAssetUrl(dependency.url) ||
      !SHA256.test(dependency.digest || "") ||
      !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(
        dependency.mediaType || "",
      ) ||
      !Number.isSafeInteger(dependency.byteSize) ||
      dependency.byteSize < 1
    ) {
      issue(
        issues,
        "invalid_dependency",
        item.id,
        "dependency paths, URLs, media types, sizes and digests must be unique and complete",
      );
      continue;
    }
    paths.add(dependency.path);
    urls.add(dependency.url);
  }
  if (
    item.source?.integrity === "complete_dependency_closure" &&
    dependencies.length === 0
  ) {
    issue(
      issues,
      "empty_dependency_closure",
      item.id,
      "complete_dependency_closure cannot be empty",
    );
  }
  if (
    item.source?.integrity !== "complete_dependency_closure" &&
    dependencies.length > 0
  ) {
    issue(
      issues,
      "unexpected_dependency_closure",
      item.id,
      "content-addressed single-file sources cannot declare external dependencies",
    );
  }
}

function validateItem(issues, manifest, item, index) {
  const contract = CONTRACT_BY_CLASS[item?.editorClass];
  const resourceContract = RESOURCE_CONTRACT_BY_CLASS[item?.editorClass];
  const titlePattern = new RegExp(
    manifest.qualityPolicy?.forbiddenTitlePattern || "$a",
    "iu",
  );
  const providerPattern = new RegExp(
    manifest.qualityPolicy?.forbiddenProviderPattern || "$a",
    "iu",
  );
  if (!record(item)) {
    issue(issues, "invalid_item", null, `items[${index}] is not an object`);
    return;
  }
  if (!ID.test(item.id || "")) {
    issue(issues, "invalid_id", item.id, "item id is not stable");
  }
  if (
    !item.title?.trim() ||
    Array.from(item.title.trim()).length < 8 ||
    titlePattern.test(item.title)
  ) {
    issue(
      issues,
      "placeholder_title",
      item.id,
      "title is too short or matches the placeholder pattern",
    );
  }
  if (!contract) {
    issue(
      issues,
      "unknown_editor_class",
      item.id,
      `unsupported editorClass ${item.editorClass}`,
    );
    return;
  }
  for (const [field, expected] of Object.entries(contract)) {
    const actual =
      field === "adapter" || field === "projectSchema"
        ? item.editor?.[field]
        : item[field];
    if (actual !== expected) {
      issue(
        issues,
        "editor_contract_mismatch",
        item.id,
        `${field} must be ${expected}, received ${actual}`,
      );
    }
  }
  if (
    item.source?.integrity !== resourceContract.integrity ||
    item.source?.openMode !== resourceContract.openMode ||
    item.editor?.editability !== resourceContract.editability
  ) {
    issue(
      issues,
      "resource_contract_mismatch",
      item.id,
      "source integrity/openMode or editor editability does not match the editor-class contract",
    );
  }
  const sourceDigestHex = SHA256.test(item.source?.digest || "")
    ? item.source.digest.slice("sha256:".length)
    : "";
  if (
    !sourceDigestHex ||
    item.revisionId !== `catalog-r1-${sourceDigestHex.slice(0, 12)}`
  ) {
    issue(
      issues,
      "revision_source_mismatch",
      item.id,
      "revisionId must be pinned to the source digest",
    );
  }
  if (
    item.source?.format !== item.sourceFormat ||
    item.editor?.capability !== item.editorCapability
  ) {
    issue(
      issues,
      "duplicated_contract_mismatch",
      item.id,
      "source/editor duplicated contract fields drifted",
    );
  }
  if (
    !Array.isArray(item.roles) ||
    !item.roles.includes("template") ||
    !item.roles.includes("catalog_more")
  ) {
    issue(
      issues,
      "missing_catalog_role",
      item.id,
      "template and catalog_more roles are required",
    );
  }
  if (
    !item.contentFamilyId ||
    providerPattern.test(item.contentFamilyId) ||
    !item.taxonomy?.primary ||
    !Array.isArray(item.taxonomy?.labels) ||
    item.taxonomy.labels.length < 2
  ) {
    issue(
      issues,
      "invalid_taxonomy",
      item.id,
      "content family and taxonomy labels must be curated",
    );
  }
  validateDigestResource(issues, item, item.source, "source");
  const previewMediaType = String(item.preview?.mediaType || "");
  if (
    !previewMediaType.startsWith("image/") &&
    !previewMediaType.startsWith("audio/") &&
    !previewMediaType.startsWith("video/") &&
    previewMediaType !== "application/pdf"
  ) {
    issue(
      issues,
      "preview_not_displayable",
      item.id,
      "preview must use an inline-displayable media type",
    );
  }
  validateDigestResource(issues, item, item.preview, "preview", {
    requireDimensions:
      previewMediaType.startsWith("image/") ||
      previewMediaType.startsWith("video/"),
    requireDuration:
      previewMediaType.startsWith("audio/") ||
      previewMediaType.startsWith("video/"),
  });
  validateDigestResource(issues, item, item.thumbnail, "thumbnail", {
    requireDimensions: true,
  });
  const minimumBytes =
    manifest.qualityPolicy?.minimumSourceBytesByEditorClass?.[
      item.editorClass
    ] || 1;
  if ((item.source?.byteSize || 0) < minimumBytes) {
    issue(
      issues,
      "source_too_small",
      item.id,
      `source has ${item.source?.byteSize || 0} bytes; minimum is ${minimumBytes}`,
    );
  }
  const minimumWidth = manifest.qualityPolicy?.minimumThumbnailWidth || 1;
  const minimumHeight = manifest.qualityPolicy?.minimumThumbnailHeight || 1;
  if (
    (item.thumbnail?.width || 0) < minimumWidth ||
    (item.thumbnail?.height || 0) < minimumHeight ||
    (item.thumbnail?.byteSize || 0) < 4096
  ) {
    issue(
      issues,
      "thumbnail_too_small",
      item.id,
      `thumbnail must be at least ${minimumWidth}×${minimumHeight} and 4096 bytes`,
    );
  }
  if (!String(item.thumbnail?.mediaType || "").startsWith("image/")) {
    issue(
      issues,
      "thumbnail_not_image",
      item.id,
      "thumbnail must be a displayable image",
    );
  }
  if (
    item.preview?.derivedFromSourceDigest !== item.source?.digest ||
    item.thumbnail?.derivedFromSourceDigest !== item.source?.digest ||
    item.preview?.derivation !== resourceContract.previewDerivation ||
    item.thumbnail?.derivation !== resourceContract.thumbnailDerivation
  ) {
    issue(
      issues,
      "rendition_source_mismatch",
      item.id,
      "preview and thumbnail must explicitly derive from this source digest",
    );
  }
  if (
    item.preview?.derivation === "source" &&
    (item.preview.url !== item.source.url ||
      item.preview.digest !== item.source.digest ||
      item.preview.byteSize !== item.source.byteSize ||
      item.preview.mediaType !== item.source.mediaType)
  ) {
    issue(
      issues,
      "source_preview_mismatch",
      item.id,
      'a preview declared as "source" must reference the exact source bytes',
    );
  }
  if (
    item.editorClass !== "image_editing" &&
    String(item.source?.mediaType || "").startsWith("image/")
  ) {
    issue(
      issues,
      "image_disguised_as_typed_source",
      item.id,
      "non-image editor classes cannot use an image as source",
    );
  }
  const requiredRoundTrip =
    manifest.qualityPolicy?.requiredRoundTripCapabilities || [];
  if (
    !Array.isArray(item.editor?.roundTrip) ||
    requiredRoundTrip.some(
      (capability) => !item.editor.roundTrip.includes(capability),
    ) ||
    !item.editor?.evidence?.trim()
  ) {
    issue(
      issues,
      "missing_editor_capability",
      item.id,
      "load/mutate/save/reopen and evidence are required",
    );
  }
  if (
    !UUID.test(item.provenance?.inventoryId || "") ||
    !item.provenance?.providerId ||
    !item.provenance?.providerAssetId ||
    providerPattern.test(item.provenance.providerId) ||
    providerPattern.test(item.provenance.providerAssetId || "") ||
    !validPublicHttpsUrl(item.provenance?.sourcePage) ||
    !item.provenance?.author?.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(item.provenance?.reviewedAt || "")
  ) {
    issue(
      issues,
      "invalid_provenance",
      item.id,
      "provider/source/author/review evidence is missing or forbidden",
    );
  }
  if (
    item.provenance?.thirdPartyAttributions !== undefined &&
    (!Array.isArray(item.provenance.thirdPartyAttributions) ||
      item.provenance.thirdPartyAttributions.length === 0 ||
      item.provenance.thirdPartyAttributions.some(
        (entry) =>
          !entry?.providerId ||
          !entry?.providerAssetId ||
          !validPublicHttpsUrl(entry?.sourcePage) ||
          !entry?.licenseCode ||
          !validPublicHttpsUrl(entry?.licenseUrl),
      ))
  ) {
    issue(
      issues,
      "invalid_third_party_attribution",
      item.id,
      "third-party dependency attribution must identify provider, source and license",
    );
  }
  validateLicense(issues, item);
  validateDependencies(issues, item);
  if (item.quality?.status !== "approved" || !record(item.quality?.metrics)) {
    issue(
      issues,
      "missing_quality_evidence",
      item.id,
      "approved semantic quality metrics are required",
    );
  }
  if (
    item.editorClass === "video_editing" &&
    (item.quality?.metrics?.durationMs || 0) <
      manifest.qualityPolicy.minimumVideoDurationMs
  ) {
    issue(
      issues,
      "media_too_short",
      item.id,
      "video duration is below the catalog minimum",
    );
  }
  if (
    item.editorClass === "audio_editing" &&
    (item.quality?.metrics?.durationMs || 0) <
      manifest.qualityPolicy.minimumAudioDurationMs
  ) {
    issue(
      issues,
      "media_too_short",
      item.id,
      "audio duration is below the catalog minimum",
    );
  }
}

export function validateCatalogShape(manifest) {
  const issues = [];
  if (
    manifest?.schema !== "oceanleo.catalog-export.v1" ||
    manifest?.version !== 1 ||
    manifest?.sourceSite !== "asset" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      manifest?.publishedAt || "",
    )
  ) {
    issue(
      issues,
      "invalid_manifest_header",
      null,
      "schema/version/sourceSite do not match v1",
    );
  }
  if (
    JSON.stringify(manifest?.requiredEditorClasses) !==
    JSON.stringify(EDITOR_CLASSES)
  ) {
    issue(
      issues,
      "editor_class_set_mismatch",
      null,
      "requiredEditorClasses must equal the formal 12-class matrix",
    );
  }
  if (!Array.isArray(manifest?.items) || manifest.items.length !== 12) {
    issue(
      issues,
      "coverage_count_mismatch",
      null,
      "catalog must contain exactly 12 items",
    );
  }
  if (
    manifest?.qualityPolicy?.minimumItemsPerEditorClass !==
    MINIMUM_ITEMS_PER_EDITOR_CLASS
  ) {
    issue(
      issues,
      "invalid_editor_class_minimum",
      null,
      `minimumItemsPerEditorClass must be ${MINIMUM_ITEMS_PER_EDITOR_CLASS}`,
    );
  }
  const classes = new Set();
  const ids = new Set();
  const contentFamilies = new Set();
  const sourceDigests = new Set();
  const inventoryIds = new Set();
  for (const [index, item] of (manifest?.items || []).entries()) {
    validateItem(issues, manifest, item, index);
    if (ids.has(item?.id)) {
      issue(issues, "duplicate_id", item?.id, "item id is duplicated");
    }
    if (classes.has(item?.editorClass)) {
      issue(
        issues,
        "duplicate_editor_class",
        item?.id,
        `editorClass ${item?.editorClass} is duplicated`,
      );
    }
    for (const [code, value, seen] of [
      ["duplicate_content_family", item?.contentFamilyId, contentFamilies],
      ["duplicate_source_digest", item?.source?.digest, sourceDigests],
      ["duplicate_inventory_id", item?.provenance?.inventoryId, inventoryIds],
    ]) {
      if (value && seen.has(value)) {
        issue(
          issues,
          code,
          item?.id,
          `${value} is shared by more than one catalog class`,
        );
      }
      if (value) seen.add(value);
    }
    ids.add(item?.id);
    classes.add(item?.editorClass);
  }
  for (const editorClass of EDITOR_CLASSES) {
    if (!classes.has(editorClass)) {
      issue(
        issues,
        "missing_editor_class",
        null,
        `catalog has no ${editorClass} template`,
      );
    }
  }
  if (
    !SHA256.test(manifest?.contentDigest || "") ||
    manifest.contentDigest !== catalogContentDigest(manifest)
  ) {
    issue(
      issues,
      "manifest_digest_mismatch",
      null,
      "contentDigest does not match canonical manifest content",
    );
  }
  return issues;
}

function localPathForAssetUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== "asset.oceanleo.com") return null;
    const path = resolve(PUBLIC_ROOT, `.${decodeURIComponent(url.pathname)}`);
    return path === PUBLIC_ROOT || path.startsWith(`${PUBLIC_ROOT}/`)
      ? path
      : null;
  } catch {
    return null;
  }
}

function allResources(manifest) {
  const resources = [];
  for (const item of manifest.items || []) {
    resources.push(
      { item, name: "source", value: item.source },
      { item, name: "preview", value: item.preview },
      { item, name: "thumbnail", value: item.thumbnail },
      ...(item.source?.dependencies || []).map((value) => ({
        item,
        name: `dependency:${value.path}`,
        value,
      })),
    );
  }
  return resources;
}

export async function validateLocalCatalogFiles(manifest) {
  const issues = [];
  const seen = new Map();
  for (const resource of allResources(manifest)) {
    const path = localPathForAssetUrl(resource.value?.url);
    if (!path) continue;
    const expected = `${resource.value.digest}:${resource.value.byteSize}`;
    const prior = seen.get(path);
    if (prior && prior !== expected) {
      issue(
        issues,
        "local_resource_contract_conflict",
        resource.item.id,
        `${resource.name} conflicts with another declaration for ${path}`,
      );
      continue;
    }
    if (prior) continue;
    seen.set(path, expected);
    try {
      const bytes = await readFile(path);
      if (
        bytes.length !== resource.value.byteSize ||
        sha256(bytes) !== resource.value.digest
      ) {
        issue(
          issues,
          "local_resource_digest_mismatch",
          resource.item.id,
          `${resource.name} bytes do not match the manifest`,
        );
      }
    } catch (error) {
      issue(
        issues,
        "missing_local_resource",
        resource.item.id,
        `${resource.name}: ${error.message}`,
      );
    }
  }
  return issues;
}

function zipEntries(bytes) {
  let eocd = -1;
  for (
    let index = bytes.length - 22;
    index >= Math.max(0, bytes.length - 65557);
    index -= 1
  ) {
    if (bytes.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP EOCD missing");
  const count = bytes.readUInt16LE(eocd + 10);
  let cursor = bytes.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("ZIP central directory malformed");
    }
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`ZIP local header malformed: ${name}`);
    }
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(start, start + compressedSize);
    const content =
      method === 0
        ? Buffer.from(compressed)
        : method === 8
          ? inflateRawSync(compressed)
          : null;
    if (content) entries.set(name, content);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function mp4Metadata(bytes) {
  const marker = bytes.indexOf(Buffer.from("mvhd"));
  if (marker < 0) throw new Error("MP4 mvhd atom missing");
  const version = bytes[marker + 4];
  const timescaleOffset = marker + (version === 1 ? 24 : 16);
  const durationOffset = marker + (version === 1 ? 28 : 20);
  const timescale = bytes.readUInt32BE(timescaleOffset);
  const duration =
    version === 1
      ? Number(bytes.readBigUInt64BE(durationOffset))
      : bytes.readUInt32BE(durationOffset);
  if (!timescale || !duration) throw new Error("MP4 duration is invalid");
  let width = 0;
  let height = 0;
  const trackMarker = Buffer.from("tkhd");
  let track = bytes.indexOf(trackMarker);
  while (track >= 0) {
    const trackVersion = bytes[track + 4];
    const dimensionOffset = track + (trackVersion === 1 ? 92 : 80);
    if (dimensionOffset + 8 <= bytes.length) {
      const candidateWidth = Math.round(
        bytes.readUInt32BE(dimensionOffset) / 65536,
      );
      const candidateHeight = Math.round(
        bytes.readUInt32BE(dimensionOffset + 4) / 65536,
      );
      if (candidateWidth * candidateHeight > width * height) {
        width = candidateWidth;
        height = candidateHeight;
      }
    }
    track = bytes.indexOf(trackMarker, track + trackMarker.length);
  }
  if (!width || !height) throw new Error("MP4 video dimensions are invalid");
  return {
    durationMs: Math.round((duration / timescale) * 1000),
    width,
    height,
  };
}

function id3TagEnd(bytes) {
  if (bytes.subarray(0, 3).toString("ascii") !== "ID3") return 0;
  return (
    10 +
    ((bytes[6] & 0x7f) << 21) +
    ((bytes[7] & 0x7f) << 14) +
    ((bytes[8] & 0x7f) << 7) +
    (bytes[9] & 0x7f)
  );
}

function mp3DurationMs(bytes) {
  const bitratesMpeg1 = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
  ];
  const bitratesMpeg2 = [
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
  ];
  const sampleRates = [44100, 48000, 32000];
  let cursor = id3TagEnd(bytes);
  let seconds = 0;
  let frames = 0;
  while (cursor + 4 <= bytes.length) {
    if (!(bytes[cursor] === 0xff && (bytes[cursor + 1] & 0xe0) === 0xe0)) {
      cursor += 1;
      continue;
    }
    const header = bytes.readUInt32BE(cursor);
    const versionBits = (header >>> 19) & 0x3;
    const layerBits = (header >>> 17) & 0x3;
    const bitrateIndex = (header >>> 12) & 0xf;
    const sampleIndex = (header >>> 10) & 0x3;
    const padding = (header >>> 9) & 0x1;
    if (
      versionBits === 1 ||
      layerBits !== 1 ||
      bitrateIndex === 0 ||
      bitrateIndex === 15 ||
      sampleIndex === 3
    ) {
      cursor += 1;
      continue;
    }
    const mpeg1 = versionBits === 3;
    const bitrate = (mpeg1 ? bitratesMpeg1 : bitratesMpeg2)[bitrateIndex];
    const divisor = versionBits === 2 ? 2 : versionBits === 0 ? 4 : 1;
    const sampleRate = sampleRates[sampleIndex] / divisor;
    const samples = mpeg1 ? 1152 : 576;
    const frameLength = Math.floor(
      ((mpeg1 ? 144 : 72) * bitrate * 1000) / sampleRate + padding,
    );
    if (cursor + frameLength > bytes.length) break;
    seconds += samples / sampleRate;
    frames += 1;
    cursor += frameLength;
  }
  if (frames < 10) throw new Error("MP3 frame stream is too short");
  return Math.round(seconds * 1000);
}

function embeddedApic(bytes) {
  const tagEnd = id3TagEnd(bytes);
  if (!tagEnd) return null;
  const version = bytes[3];
  const synchsafe = (offset) =>
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f);
  let cursor = 10;
  while (cursor + 10 <= tagEnd) {
    const id = bytes.subarray(cursor, cursor + 4).toString("ascii");
    const size =
      version === 4 ? synchsafe(cursor + 4) : bytes.readUInt32BE(cursor + 4);
    if (!/^[A-Z0-9]{4}$/.test(id) || size <= 0) break;
    if (id === "APIC") {
      const frame = bytes.subarray(cursor + 10, cursor + 10 + size);
      const mimeEnd = frame.indexOf(0, 1);
      const descriptionEnd = frame.indexOf(0, mimeEnd + 2);
      return descriptionEnd >= 0 ? frame.subarray(descriptionEnd + 1) : null;
    }
    cursor += 10 + size;
  }
  return null;
}

function semanticSourceIssues(item, bytes, fetchedByUrl) {
  const issues = [];
  const metrics = item.quality?.metrics || {};
  const fail = (detail) =>
    issue(issues, "source_semantic_qc_failed", item.id, detail);
  try {
    switch (item.editorClass) {
      case "video_editing": {
        const metadata = mp4Metadata(bytes);
        if (
          metadata.durationMs < 10000 ||
          Math.abs(metadata.durationMs - metrics.durationMs) > 1500 ||
          Math.abs(metadata.durationMs - item.preview.durationMs) > 1500 ||
          metadata.width !== metrics.width ||
          metadata.height !== metrics.height ||
          metadata.width !== item.preview.width ||
          metadata.height !== item.preview.height
        ) {
          fail(
            `MP4 ${metadata.width}×${metadata.height}/${metadata.durationMs}ms does not match rendition and quality evidence`,
          );
        }
        break;
      }
      case "audio_editing": {
        const duration = mp3DurationMs(bytes);
        if (
          duration < 30000 ||
          Math.abs(duration - metrics.durationMs) > 2500 ||
          Math.abs(duration - item.preview.durationMs) > 2500
        ) {
          fail(`MP3 duration ${duration}ms does not match quality evidence`);
        }
        const art = embeddedApic(bytes);
        const thumbnail = fetchedByUrl.get(item.thumbnail.url);
        if (
          !art ||
          !thumbnail ||
          sha256(art) !== item.thumbnail.digest ||
          !art.equals(thumbnail.bytes)
        ) {
          fail("thumbnail is not the source MP3 embedded artwork");
        }
        break;
      }
      case "image_editing": {
        if (
          bytes.subarray(0, 4).toString() !== "RIFF" ||
          bytes.subarray(8, 12).toString() !== "WEBP"
        ) {
          fail("source is not a WebP image");
        }
        break;
      }
      case "document_editing": {
        const entries = zipEntries(bytes);
        const xml = entries.get("word/document.xml")?.toString("utf8") || "";
        const paragraphs = (xml.match(/<w:p(?:\s|>)/g) || []).length;
        const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (
          paragraphs < 8 ||
          text.length < 150 ||
          paragraphs !== metrics.paragraphCount ||
          Array.from(text).length !== metrics.textCharacters
        ) {
          fail(`DOCX has only ${paragraphs} paragraphs and ${text.length} chars`);
        }
        break;
      }
      case "spreadsheet_editing": {
        const entries = zipEntries(bytes);
        const sheets = [...entries.entries()].filter(([name]) =>
          /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
        );
        const cells = sheets.reduce(
          (count, [, xml]) =>
            count + (xml.toString("utf8").match(/<c(?:\s|>)/g) || []).length,
          0,
        );
        if (
          sheets.length < 1 ||
          cells < 24 ||
          sheets.length !== metrics.sheetCount ||
          cells !== metrics.cellCount
        ) {
          fail(`XLSX has only ${sheets.length} sheets and ${cells} cells`);
        }
        break;
      }
      case "presentation_editing": {
        const entries = zipEntries(bytes);
        const slides = [...entries.keys()].filter((name) =>
          /^ppt\/slides\/slide\d+\.xml$/.test(name),
        );
        if (slides.length < 6 || slides.length !== metrics.slideCount) {
          fail(`PPTX has ${slides.length} slides, contrary to quality evidence`);
        }
        break;
      }
      case "pdf_editing": {
        const pages = (
          bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) || []
        ).length;
        if (
          bytes.subarray(0, 5).toString() !== "%PDF-" ||
          pages < 1 ||
          pages !== metrics.pageCount
        ) {
          fail(`PDF has ${pages} valid page objects, contrary to quality evidence`);
        }
        break;
      }
      case "chart_editing": {
        const document = JSON.parse(bytes.toString("utf8"));
        const series = document.option?.series;
        const radar = document.option?.radar;
        const indicators = Array.isArray(radar)
          ? radar[0]?.indicator
          : radar?.indicator;
        const dataPoints = Array.isArray(series)
          ? series.reduce(
              (count, value) =>
                count +
                (Array.isArray(value?.data)
                  ? value.data.reduce(
                      (inner, point) =>
                        inner +
                        (Array.isArray(point?.value)
                          ? point.value.length
                          : Array.isArray(point)
                            ? point.length
                            : 1),
                      0,
                    )
                  : 0),
              0,
            )
          : 0;
        if (
          document.schema !== "oceanleo.chart.v1" ||
          !Array.isArray(series) ||
          series.length < 1 ||
          !Array.isArray(indicators) ||
          indicators.length < 3 ||
          series.length !== metrics.seriesCount ||
          indicators.length !== metrics.indicatorCount ||
          dataPoints !== metrics.dataPointCount
        ) {
          fail("chart JSON lacks a real series/indicator model");
        }
        break;
      }
      case "website_finetuning": {
        const document = JSON.parse(bytes.toString("utf8"));
        const sectionIds = new Set(
          (document.sections || []).map((section) => section?.id),
        );
        const supportedSectionTypes = new Set([
          "hero",
          "stats",
          "feature-grid",
          "pricing",
          "footer",
        ]);
        const sourceAssetUrls = new Set(
          (document.sections || [])
            .map((section) => section?.content?.image?.url)
            .filter(Boolean),
        );
        const closureUrls = new Set(
          item.source.dependencies.map((value) => value.url),
        );
        if (
          !document.siteName?.trim() ||
          !document.typography ||
          !Array.isArray(document.navigation) ||
          !Array.isArray(document.pages) ||
          document.pages.length < 1 ||
          !Array.isArray(document.sections) ||
          document.sections.length < 4 ||
          sectionIds.size !== document.sections.length ||
          document.sections.some(
            (section) =>
              !section?.id ||
              !supportedSectionTypes.has(section?.type) ||
              !record(section?.content) ||
              !record(section?.style),
          ) ||
          !Array.isArray(document.pages[0]?.sections) ||
          canonicalJson(document.pages[0].sections) !==
            canonicalJson(document.sections) ||
          document.pages.length !== metrics.pageCount ||
          document.sections.length !== metrics.sectionCount ||
          closureUrls.size !== metrics.dependencyCount ||
          [...sourceAssetUrls].some((url) => !closureUrls.has(url)) ||
          [...closureUrls].some((url) => !sourceAssetUrls.has(url))
        ) {
          fail(
            "website source is not a complete production VirtualSiteConfig with a closed image dependency set",
          );
        }
        break;
      }
      case "design_canvas": {
        const source = JSON.parse(bytes.toString("utf8"));
        const document = source.document;
        const ids = new Set((document?.elements || []).map((value) => value.id));
        if (
          !(document?.width >= 1000) ||
          !(document?.height >= 1000) ||
          !Array.isArray(document?.elements) ||
          document.elements.length < 20 ||
          ids.size !== document.elements.length ||
          document.width !== metrics.width ||
          document.height !== metrics.height ||
          document.elements.length !== metrics.elementCount ||
          canonicalJson(
            [...new Set(document.elements.map((value) => value.type))].sort(),
          ) !== canonicalJson([...(metrics.elementTypes || [])].sort()) ||
          metrics.stableElementIds !== true
        ) {
          fail("design document lacks a high-quality stable-ID object graph");
        }
        break;
      }
      case "video_canvas": {
        const project = JSON.parse(bytes.toString("utf8"));
        const head = project.versions?.[project.headVersionId];
        const nodes = head?.graph?.nodes;
        const edges = head?.graph?.edges;
        if (
          project.schema !== "oceanleo.video.project.v2" ||
          project.schemaVersion !== 2 ||
          !Array.isArray(nodes) ||
          nodes.length < 6 ||
          !Array.isArray(edges) ||
          edges.length < 5 ||
          Object.keys(project.assets || {}).length < 3 ||
          nodes.length !== metrics.nodeCount ||
          edges.length !== metrics.edgeCount ||
          Object.keys(project.assets || {}).length !== metrics.assetCount ||
          (head?.clips || []).length !== metrics.clipCount ||
          Math.round(
            Math.max(
              0,
              ...(head?.clips || []).map(
                (clip) =>
                  (Number(clip.startSeconds) + Number(clip.durationSeconds)) *
                  1000,
              ),
            ),
          ) !== metrics.durationMs
        ) {
          fail("video canvas source is not a substantive v2 production graph");
        }
        const closure = new Map(
          item.source.dependencies.map((value) => [
            value.url,
            value.digest,
          ]),
        );
        for (const asset of Object.values(project.assets || {})) {
          if (
            !asset.url ||
            !asset.contentDigest ||
            closure.get(asset.url) !== asset.contentDigest
          ) {
            fail(`project asset ${asset.assetId || "unknown"} is outside closure`);
          }
        }
        break;
      }
      case "model_3d": {
        const gltf = JSON.parse(bytes.toString("utf8"));
        const referenced = [
          ...(gltf.buffers || []).map((value) => value.uri),
          ...(gltf.images || []).map((value) => value.uri),
        ].filter((value) => typeof value === "string" && !value.startsWith("data:"));
        const closure = new Set(
          item.source.dependencies.map((value) => value.path),
        );
        if (
          gltf.asset?.version !== "2.0" ||
          (gltf.meshes || []).length < 1 ||
          referenced.some((path) => !closure.has(path)) ||
          [...closure].some((path) => !referenced.includes(path)) ||
          (gltf.scenes || []).length !== metrics.sceneCount ||
          (gltf.nodes || []).length !== metrics.nodeCount ||
          (gltf.meshes || []).length !== metrics.meshCount ||
          (gltf.materials || []).length !== metrics.materialCount ||
          (gltf.images || []).length !== metrics.textureCount ||
          closure.size !== metrics.dependencyCount
        ) {
          fail("glTF mesh or dependency closure is incomplete");
        }
        break;
      }
    }
  } catch (error) {
    fail(error.message);
  }
  return issues;
}

async function fetchResource(resource, signal) {
  const path = localPathForAssetUrl(resource.url);
  if (path) {
    return {
      bytes: await readFile(path),
      mediaType: resource.mediaType,
      status: 200,
      local: true,
    };
  }
  const response = await fetch(resource.url, {
    signal,
    headers: { "user-agent": "OceanLeo-catalog-verifier/1" },
  });
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mediaType: (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase(),
    status: response.status,
    local: false,
  };
}

export async function verifyCatalogResources(manifest) {
  const issues = [];
  const declarations = new Map();
  for (const resource of allResources(manifest)) {
    const previous = declarations.get(resource.value.url);
    if (
      previous &&
      (previous.value.digest !== resource.value.digest ||
        previous.value.byteSize !== resource.value.byteSize ||
        previous.value.mediaType !== resource.value.mediaType)
    ) {
      issue(
        issues,
        "resource_declaration_conflict",
        resource.item.id,
        `${resource.value.url} has conflicting metadata`,
      );
    } else if (!previous) {
      declarations.set(resource.value.url, resource);
    }
  }

  const fetchedByUrl = new Map();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const queue = [...declarations.values()];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const declaration = queue.shift();
        try {
          const fetched = await fetchResource(
            declaration.value,
            controller.signal,
          );
          fetchedByUrl.set(declaration.value.url, fetched);
          const expectedType = declaration.value.mediaType.toLowerCase();
          if (
            fetched.status !== 200 ||
            fetched.bytes.length !== declaration.value.byteSize ||
            sha256(fetched.bytes) !== declaration.value.digest ||
            (!fetched.local &&
              fetched.mediaType !== expectedType &&
              !(
                expectedType === "model/gltf+json" &&
                fetched.mediaType === "application/json"
              ))
          ) {
            issue(
              issues,
              "resource_integrity_failed",
              declaration.item.id,
              `${declaration.name} failed HTTP/MIME/size/digest verification`,
            );
          }
        } catch (error) {
          issue(
            issues,
            "resource_fetch_failed",
            declaration.item.id,
            `${declaration.name}: ${error.message}`,
          );
        }
      }
    });
    await Promise.all(workers);
  } finally {
    clearTimeout(timer);
  }

  for (const item of manifest.items) {
    const source = fetchedByUrl.get(item.source.url);
    if (source) {
      issues.push(...semanticSourceIssues(item, source.bytes, fetchedByUrl));
    }
    for (const [name, rendition] of [
      ["preview", item.preview],
      ["thumbnail", item.thumbnail],
    ]) {
      const fetched = fetchedByUrl.get(rendition.url);
      if (fetched && rendition.mediaType.startsWith("image/")) {
        try {
          const metadata = await sharp(fetched.bytes).metadata();
          if (
            metadata.width !== rendition.width ||
            metadata.height !== rendition.height ||
            (item.editorClass === "image_editing" &&
              name === "preview" &&
              (metadata.width !== item.quality.metrics.width ||
                metadata.height !== item.quality.metrics.height))
          ) {
            issue(
              issues,
              `${name}_dimension_mismatch`,
              item.id,
              `declared ${rendition.width}×${rendition.height}, received ${metadata.width}×${metadata.height}`,
            );
          }
        } catch (error) {
          issue(
            issues,
            `${name}_decode_failed`,
            item.id,
            error.message,
          );
        }
      }
    }
  }
  return issues;
}

export function formatIssues(issues) {
  return issues
    .map(
      (value) =>
        `${value.code}${value.itemId ? ` [${value.itemId}]` : ""}: ${value.detail}`,
    )
    .join("\n");
}
