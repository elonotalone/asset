"use client";

import type {
  LibraryItem,
  LibraryKind,
  MaterialItem,
} from "@oceanleo/ui/shell";

export const ASSET_ARTIFACT_TYPES = [
  "single_file_image",
  "composite_image",
  "vector_image",
  "video",
  "audio",
  "document",
  "deck",
  "grid",
  "chart",
  "website",
  "model_3d",
  "pdf",
  "workflow",
] as const;

export type AssetArtifactType = (typeof ASSET_ARTIFACT_TYPES)[number];
export type SourceEditability = "native" | "bounded" | "view_only";

export interface SourceClosureEntry {
  path: string;
  sha256: string;
  size: number;
  contentType: string;
}

export interface AttestedAssetFixture {
  id: string;
  artifactType: AssetArtifactType;
  title: string;
  inventory: {
    id: string;
    kind: string;
    status: "approved";
    createdAt: string;
  };
  delivery: {
    fullUrl: string;
    previewUrl: string;
    thumbUrl: string;
  };
  source: {
    url: string;
    format: string;
    contentType: string;
    sha256: string | null;
    size: number;
    closure: readonly SourceClosureEntry[];
    integrity:
      | "content_addressed"
      | "complete_dependency_closure"
      | "route_attested_no_graph_source";
  };
  provenance: {
    provider: string;
    providerPage: string;
    author: string;
    licenseCode: string;
    licenseUrl: string;
    commercialOk: boolean;
    modifyOk: boolean;
    attributionRequired: boolean;
    attributionText: string;
    attestedFrom: "oceanleo.public.platform_assets";
    attestedOn: "2026-07-19";
  };
  capability: {
    sourceEditability: SourceEditability;
    editorId: string | null;
    sceneGraph: boolean;
    evidence: string;
    sharedActions: {
      preview: true;
      edit: false;
      insert: boolean;
      replace: false;
    };
    unavailableReason: string;
  };
  sceneEvidence?: {
    schema: string;
    documentId: string;
    width: number;
    height: number;
    elementCount: number;
    elementTypes: readonly string[];
    stableElementIds: boolean;
  };
}

const OSS = "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com";
const CONTROL_PLANE_GATE =
  "Approved inventory has no durable artifact root/revision yet; Edit and Replace stay disabled until the central fork/backfill API returns a revision-pinned LibraryItem.";

/**
 * One approved, real inventory row per manifest-required semantic type.
 * `source` is the actual editable/original source when one exists, never the
 * thumbnail. Workflow intentionally records the current route-only gap.
 */
