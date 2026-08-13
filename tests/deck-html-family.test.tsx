import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@oceanleo/ui/i18n/provider.js";

import * as kinds from "@/components/WorksKinds";
import { WorksViewer } from "@/components/WorksViewer";
import * as worksModule from "@/lib/works";

const HTML_ID = "deck-html-contract-probe";
const HTML_URL =
  "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed";

function work(
  deliveryFamily: "pptx" | "html",
  sourceFile: "deck.json" | "deck.html.json",
): kinds.WorkEntry {
  return {
    id: `${HTML_ID}-${deliveryFamily}`,
    artifactType: "deck",
    deliveryFamily,
    title: `${deliveryFamily} deck`,
    styleId: "neon",
    summary: "contract probe",
    cover: "/works/deck/probe.cover.webp",
    view: {
      kind: "deck",
      src:
        deliveryFamily === "html"
          ? "/works/deck/src/probe/deck.json"
          : "/works/deck/probe.pptx",
      source:
        deliveryFamily === "html"
          ? "/works/deck/src/probe/deck.json"
          : undefined,
      pages: ["/works/deck/pages/probe/01.webp"],
      runtime: deliveryFamily === "html" ? HTML_URL : undefined,
      aspect: 16 / 9,
    },
    downloadable: true,
    attribution: [
      {
        text: "OceanLeo first-party contract fixture",
        licenseCode: "CC0-1.0",
        licenseUrl:
          "https://creativecommons.org/publicdomain/zero/1.0/",
      },
    ],
    sourceFile,
  };
}

test("deck family is selected only by controlled family or manifest file", () => {
  const families = kinds.familiesFor("deck");
  assert.deepEqual(
    families?.map((family) => family.id),
    ["pptx", "html"],
  );

  assert.equal(
    kinds.deckDeliveryFamilyFrom("html", "deck.html.json"),
    "html",
  );
  assert.equal(
    kinds.deckDeliveryFamilyFrom(undefined, "deck.json"),
    "pptx",
  );
  assert.equal(
    kinds.deckDeliveryFamilyFrom("html", "deck.json"),
    null,
    "manifest/family conflict must fail closed",
  );
  assert.equal(kinds.deckDeliveryFamilyFrom("web", "deck.html.json"), null);

  assert.equal(kinds.familyOf(work("pptx", "deck.json")).id, "pptx");
  assert.equal(kinds.familyOf(work("html", "deck.html.json")).id, "html");
  assert.deepEqual(
    kinds
      .groupByFamily("deck", [
        work("pptx", "deck.json"),
        work("html", "deck.html.json"),
      ])
      .map((group) => [group.family.id, group.works.length]),
    [
      ["pptx", 1],
      ["html", 1],
    ],
  );
});

test("F9 website-kind runtime can attach only to an HTML delivery deck", () => {
  const manifestItem = {
    id: HTML_ID,
    kind: "website" as const,
    source: `content/active-runtime/website/${HTML_ID}`,
    entry: "index.html" as const,
  };
  const plan = {
    schema: "oceanleo.active-runtime-plan.v1",
    manifest: "content/active-runtime/manifest.deck-html.json",
    manifestSha256: "a".repeat(64),
    itemCount: 1,
    totalBytes: 1,
    items: [
      {
        item: manifestItem,
        host: "s-0123456789abcdef0123456789abcdef.oceanleo.app",
        entryUrl: HTML_URL,
        closureSha256: "b".repeat(64),
        fileCount: 1,
        totalBytes: 1,
        files: [
          { path: "index.html", sha256: "c".repeat(64), bytes: 1 },
        ],
      },
    ],
  };
  const urls = worksModule.activeRuntimeUrlsFrom(
    { schema: "oceanleo.active-runtime-manifest.v1", items: [manifestItem] },
    plan,
  );
  assert.equal(
    worksModule.runtimeUrlForWork(
      { ...work("html", "deck.html.json"), id: HTML_ID },
      urls,
    ),
    HTML_URL,
  );
  assert.equal(
    worksModule.runtimeUrlForWork(
      { ...work("pptx", "deck.json"), id: HTML_ID },
      urls,
    ),
    undefined,
  );
});

test("HTML deck viewer uses static pages and a new-window runtime link", () => {
  const html = renderToStaticMarkup(
    <I18nProvider locale="zh" messages={{}}>
      <WorksViewer
        work={work("html", "deck.html.json")}
        payload={{}}
        extracted={null}
      />
    </I18nProvider>,
  );
  assert.match(html, /\/works\/deck\/pages\/probe\/01\.webp/);
  assert.match(html, new RegExp(HTML_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /查看结构稿/);
  assert.doesNotMatch(html, /<iframe|srcdoc=/i);
});
