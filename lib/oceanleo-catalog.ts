import manifestJson from "@/public/oceanleo-catalog/v1/manifest.json";

export interface OceanLeoCatalogResource {
  url: string;
  mediaType: string;
  byteSize: number;
  digest: `sha256:${string}`;
}

export interface OceanLeoCatalogItem {
  id: string;
  revisionId: string;
  title: string;
  editorClass: string;
  artifactType: string;
  sourceFormat: string;
  editorCapability: string;
  contentFamilyId: string;
  roles: string[];
  taxonomy: {
    primary: string;
    labels: string[];
    tags: string[];
  };
  source: OceanLeoCatalogResource & {
    format: string;
    integrity: "content_addressed" | "complete_dependency_closure";
    openMode: "native-file" | "structured-project";
    dependencies: Array<
      OceanLeoCatalogResource & {
        path: string;
      }
    >;
  };
  preview: OceanLeoCatalogResource & {
    width?: number;
    height?: number;
    durationMs?: number;
    derivedFromSourceDigest: `sha256:${string}`;
    derivation: string;
  };
  thumbnail: OceanLeoCatalogResource & {
    width: number;
    height: number;
    derivedFromSourceDigest: `sha256:${string}`;
    derivation: string;
  };
  editor: {
    capability: string;
    adapter: string;
    projectSchema: string;
    editability: "native" | "bounded";
    roundTrip: string[];
    evidence: string;
  };
  provenance: {
    inventoryId: string;
    providerId: string;
    providerAssetId: string;
    sourcePage: string;
    author: string;
    reviewedAt: string;
    license: {
      code: string;
      url: string;
      commercialOk: boolean;
      modifyOk: boolean;
      attributionRequired: boolean;
      attributionText: string;
    };
    thirdPartyAttributions?: Array<{
      providerId: string;
      providerAssetId: string;
      sourcePage: string;
      licenseCode: string;
      licenseUrl: string;
    }>;
  };
  quality: {
    status: "approved";
    metrics: Record<string, unknown>;
  };
}

export interface OceanLeoCatalog {
  schema: "oceanleo.catalog-export.v1";
  version: 1;
  publishedAt: string;
  sourceSite: "asset";
  contentDigest: `sha256:${string}`;
  requiredEditorClasses: string[];
  qualityPolicy: Record<string, unknown>;
  items: OceanLeoCatalogItem[];
}

export const OCEANLEO_CATALOG =
  manifestJson as unknown as OceanLeoCatalog;

export function oceanLeoCatalogItems(filters: {
  editorClass?: string;
  artifactType?: string;
} = {}): OceanLeoCatalogItem[] {
  const editorClass = filters.editorClass?.trim() || "";
  const artifactType = filters.artifactType?.trim() || "";
  return OCEANLEO_CATALOG.items.filter(
    (item) =>
      (!editorClass || item.editorClass === editorClass) &&
      (!artifactType || item.artifactType === artifactType),
  );
}
