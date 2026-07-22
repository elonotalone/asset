import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@oceanleo/ui/i18n/provider.js";
import { artifactActionMatrix } from "@oceanleo/ui/shell/ArtifactActions.js";
import { MaterialLibrary } from "@oceanleo/ui/shell/MaterialLibrary.js";
import type {
  ArtifactProjection,
  LibraryItem,
} from "@oceanleo/ui/shell";

const CONTEXT_ID = "olctx:v1:asset:app:asset";

function durableItem(): LibraryItem {
  const artifact: ArtifactProjection = {
    schema: "oceanleo.artifact.v1",
    artifactId: "asset-root",
    revisionId: "asset-rev-2",
    artifactType: "single_file_image",
    roles: ["approved_inventory_example"],
    owner: {
      principalId: "workspace:asset",
      visibility: "workspace",
      originSiteKey: "asset",
      originAppId: "asset",
      originFunctionId: null,
    },
    access: {
      canRead: true,
      canPreview: true,
      canEdit: true,
      canFork: false,
      canInsert: true,
      canReplace: true,
      canFavorite: true,
      canBind: true,
      canExportSource: true,
    },
    editability: "bounded",
    editorCapability: "image-editor",
    sourceFormat: "png",
    title: "Durable migrated asset",
    favorite: false,
    renditions: {
      preview: {
        purpose: "preview",
        revisionId: "asset-rev-2",
        url: "https://signed.example/asset-preview",
        mediaType: "image/png",
        format: "png",
        expiresAt: null,
        rendererVersion: null,
        width: 1200,
        height: 800,
        durationMs: null,
        digest: "sha256:preview",
      },
      source: {
        purpose: "source",
        revisionId: "asset-rev-2",
        url: "https://signed.example/asset-source",
        mediaType: "image/png",
        format: "png",
        expiresAt: null,
        rendererVersion: null,
        width: 1200,
        height: 800,
        durationMs: null,
        digest: "sha256:source",
      },
    },
    scene: null,
    provenance: {
      id: "provenance-1",
      sourceKind: "owned",
      licenseCode: "internal",
      licenseUrl: "",
      attribution: "",
    },
    bindings: [
      {
        contextId: CONTEXT_ID,
        role: "approved_inventory_example",
        rank: 1,
        pinnedRevisionId: "asset-rev-2",
      },
    ],
    integrity: {
      ok: true,
      code: "ok",
      reason: "",
    },
    createdAt: "2026-07-19T00:00:00Z",
  };
  return {
    key: "artifact:asset-root:asset-rev-2",
    source: "artifact",
    id: "asset-root",
    title: artifact.title,
    kind: "image",
    siteId: "asset",
    url: artifact.renditions.preview?.url,
    previewUrl: artifact.renditions.preview?.url,
    thumbUrl: artifact.renditions.preview?.url,
    favorite: false,
    meta: {
      advanced_editor_route: "image",
    },
    descriptor: {
      contentType: "image",
      representation: "artifact",
      subtype: "png",
      editor: null,
      capabilities: ["load", "save"],
      unavailableReason: "",
    },
    artifactId: artifact.artifactId,
    revisionId: artifact.revisionId,
    artifactType: artifact.artifactType,
    artifact,
  };
}

const targetEvidence = {
  visible: true,
  available: true,
  reason: "",
};

test("asset consumer delegates More and My Library to the shared remote surfaces", () => {
  const caller = readFileSync("components/AssetLibrary.tsx", "utf8");
  const detail = readFileSync("components/AssetDetail.tsx", "utf8");
  const resultCanvas = readFileSync(
    "node_modules/@oceanleo/ui/src/shell/ResultCanvas.tsx",
    "utf8",
  );
  const materialLibrary = readFileSync(
    "node_modules/@oceanleo/ui/src/shell/material-library-view.tsx",
    "utf8",
  );
  const workspaceLibrary = readFileSync(
    "node_modules/@oceanleo/ui/src/shell/WorkspaceLibrary.tsx",
    "utf8",
  );
  assert.match(caller, /<ResultCanvas/);
  assert.match(caller, /siteId="asset"/);
  assert.equal(CONTEXT_ID, "olctx:v1:asset:app:asset");
  assert.doesNotMatch(
    caller,
    /@\/lib\/materials|ARTIFACT_CONTEXTS|materialContext=/,
  );
  assert.doesNotMatch(
    caller,
    /\bmaterials=\{|<MaterialLibrary|typed-artifact|TypedArtifact/,
  );
  assert.doesNotMatch(
    caller,
    /\b(?:curatedType|lockLevel|fetchMore|fetchCurated)=/,
  );
  assert.doesNotMatch(
    detail,
    /artifactActionMatrix|ArtifactActionButtons|USE_TARGETS|openInSite/,
  );
  assert.match(
    resultCanvas,
    /materialContext\?\.contextId\s*\|\|\s*canonicalArtifactContextId\(materialSiteId, materialAppId\)/,
  );
  assert.match(
    materialLibrary,
    /onOpenEntry=\{\s*level === "primary"[\s\S]*?: undefined\s*\}/,
  );
  assert.match(
    workspaceLibrary,
    /if \(onOpenEntry\) \{[\s\S]*?return;\s*\}\s*setSelectedId\(entry.id\)/,
  );
});

test("shared shell filters legacy rows and exposes canonical actions for durable rows", () => {
  const durable = durableItem();
  const matrix = artifactActionMatrix(durable, {
    canOpenPreview: true,
    canOpenEdit: true,
    insert: targetEvidence,
    replace: targetEvidence,
  });
  assert.ok(
    Object.values(matrix).every(
      (state) => state.visible && state.available && !state.requiresEnsure,
    ),
  );

  const html = renderToStaticMarkup(
    <I18nProvider locale="zh" messages={{}}>
      <MaterialLibrary
        materials={[
          {
            id: "durable-asset",
            title: durable.title,
            thumb: durable.thumbUrl || "",
            libraryItem: durable,
          },
        ]}
        siteId="asset"
        appId="asset"
        contextId={CONTEXT_ID}
        fetchPrimary={false}
        materialActions={["insert", "replace"]}
        materialActionAvailable={() => true}
        onMaterialAction={() => ({ ok: true })}
        onOpenItem={() => {}}
      />
    </I18nProvider>,
  );
  assert.match(html, /Durable migrated asset/);
  assert.match(html, /aria-label="打开完整素材库"/);
  for (const label of [
    "单文件图片",
    "复合图片",
    "矢量图片",
    "图表",
    "文档",
    "表格",
    "幻灯片",
    "PDF",
    "网站",
    "视频",
    "音频",
    "3D",
    "工作流",
  ]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
});
