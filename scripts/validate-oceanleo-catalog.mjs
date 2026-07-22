import {
  catalogContentDigest,
  formatIssues,
  readCatalog,
  validateCatalogShape,
  validateLocalCatalogFiles,
} from "./oceanleo-catalog-qc.mjs";

const manifest = await readCatalog();
if (process.argv.includes("--print-digest")) {
  console.log(catalogContentDigest(manifest));
  process.exit(0);
}

const issues = [
  ...validateCatalogShape(manifest),
  ...(await validateLocalCatalogFiles(manifest)),
];
if (issues.length) {
  console.error(formatIssues(issues));
  process.exit(1);
}
console.log(
  JSON.stringify({
    ok: true,
    schema: manifest.schema,
    classes: manifest.requiredEditorClasses.length,
    items: manifest.items.length,
    digest: manifest.contentDigest,
  }),
);
