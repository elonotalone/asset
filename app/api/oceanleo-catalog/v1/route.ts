import { NextResponse } from "next/server";

import {
  OCEANLEO_CATALOG,
  oceanLeoCatalogItems,
} from "@/lib/oceanleo-catalog";

const CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export function GET(request: Request) {
  const url = new URL(request.url);
  const editorClass = url.searchParams.get("editorClass")?.trim() || "";
  const artifactType = url.searchParams.get("artifactType")?.trim() || "";
  const filtered = Boolean(editorClass || artifactType);
  const items = oceanLeoCatalogItems({ editorClass, artifactType });
  const body = filtered
    ? {
        ...OCEANLEO_CATALOG,
        query: {
          editorClass: editorClass || null,
          artifactType: artifactType || null,
        },
        resultCount: items.length,
        items,
      }
    : OCEANLEO_CATALOG;

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": CACHE_CONTROL,
      ETag: `"${OCEANLEO_CATALOG.contentDigest}"`,
      "X-OceanLeo-Catalog-Digest": OCEANLEO_CATALOG.contentDigest,
    },
  });
}
