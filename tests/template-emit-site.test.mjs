import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createSiteZip } from "../lib/site-zip.ts";

test("ZIP 书写器产物恒定，且标准 unzip 可完整读回", () => {
  const entries = [
    { path: "index.html", data: "<!doctype html><title>离线站点</title>" },
    { path: "assets/site.css", data: "body{color:#123}" },
    { path: "images/photo.webp", data: new Uint8Array([0, 255, 19, 128, 7]) },
  ];
  const first = createSiteZip(entries);
  const second = createSiteZip(entries);
  assert.deepEqual(first, second, "相同输入应产生逐字节相同的 ZIP");

  const dir = mkdtempSync(join(tmpdir(), "template-site-zip-"));
  const archive = join(dir, "site.zip");
  try {
    writeFileSync(archive, first);
    const listed = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    assert.deepEqual(listed.stdout.trim().split("\n"), entries.map((entry) => entry.path));

    for (const entry of entries) {
      const extracted = spawnSync("unzip", ["-p", archive, entry.path]);
      assert.equal(extracted.status, 0, extracted.stderr.toString());
      const expected = typeof entry.data === "string" ? Buffer.from(entry.data) : Buffer.from(entry.data);
      assert.deepEqual(extracted.stdout, expected, `${entry.path} 解压后字节不一致`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ZIP 书写器拒绝路径穿越和重名文件", () => {
  assert.throws(() => createSiteZip([{ path: "../outside", data: "x" }]), /Unsafe/);
  assert.throws(
    () => createSiteZip([{ path: "same", data: "a" }, { path: "same", data: "b" }]),
    /Duplicate/,
  );
});
