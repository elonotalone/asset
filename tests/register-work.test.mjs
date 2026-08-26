// register-work.mjs 的三条拒绝闸 + 幂等覆盖。
//
//   node --test tests/register-work.test.mjs

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RegisterRejected,
  assertRegisterable,
  registerWork,
} from "../scripts/register-work.mjs";

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function cleanMeta(over = {}) {
  return {
    id: "ol-tips-001",
    artifactType: "composite_image",
    title: "几何继承示意",
    styleId: "tips",
    summary: "测试夹具",
    all_slots_replaced: true,
    provenance: { kind: "geometry-only", source_pack: "gd-financial-tips-001" },
    attribution: [
      {
        text: "测试夹具，无稿定字节",
        licenseCode: "CC0-1.0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      },
    ],
    ...over,
  };
}

test("拒绝 all_slots_replaced!==true", () => {
  for (const value of [false, "true", 1, undefined, null]) {
    assert.throws(
      () => assertRegisterable(cleanMeta({ all_slots_replaced: value })),
      (err) => err instanceof RegisterRejected && err.code === "all_slots_replaced",
      `all_slots_replaced=${JSON.stringify(value)} 应当被拒绝`,
    );
  }
});

test("拒绝 provenance.kind!==geometry-only", () => {
  assert.throws(
    () => assertRegisterable(cleanMeta({ provenance: { kind: "designer-pixels" } })),
    (err) => err instanceof RegisterRejected && err.code === "provenance.kind",
  );
  assert.throws(
    () => assertRegisterable(cleanMeta({ provenance: {} })),
    (err) => err instanceof RegisterRejected && err.code === "provenance.kind",
  );
  assert.throws(
    () => assertRegisterable(cleanMeta({ provenance: undefined })),
    (err) => err instanceof RegisterRejected && err.code === "provenance.kind",
  );
});

test("拒绝任意深度 license.status===internal-reference-only", () => {
  assert.throws(
    () =>
      assertRegisterable(
        cleanMeta({ license: { status: "internal-reference-only", code: "GD" } }),
      ),
    (err) => err instanceof RegisterRejected && err.code === "license.status",
  );
  assert.throws(
    () =>
      assertRegisterable(
        cleanMeta({
          slots: [
            { id: "art-1", license: { status: "internal-reference-only" } },
          ],
        }),
      ),
    (err) => err instanceof RegisterRejected && err.code === "license.status",
  );
});

test("三条都过才放行", () => {
  assert.doesNotThrow(() => assertRegisterable(cleanMeta()));
});

test("登记写入 public/works 与 content/works，同 id 覆盖不追加", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "register-work-"));
  try {
    mkdirSync(path.join(root, "content", "works"), { recursive: true });
    mkdirSync(path.join(root, "public", "works", "composite_image"), { recursive: true });
    writeFileSync(path.join(root, "content", "works", "composite_image.json"), "[]\n");
    const file = path.join(root, "pixel.png");
    writeFileSync(file, PNG_1x1);

    const first = await registerWork({
      meta: cleanMeta(),
      file,
      repoRoot: root,
    });
    assert.equal(first.overwritten, false);
    assert.equal(first.src, "/works/composite_image/ol-tips-001.png");
    assert.equal(first.cover, "/works/composite_image/ol-tips-001.cover.webp");

    const second = await registerWork({
      meta: cleanMeta({ title: "第二次覆盖", summary: "幂等" }),
      file,
      repoRoot: root,
    });
    assert.equal(second.overwritten, true);

    const catalog = JSON.parse(
      readFileSync(path.join(root, "content", "works", "composite_image.json"), "utf8"),
    );
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].id, "ol-tips-001");
    assert.equal(catalog[0].title, "第二次覆盖");
    assert.equal(catalog[0].view.kind, "image");
    assert.equal(catalog[0].downloadable, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI 入口对三条拒绝以退出码 1 失败（不写仓）", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "register-work-cli-"));
  try {
    const file = path.join(root, "pixel.png");
    writeFileSync(file, PNG_1x1);
    const metaPath = path.join(root, "meta.json");
    writeFileSync(
      metaPath,
      JSON.stringify(cleanMeta({ all_slots_replaced: false })),
    );
    await assert.rejects(
      () =>
        registerWork({
          meta: JSON.parse(readFileSync(metaPath, "utf8")),
          file,
          repoRoot: root,
        }),
      (err) => err instanceof RegisterRejected && err.code === "all_slots_replaced",
    );
    assert.equal(
      existsSync(path.join(root, "content", "works", "composite_image.json")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
