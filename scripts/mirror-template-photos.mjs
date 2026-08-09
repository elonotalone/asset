// 把配图池里的全部 OSS 图片下载成仓库内镜像（public/template-photos/）。
//
// 为什么要镜像：生成的站点是给人下载带走的，页面里任何 https 图片地址都意味着
// 「断网就空白」。镜像一次，站点产物里只留相对路径的本地图。
//
// 幂等：已存在且字节数与远端 Content-Length 一致的文件跳过。
// 用法：bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- \
//         node scripts/mirror-template-photos.mjs

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/template-photos");

function localPhotoFile(url) {
  const clean = String(url).split("?")[0];
  const m = clean.match(/\/assets\/image\/([^/]+)\/([^/]+)$/);
  if (m) return `${m[1]}--${m[2]}`;
  return (clean.split("/").pop() || "photo.webp").replace(/[^\w.-]/g, "_");
}

const pool = JSON.parse(readFileSync(join(ROOT, "lib/template-photo-pool.json"), "utf8"));
const urls = new Set();
for (const list of Object.values(pool.pool)) for (const u of list) urls.add(u);
for (const u of pool.fallback) urls.add(u);

mkdirSync(OUT, { recursive: true });

const all = [...urls].sort();
const byFile = new Map();
for (const u of all) {
  const f = localPhotoFile(u);
  if (byFile.has(f) && byFile.get(f) !== u) {
    console.error(`文件名冲突：${f} ← ${byFile.get(f)} / ${u}`);
    process.exit(1);
  }
  byFile.set(f, u);
}

let done = 0;
let skipped = 0;
let failed = 0;
const CONCURRENCY = 8;

async function fetchOne(url) {
  const file = localPhotoFile(url);
  const dest = join(OUT, file);
  try {
    const head = await fetch(url, { method: "HEAD" });
    const remoteLen = Number(head.headers.get("content-length") || 0);
    try {
      if (statSync(dest).size === remoteLen && remoteLen > 0) {
        skipped++;
        return;
      }
    } catch {
      // 本地还没有，继续下载。
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (remoteLen && buf.length !== remoteLen) throw new Error(`字节数不符 ${buf.length}/${remoteLen}`);
    writeFileSync(dest, buf);
    done++;
  } catch (err) {
    failed++;
    console.error(`失败 ${url}: ${err.message}`);
  }
}

const queue = [...all];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const url = queue.shift();
      if (!url) return;
      await fetchOne(url);
    }
  }),
);

const manifest = Object.fromEntries([...byFile.entries()].map(([f, u]) => [u, f]));
writeFileSync(join(ROOT, "lib/template-photo-mirror.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`镜像完成：新下载 ${done}，已存在 ${skipped}，失败 ${failed}，总计 ${all.length}`);
process.exit(failed ? 1 : 0);