export const ASSET_CONTEXT_FIXTURES: readonly AttestedAssetFixture[] = [
  {
    id: "img-pixabay-157876",
    artifactType: "single_file_image",
    title: "coffee percolator",
    inventory: {
      id: "001ee71d-7df6-4857-bd76-a08cdfcc6242",
      kind: "image",
      status: "approved",
      createdAt: "2026-06-29T10:54:26.874921+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/image/coffee/pixabay-illustration-157876.webp`,
      previewUrl: `${OSS}/assets/image/coffee/pixabay-illustration-157876.webp`,
      thumbUrl: `${OSS}/assets/image/coffee/pixabay-illustration-157876.thumb.webp`,
    },
    source: {
      url: `${OSS}/assets/image/coffee/pixabay-illustration-157876.webp`,
      format: "webp",
      contentType: "image/webp",
      sha256:
        "0b873e092f7f73e079709f7a25f8be591d96fee93fb9c899f787d29b2f6127c7",
      size: 34480,
      closure: [],
      integrity: "content_addressed",
    },
    provenance: {
      provider: "pixabay",
      providerPage:
        "https://pixabay.com/vectors/coffee-percolator-coffee-maker-pot-157876/",
      author: "OpenClipart-Vectors",
      licenseCode: "PIXABAY",
      licenseUrl: "https://pixabay.com/service/license/",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "bounded",
      editorId: "image",
      sceneGraph: false,
      evidence:
        "The source is one verified WebP raster. It supports bounded raster work after fork, not layers or object recovery.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason: CONTROL_PLANE_GATE,
    },
  },
  {
    id: "tpl-mc-board-04",
    artifactType: "composite_image",
    title: "安全第一",
    inventory: {
      id: "0538c42d-a52c-4cd9-afca-ee50f14b3123",
      kind: "image",
      status: "approved",
      createdAt: "2026-07-14T17:53:34.937236+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/design-preview/mc-board-04.webp?v=202607040933`,
      previewUrl: `${OSS}/assets/design-preview/mc-board-04.webp?v=202607040933`,
      thumbUrl: `${OSS}/assets/design-preview/mc-board-04.webp?v=202607040933`,
    },
    source: {
      url: "https://asset.oceanleo.com/design-templates/doc/mc-board-04.json",
      format: "oceanleo.design-document.v1",
      contentType: "application/json",
      sha256:
        "f0410de2fbdd9b07bbdbec93660b6d724e01e3db495352263697faeb998f56bc",
      size: 29175,
      closure: [],
      integrity: "content_addressed",
    },
    provenance: {
      provider: "oceanleo-design-template",
      providerPage:
        "https://asset.oceanleo.com/design-templates/doc/mc-board-04.json",
      author: "OceanLeo",
      licenseCode: "OceanLeo-owned",
      licenseUrl: "",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "native",
      editorId: "design-canvas",
      sceneGraph: true,
      evidence:
        "The source JSON contains a 1200×1600 design document with 55 stable-ID image, shape, and text elements.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason: CONTROL_PLANE_GATE,
    },
    sceneEvidence: {
      schema: "oceanleo.design-document.v1",
      documentId: "design-mc-board-04-aruwn",
      width: 1200,
      height: 1600,
      elementCount: 55,
      elementTypes: ["image", "shape", "text"],
      stableElementIds: true,
    },
  },
  {
    id: "fixture-vector-tabler-apple",
    artifactType: "vector_image",
    title: "Tabler apple",
    inventory: {
      id: "00051529-afd1-4464-b0b3-978676b0c7b4",
      kind: "vector",
      status: "approved",
      createdAt: "2026-06-29T08:05:50.855848+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/vector/icon/tabler-apple.svg`,
      previewUrl: `${OSS}/assets/vector/icon/tabler-apple.svg`,
      thumbUrl: `${OSS}/assets/vector/icon/tabler-apple.svg`,
    },
    source: {
      url: `${OSS}/assets/vector/icon/tabler-apple.svg`,
      format: "svg",
      contentType: "image/svg+xml",
      sha256:
        "d02615de738a025c4c2155f8f7d158231bacba43062bd05a8a39b6157e3381f6",
      size: 783,
      closure: [],
      integrity: "content_addressed",
    },
    provenance: {
      provider: "tabler",
      providerPage: "https://github.com/tabler/tabler-icons/blob/main/LICENSE",
      author: "tabler",
      licenseCode: "MIT",
      licenseUrl: "https://github.com/tabler/tabler-icons/blob/main/LICENSE",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "view_only",
      editorId: null,
      sceneGraph: false,
      evidence:
        "The original SVG is preserved, but the shared workbench has no verified vector-semantic round-trip adapter.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason:
        "No trusted SVG round-trip editor is currently registered.",
    },
  },
  {
    id: "fixture-video-pexels-36314952",
    artifactType: "video",
    title: "Vibrant green dot pattern in motion",
    inventory: {
      id: "0002483b-98c8-443e-90d9-ab102b6bbaf0",
      kind: "video",
      status: "approved",
      createdAt: "2026-06-30T02:09:43.0402+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/video/abstract/pexels-36314952.mp4`,
      previewUrl: `${OSS}/assets/video/abstract/pexels-36314952.mp4`,
      thumbUrl: `${OSS}/assets/video/abstract/pexels-36314952.poster.webp`,
    },
    source: {
      url: `${OSS}/assets/video/abstract/pexels-36314952.mp4`,
      format: "mp4",
      contentType: "video/mp4",
      sha256:
        "25707a95203d6ad812e8d0096a57e53e7e283c09bd279a88d7d29c1d1d331fcd",
      size: 1470560,
      closure: [],
      integrity: "content_addressed",
    },
    provenance: {
      provider: "pexels",
      providerPage:
        "https://www.pexels.com/video/vibrant-green-dot-pattern-in-motion-36314952/",
      author: "Nicola Narracci",
      licenseCode: "PEXELS",
      licenseUrl: "https://www.pexels.com/license/",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "bounded",
      editorId: "video-timeline",
      sceneGraph: false,
      evidence:
        "The verified MP4 can seed a new timeline project; no existing timeline source is claimed.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason: CONTROL_PLANE_GATE,
    },
  },
  {
    id: "fixture-audio-jamendo-186949",
    artifactType: "audio",
    title: "The Accident",
    inventory: {
      id: "001b0022-35d9-4dec-9213-2c499eb18aa8",
      kind: "audio",
      status: "approved",
      createdAt: "2026-06-29T15:40:31.820403+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/audio/music/jamendo-186949.mp3`,
      previewUrl: `${OSS}/assets/audio/music/jamendo-186949.mp3`,
      thumbUrl: "",
    },
    source: {
      url: `${OSS}/assets/audio/music/jamendo-186949.mp3`,
      format: "mp3",
      contentType: "audio/mpeg",
      sha256:
        "46aaa7d8a70f44f7b2993a872f30a949bcfb86a1a73699d2184000aff18827c8",
      size: 1991170,
      closure: [],
      integrity: "content_addressed",
    },
    provenance: {
      provider: "jamendo",
      providerPage: "https://www.jamendo.com/track/186949",
      author: "Paper Plane Pilots",
      licenseCode: "CC-BY-SA",
      licenseUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: true,
      attributionText: '"The Accident" by Paper Plane Pilots (CC-BY-SA)',
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "bounded",
      editorId: "audio",
      sceneGraph: false,
      evidence:
        "The verified MP3 can seed a new audio project; no multitrack project is claimed.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason: CONTROL_PLANE_GATE,
    },
  },
  {
    id: "fixture-document-employee-handbook",
    artifactType: "document",
    title: "员工入职手册",
    inventory: {
      id: "6ac113a8-92d8-4c6a-895f-7a80ede77bd0",
      kind: "document",
      status: "approved",
      createdAt: "2026-07-16T14:31:35.139092+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/workspace-starters/document/employee-handbook.docx`,
      previewUrl: `${OSS}/assets/workspace-starters/document/employee-handbook.png`,
      thumbUrl: `${OSS}/assets/workspace-starters/document/employee-handbook.png`,
    },
    source: {
      url: `${OSS}/assets/workspace-starters/document/employee-handbook.docx`,
      format: "docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sha256:
        "0fdbf3a8b8483dca70aa9eb45606fe24be29252848bb5fcee9c48c1078e9e8b1",
      size: 2116,
      closure: [],
      integrity: "content_addressed",
    },
    provenance: {
      provider: "oceanleo-curated",
      providerPage: `${OSS}/assets/workspace-starters/document/employee-handbook.docx`,
      author: "OceanLeo",
      licenseCode: "OceanLeo-First-Party",
      licenseUrl: "",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "native",
      editorId: "office",
      sceneGraph: false,
      evidence: "A real DOCX source is present and hash-attested.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason: CONTROL_PLANE_GATE,
    },
  },
  {
    id: "fixture-deck-housekeeping-terrazzo",
    artifactType: "deck",
    title: "高端家政服务体系介绍 · 水磨石生活风",
    inventory: {
      id: "0049e38c-061f-437e-9f60-f21decb1550f",
      kind: "ppt",
      status: "approved",
      createdAt: "2026-07-03T02:28:23.326751+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/ppt/decks/housekeeping-terrazzo/deck.pptx`,
      previewUrl: `${OSS}/assets/ppt/decks/housekeeping-terrazzo/p01.webp`,
      thumbUrl: `${OSS}/assets/ppt/decks/housekeeping-terrazzo/cover.webp`,
    },
    source: {
      url: `${OSS}/assets/ppt/decks/housekeeping-terrazzo/deck.pptx`,
      format: "pptx",
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      sha256:
        "1ce53ecfa693a4f63edc1fd6f4ade1cb5c7e25dad671effb556a73975c093a39",
      size: 508745,
      closure: [],
      integrity: "content_addressed",
    },
    provenance: {
      provider: "oceanleo-design",
      providerPage: `${OSS}/assets/ppt/decks/housekeeping-terrazzo/deck.html`,
      author: "OceanLeo Design",
      licenseCode: "CC0",
      licenseUrl: "",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "native",
      editorId: "office",
      sceneGraph: false,
      evidence: "A real eight-page PPTX source is present and hash-attested.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason: CONTROL_PLANE_GATE,
    },
  },
  {
    id: "fixture-grid-content-calendar",
    artifactType: "grid",
    title: "内容发布排期表",
    inventory: {
      id: "2b331364-2e01-4c2c-9547-9e12668a6d1b",
      kind: "sheet",
      status: "approved",
      createdAt: "2026-07-13T04:03:14.27253+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/workspace-starters/sheet/content-calendar.xlsx`,
      previewUrl: `${OSS}/assets/workspace-starters/sheet/content-calendar.png`,
      thumbUrl: `${OSS}/assets/workspace-starters/sheet/content-calendar.png`,
    },
    source: {
      url: `${OSS}/assets/workspace-starters/sheet/content-calendar.xlsx`,
      format: "xlsx",
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sha256:
        "3ab8f48589c6377909f8f9f7a1444adfffc45d3695514751ebe0ad4355717e05",
      size: 5487,
      closure: [],
      integrity: "content_addressed",
    },
    provenance: {
      provider: "oceanleo-curated",
      providerPage: `${OSS}/assets/workspace-starters/sheet/content-calendar.xlsx`,
      author: "OceanLeo",
      licenseCode: "OceanLeo-First-Party",
      licenseUrl: "",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "native",
      editorId: "grid",
      sceneGraph: false,
      evidence: "A real XLSX source is present and hash-attested.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason: CONTROL_PLANE_GATE,
    },
  },
  {
    id: "fixture-chart-radar-draw",
    artifactType: "chart",
    title: "雷达图·展开",
    inventory: {
      id: "094901da-e787-4c1e-a105-ea24a0f9c6d8",
      kind: "chart",
      status: "approved",
      createdAt: "2026-07-03T09:23:57.189323+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/chart/radar/radar-draw/chart.html`,
      previewUrl: `${OSS}/assets/chart/radar/radar-draw/cover.png`,
      thumbUrl: `${OSS}/assets/chart/radar/radar-draw/cover.png`,
    },
    source: {
      url: `${OSS}/assets/chart/radar/radar-draw/chart.json`,
      format: "oceanleo.chart.v1",
      contentType: "application/json",
      sha256:
        "96941f776360af136789dad35639f407a8db0e03ae8835a397de36ab95fb6686",
      size: 2197,
      closure: [],
      integrity: "content_addressed",
    },
    provenance: {
      provider: "oceanleo-chart",
      providerPage: `${OSS}/assets/chart/radar/radar-draw/chart.json`,
      author: "OceanLeo",
      licenseCode: "CC0",
      licenseUrl: "",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "native",
      editorId: "chart-editor@1",
      sceneGraph: false,
      evidence:
        "The card preview is HTML/PNG, while the separately attested chart JSON is the editor source.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason: CONTROL_PLANE_GATE,
    },
  },
  {
    id: "fixture-website-editorial-blog",
    artifactType: "website",
    title: "博客内容站范例",
    inventory: {
      id: "1ec1732f-a544-44ee-9821-6b72e70de9ac",
      kind: "website",
      status: "approved",
      createdAt: "2026-07-14T08:25:32.884436+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/workspace-starters/website/editorial-blog.html`,
      previewUrl: `${OSS}/assets/workspace-starters/website/editorial-blog.png`,
      thumbUrl: `${OSS}/assets/workspace-starters/website/editorial-blog.png`,
    },
    source: {
      url: `${OSS}/assets/workspace-starters/website/editorial-blog.site.json`,
      format: "website-source@1",
      contentType: "application/json",
      sha256:
        "017ebffe350f973e06e371a0465239c9cdb960315b2f3a2e32aea7a2bb40a054",
      size: 7038,
      closure: [],
      integrity: "content_addressed",
    },
    provenance: {
      provider: "oceanleo-curated",
      providerPage: `${OSS}/assets/workspace-starters/website/editorial-blog.site.json`,
      author: "OceanLeo",
      licenseCode: "OceanLeo-First-Party",
      licenseUrl: "",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "native",
      editorId: "website",
      sceneGraph: false,
      evidence:
        "The rendered HTML and editable site JSON are separate, real, hash-attested renditions.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason: CONTROL_PLANE_GATE,
    },
  },
  {
    id: "fixture-model-barber-chair",
    artifactType: "model_3d",
    title: "Barber Shop Chair 01",
    inventory: {
      id: "08449fd9-6b5a-49df-bafd-e46d2da8477d",
      kind: "3d",
      status: "approved",
      createdAt: "2026-06-29T08:32:17.00689+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/3d/model/BarberShopChair_01/BarberShopChair_01.gltf`,
      previewUrl: `${OSS}/assets/3d/model/BarberShopChair_01.preview.webp`,
      thumbUrl: `${OSS}/assets/3d/model/BarberShopChair_01.preview.webp`,
    },
    source: {
      url: `${OSS}/assets/3d/model/BarberShopChair_01/BarberShopChair_01.gltf`,
      format: "gltf",
      contentType: "model/gltf+json",
      sha256:
        "801bed991ab1d3f110ff8e7958fcfe8e60a96582cadb55dbada28e292a111f20",
      size: 2706,
      integrity: "complete_dependency_closure",
      closure: [
        {
          path: "BarberShopChair_01.bin",
          sha256:
            "39ecebfef975af4e812134b7f056e243f6404ce60c4dc2e9dec30930802ea24b",
          size: 268464,
          contentType: "application/octet-stream",
        },
        {
          path: "textures/BarberShopChair_01_nor_gl_1k.jpg",
          sha256:
            "3f51a8f05b38a547db52e10e6e2bec48a10fbeff5d04efc66b82a5b3d026b0fb",
          size: 215938,
          contentType: "image/jpeg",
        },
        {
          path: "textures/BarberShopChair_01_diff_1k.jpg",
          sha256:
            "9d1054e6fe12e8397cbca6f1a50ecd2b4d880d8d355cb66e982abc752bf24d22",
          size: 173699,
          contentType: "image/jpeg",
        },
        {
          path: "textures/BarberShopChair_01_arm_1k.jpg",
          sha256:
            "502ecae4a2f7b09b79f03317f1fe6c141c8f2c753b77e639395e3aea3de46eba",
          size: 218372,
          contentType: "image/jpeg",
        },
      ],
    },
    provenance: {
      provider: "polyhaven",
      providerPage: "https://polyhaven.com/a/BarberShopChair_01",
      author: "Poly Haven",
      licenseCode: "CC0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "bounded",
      editorId: "threed",
      sceneGraph: true,
      evidence:
        "The glTF entry, binary buffer, and all three referenced textures are present and individually hash-attested.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason: CONTROL_PLANE_GATE,
    },
  },
  {
    id: "fixture-pdf-campaign-review",
    artifactType: "pdf",
    title: "市场活动复盘报告",
    inventory: {
      id: "181935a5-4476-4eae-998b-132dc96fd1e2",
      kind: "pdf",
      status: "approved",
      createdAt: "2026-07-16T14:31:36.327233+00:00",
    },
    delivery: {
      fullUrl: `${OSS}/assets/workspace-starters/pdf/campaign-review.pdf`,
      previewUrl: `${OSS}/assets/workspace-starters/pdf/campaign-review.png`,
      thumbUrl: `${OSS}/assets/workspace-starters/pdf/campaign-review.png`,
    },
    source: {
      url: `${OSS}/assets/workspace-starters/pdf/campaign-review.pdf`,
      format: "pdf",
      contentType: "application/pdf",
      sha256:
        "9bd71f5662a45b0c40a853616b577df695a2dd7050619ec118c957528d936815",
      size: 48439,
      closure: [],
      integrity: "content_addressed",
    },
    provenance: {
      provider: "oceanleo-curated",
      providerPage: `${OSS}/assets/workspace-starters/pdf/campaign-review.pdf`,
      author: "OceanLeo",
      licenseCode: "OceanLeo-First-Party",
      licenseUrl: "",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "bounded",
      editorId: "pdf",
      sceneGraph: false,
      evidence:
        "The real PDF binary supports bounded page/annotation workflows; it is not represented as a rich document.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason: CONTROL_PLANE_GATE,
    },
  },
  {
    id: "fixture-workflow-video-canvas-flow",
    artifactType: "workflow",
    title: "LeoVideo · 节点式视频工作流",
    inventory: {
      id: "ddd08801-5e1a-441d-aac9-a49ea1ece937",
      kind: "video_workflow",
      status: "approved",
      createdAt: "2026-07-13T04:03:16.029459+00:00",
    },
    delivery: {
      fullUrl: "https://video.oceanleo.com/workspace/canvas-flow",
      previewUrl: `${OSS}/assets/workspace-starters/video-workflow/video-node-workflow.png`,
      thumbUrl: `${OSS}/assets/workspace-starters/video-workflow/video-node-workflow.png`,
    },
    source: {
      url: "https://video.oceanleo.com/workspace/canvas-flow",
      format: "route",
      contentType: "text/html",
      sha256: null,
      size: 0,
      closure: [],
      integrity: "route_attested_no_graph_source",
    },
    provenance: {
      provider: "oceanleo-curated",
      providerPage: "https://video.oceanleo.com/workspace/canvas-flow",
      author: "OceanLeo",
      licenseCode: "OceanLeo-First-Party",
      licenseUrl: "",
      commercialOk: true,
      modifyOk: true,
      attributionRequired: false,
      attributionText: "",
      attestedFrom: "oceanleo.public.platform_assets",
      attestedOn: "2026-07-19",
    },
    capability: {
      sourceEditability: "view_only",
      editorId: null,
      sceneGraph: false,
      evidence:
        "The approved row points to the real canvas-flow route but contains no revision-pinned node/edge graph source.",
      sharedActions: {
        preview: true,
        edit: false,
        insert: false,
        replace: false,
      },
      unavailableReason:
        "Graph Edit/Insert/Replace remain disabled until a real workflow graph source is ingested.",
    },
  },
];

