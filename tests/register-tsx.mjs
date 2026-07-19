import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { transformSync } from "next/dist/build/swc/index.js";

const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      const resolved = nextResolve(specifier, context);
      if (
        resolved.url.startsWith("file:") &&
        resolved.url.endsWith(".js") &&
        !existsSync(fileURLToPath(resolved.url))
      ) {
        for (const extension of TYPESCRIPT_EXTENSIONS) {
          const sourceUrl = `${resolved.url.slice(0, -3)}${extension}`;
          if (existsSync(fileURLToPath(sourceUrl))) {
            return { url: sourceUrl, shortCircuit: true };
          }
        }
      }
      return resolved;
    } catch (error) {
      if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
        const sourceSpecifier = specifier.endsWith(".js")
          ? specifier.slice(0, -3)
          : specifier;
        for (const extension of [...TYPESCRIPT_EXTENSIONS, ".js"]) {
          try {
            return nextResolve(`${sourceSpecifier}${extension}`, context);
          } catch {
            // Try the next source extension.
          }
        }
        throw error;
      }
      for (const extension of TYPESCRIPT_EXTENSIONS) {
        const url = new URL(`${specifier}${extension}`, context.parentURL);
        if (existsSync(fileURLToPath(url))) {
          return { url: url.href, shortCircuit: true };
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    const extension = TYPESCRIPT_EXTENSIONS.find((candidate) =>
      new URL(url).pathname.endsWith(candidate),
    );
    if (!extension) return nextLoad(url, context);
    const filename = fileURLToPath(url);
    const result = transformSync(readFileSync(filename, "utf8"), {
      filename,
      jsc: {
        parser: {
          syntax: "typescript",
          tsx: extension === ".tsx",
        },
        target: "es2022",
        transform: {
          react: {
            runtime: "automatic",
          },
        },
      },
      module: {
        type: "es6",
      },
      sourceMaps: false,
    });
    return {
      format: "module",
      source: result.code,
      shortCircuit: true,
    };
  },
});
