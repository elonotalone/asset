import {
  formatIssues,
  readCatalog,
  validateCatalogShape,
  validateLocalCatalogFiles,
  verifyCatalogResources,
} from "./oceanleo-catalog-qc.mjs";

const manifest = await readCatalog();
const localIssues = [
  ...validateCatalogShape(manifest),
  ...(await validateLocalCatalogFiles(manifest)),
];
if (localIssues.length) {
  console.error(formatIssues(localIssues));
  process.exit(1);
}

const resourceIssues = await verifyCatalogResources(manifest);
if (resourceIssues.length) {
  console.error(formatIssues(resourceIssues));
  process.exit(1);
}
console.log(
  JSON.stringify({
    ok: true,
    mode: "network",
    classes: manifest.requiredEditorClasses.length,
    items: manifest.items.length,
    digest: manifest.contentDigest,
  }),
);