const LIBRARY_KIND_BY_TYPE: Record<AssetArtifactType, LibraryKind> = {
  single_file_image: "image",
  composite_image: "canvas",
  vector_image: "image",
  video: "video",
  audio: "audio",
  document: "document",
  deck: "ppt",
  grid: "sheet",
  chart: "image",
  website: "website",
  model_3d: "threed",
  pdf: "document",
  workflow: "video_canvas",
};

function fixtureViewerUrl(fixture: AttestedAssetFixture): string {
  if (
    fixture.artifactType === "video" ||
    fixture.artifactType === "audio" ||
    fixture.artifactType === "document" ||
    fixture.artifactType === "deck" ||
    fixture.artifactType === "grid" ||
    fixture.artifactType === "website" ||
    fixture.artifactType === "model_3d" ||
    fixture.artifactType === "pdf" ||
    fixture.artifactType === "workflow"
  ) {
    return fixture.delivery.fullUrl;
  }
  return fixture.delivery.previewUrl || fixture.delivery.fullUrl;
}

function fixtureLibraryItem(fixture: AttestedAssetFixture): LibraryItem {
  const viewerUrl = fixtureViewerUrl(fixture);
  return {
    key: `asset:library:${fixture.inventory.id}`,
    source: "artifact",
    id: `asset:library:${fixture.inventory.id}`,
    title: fixture.title,
    kind: LIBRARY_KIND_BY_TYPE[fixture.artifactType],
    siteId: "asset",
    url: viewerUrl,
    previewUrl:
      fixture.artifactType === "website"
        ? undefined
        : fixture.delivery.previewUrl || viewerUrl,
    thumbUrl: fixture.delivery.thumbUrl || undefined,
    favorite: false,
    createdAt: fixture.inventory.createdAt,
    meta: {
      inventory_id: fixture.inventory.id,
      inventory_type: fixture.inventory.kind,
      artifact_type: fixture.artifactType,
      source_format: fixture.source.format,
      source_url: fixture.source.url,
      source_sha256: fixture.source.sha256,
      source_size: fixture.source.size,
      source_integrity: fixture.source.integrity,
      source_closure: fixture.source.closure,
      provider: fixture.provenance.provider,
      provider_page: fixture.provenance.providerPage,
      license_code: fixture.provenance.licenseCode,
      license_url: fixture.provenance.licenseUrl,
      attribution_required: fixture.provenance.attributionRequired,
      attribution_text: fixture.provenance.attributionText,
      source_editability: fixture.capability.sourceEditability,
      candidate_editor_id: fixture.capability.editorId,
      durable_artifact_id: null,
      revision_id: null,
      scene_evidence: fixture.sceneEvidence || null,
      capability_evidence: fixture.capability.evidence,
    },
    descriptor: {
      contentType: fixture.artifactType,
      representation: fixture.source.integrity,
      subtype: fixture.source.format,
      editor: null,
      capabilities: ["load"],
      unavailableReason: fixture.capability.unavailableReason,
    },
  };
}

