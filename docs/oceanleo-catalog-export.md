# OceanLeo advanced-editor catalog export

## Product outcome

`asset` publishes one fail-closed catalog that gives every OceanLeo “更多素材”
surface one real, licensed, editable template for each of the 12 advanced editor
classes. The export carries immutable source and rendition digests so the backend
publisher can create durable artifact revisions without guessing from a card image.

The number 12 comes from `ADVANCED_FEATURES` in `@oceanleo/ui`, not from the
13-value artifact taxonomy. `single_file_image` is the source taxonomy used for
the one `image_editing` class; `vector_image` is another input taxonomy for that
same editor class and is deliberately not exported as a thirteenth class.

## Architecture decision

| Candidate | Mature components and interoperability | Guarantees and fit | Moving parts and known failures |
|---|---|---|---|
| Immutable catalog over approved OSS/first-party sources (chosen) | Existing OceanLeo advanced editor registry, production OSS objects, ordinary HTTPS, JSON and SHA-256 | Keeps original Office/media/project files, works without browser automation or special hardware/NAT, lets the publisher pin exact bytes | One JSON manifest, one static route, one API route and QC; fails closed when an object, digest, license, editor mapping or quality measurement drifts |
| Vendor every binary into the Next repository | Git/LFS and Next static assets are mature | Would make network validation local | Duplicates large media and 3D closures, expands deployments, creates a second license/distribution surface and still needs provenance QC |
| Resolve live providers or wrap previews at publish time | Provider search APIs and screenshot generation exist | Small repository footprint | Provider keys, mutable URLs, rate limits and license drift; screenshots cannot round-trip and would falsely label images as documents/video/projects |

The chosen chain ranks first on production maturity and environment fit, while
keeping fewer mutable services than live provider resolution. Vendoring remains
appropriate only for a small first-party project source that does not yet exist
in production storage.

Core falsification assumption: the selected production source URLs must return
the declared original bytes and those bytes must parse as their claimed native
formats rather than as preview images.

On 2026-07-22, `/tmp/asset-catalog-proof.mjs` fetched the 11 existing production
sources without a browser. Every response was HTTP 200, matched its recorded
SHA-256 and passed format magic/JSON parsing. Semantic inspection found an
83-second audio track (production inventory), an 8-slide PPTX, a 30-cell XLSX,
a real DOCX, a structured chart, a four-section website project, a complete
glTF dependency graph, a PDF and a 55-element design document. The sole genuine
gap was `video_canvas`: the approved inventory row had only a route and poster.
The export therefore owns one reviewed `oceanleo.video.project.v2` project that
uses the production editor's parser and real licensed source assets.

## Exact 12-class contract

| Editor class | Artifact taxonomy | Source format | Editor capability | Round-trip project schema |
|---|---|---|---|---|
| `video_editing` | `video` | `mp4` | `video-timeline` | `oceanleo.timeline.v1` |
| `audio_editing` | `audio` | `mp3` | `audio-editor` | `oceanleo.audio-project.v1` |
| `image_editing` | `single_file_image` | `webp` | `image-editor` | `oceanleo.fabric-image.v1` |
| `document_editing` | `document` | `docx` | `office-editor` | `office-file@1` |
| `spreadsheet_editing` | `grid` | `xlsx` | `office-editor` | `office-file@1` |
| `presentation_editing` | `deck` | `pptx` | `office-editor` | `office-file@1` |
| `pdf_editing` | `pdf` | `pdf` | `pdf-editor` | `pdf-binary@1` |
| `chart_editing` | `chart` | `oceanleo.chart.v1` | `chart-editor` | `oceanleo.chart.v1` |
| `website_finetuning` | `website` | `website-source@1` | `website-editor` | `website-source@1` |
| `design_canvas` | `composite_image` | `oceanleo.design-document.v1` | `design-canvas` | `oceanleo.design-document.v1` |
| `video_canvas` | `workflow` | `oceanleo.video.project.v2` | `video-canvas` | `oceanleo.video-canvas.v1` |
| `model_3d` | `model_3d` | `gltf` | `model-3d-editor` | `oceanleo.model-view@1` |

Raw Office/media files are intentional bounded inputs: the corresponding editor
loads the native file, mutates it, saves a project/checkpoint and reopens that
checkpoint. Structured classes publish their real graph/document source directly.

## Website editability and selection evidence

The `website_finetuning` row is not a screenshot relabeled as a website. Its
7,038-byte `website-source@1` source is a production `VirtualSiteConfig`: one
route, four stable semantic sections (`hero`, `stats`, `feature-grid`, `footer`),
editable typography/navigation/content/style values and a three-object image
dependency closure. QC requires the home page and root section graphs to agree
and requires every referenced image URL to be present in that hash-attested
closure.

Its separate preview is a decodable 1200×675 PNG whose manifest entry records
both the source digest from which it was rendered and its own byte digest. The
asset consumer now passes only `siteId="asset"` to the shared `ResultCanvas`;
it no longer injects local `lib/materials` rows or an obsolete site-only
context. The shared More library therefore owns the sequence: card selection
opens the common preview/detail workbench, and the explicit Edit action prepares
the pinned source revision before entering the website editor. The website
workbench itself defaults an absent `view` query to `preview`.

## Publisher interface

The canonical static interface is:

`GET https://asset.oceanleo.com/oceanleo-catalog/v1/manifest.json`

The equivalent API interface is:

`GET https://asset.oceanleo.com/api/oceanleo-catalog/v1`

The API returns the same document and an `ETag` equal to
`manifest.contentDigest`. It accepts optional exact `editorClass` and
`artifactType` query filters; unknown values return an empty `items` array, not
a fallback category.

Publisher rules:

1. Require schema `oceanleo.catalog-export.v1` and exactly the declared 12
   `requiredEditorClasses`.
2. Recompute each source/rendition digest before creating a durable revision.
3. Copy `artifactType`, `source.format`, `editorCapability`, license and
   provenance exactly; do not infer type or editability from thumbnail MIME.
4. Set public template role and fork permission only after all QC assertions
   pass.
5. Pin the resulting source and preview to the same revision and preserve
   `contentFamilyId` as the source/thumbnail coherence audit key.

Run `pnpm test:catalog` for deterministic schema/QC plus API parity/filter tests
and `pnpm verify:catalog` for live HTTP bytes, digests, MIME, decoded rendition
dimensions, media duration, native-format semantics and dependency-closure
checks. `pnpm test:artifacts` verifies that the asset site delegates More/My
Library to the shared remote surfaces. None of these commands uses a browser.