export const MATERIALS: MaterialItem[] = ASSET_CONTEXT_FIXTURES.map(
  (fixture) => ({
    id: fixture.id,
    title: fixture.title,
    thumb: fixture.delivery.thumbUrl || fixture.delivery.previewUrl,
    preview: fixture.delivery.previewUrl || fixture.delivery.fullUrl,
    categories: [fixture.artifactType],
    desc: `${fixture.artifactType} · ${fixture.capability.sourceEditability} · ${fixture.provenance.licenseCode}`,
    tags: [
      fixture.artifactType,
      fixture.source.format,
      fixture.provenance.provider,
    ],
    kind:
      fixture.artifactType === "website" ||
      fixture.artifactType === "workflow"
        ? "web"
        : fixture.artifactType === "document" ||
            fixture.artifactType === "pdf"
          ? "doc"
          : fixture.artifactType === "deck"
            ? "slides"
            : "image",
    libraryItem: fixtureLibraryItem(fixture),
  }),
);

export const ARTIFACT_CONTEXTS = [
  {
    contextId: "olctx:v1:asset:site",
    siteKey: "asset" as const,
    contextKind: "site" as const,
    primaryMaterialPolicy: "exact_bindings" as const,
    requiredPrimaryTypes: ASSET_ARTIFACT_TYPES,
    bindings: ASSET_CONTEXT_FIXTURES.map((fixture, index) => ({
      materialId: fixture.id,
      inventoryId: fixture.inventory.id,
      artifactType: fixture.artifactType,
      rank: index + 1,
      role: "approved_inventory_example" as const,
    })),
    moreAccess: "shared_authorized_library" as const,
  },
] as const;

export function materialsForContext(contextId: string): MaterialItem[] {
  if (contextId === "olctx:v1:asset:site") return MATERIALS;
  return [];
}

/** Site-only compatibility key. Unknown keys fail closed instead of falling back. */
export function materialsForApp(appId: string): MaterialItem[] {
  if (appId === "asset" || appId === "site") return MATERIALS;
  return [];
}
