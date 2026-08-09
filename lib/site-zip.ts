// 站点下载用的最小 ZIP 写入器。站点里的 webp 本身已压缩，因此采用 ZIP
// store 模式：不引入依赖，不重复消耗 CPU，普通解压工具可直接打开。
// 所有条目用固定的 1980-01-01 时间戳，同一组输入恒定得到相同字节。

export interface ZipEntry {
  path: string;
  data: string | Uint8Array;
}

interface PreparedEntry {
  path: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

const encoder = new TextEncoder();
const UTF8_FLAG = 0x0800;
const DOS_TIME = 0;
const DOS_DATE = 0x0021; // 1980-01-01

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < CRC_TABLE.length; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[n] = value >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function bytesOf(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? encoder.encode(data) : data;
}

function assertSafePath(path: string): void {
  const parts = path.split("/");
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe zip entry path: ${path}`);
  }
}

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

/**
 * 把一组文件写成标准 ZIP（store）字节。输入顺序即压缩包内顺序。
 */
export function createSiteZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  if (entries.length > 0xffff) throw new Error("Too many zip entries");

  const seen = new Set<string>();
  const prepared: PreparedEntry[] = [];
  let localSize = 0;

  for (const entry of entries) {
    assertSafePath(entry.path);
    if (seen.has(entry.path)) throw new Error(`Duplicate zip entry: ${entry.path}`);
    seen.add(entry.path);

    const path = encoder.encode(entry.path);
    const data = bytesOf(entry.data);
    if (path.byteLength > 0xffff) throw new Error(`Zip entry path is too long: ${entry.path}`);
    if (data.byteLength > 0xffffffff) throw new Error(`Zip entry is too large: ${entry.path}`);

    prepared.push({ path, data, crc: crc32(data), offset: localSize });
    localSize += 30 + path.byteLength + data.byteLength;
  }

  let centralSize = 0;
  for (const entry of prepared) centralSize += 46 + entry.path.byteLength;
  const totalSize = localSize + centralSize + 22;
  if (totalSize > 0xffffffff) throw new Error("Zip archive is too large");

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let cursor = 0;

  for (const entry of prepared) {
    u32(view, cursor, 0x04034b50);
    u16(view, cursor + 4, 20);
    u16(view, cursor + 6, UTF8_FLAG);
    u16(view, cursor + 8, 0); // store
    u16(view, cursor + 10, DOS_TIME);
    u16(view, cursor + 12, DOS_DATE);
    u32(view, cursor + 14, entry.crc);
    u32(view, cursor + 18, entry.data.byteLength);
    u32(view, cursor + 22, entry.data.byteLength);
    u16(view, cursor + 26, entry.path.byteLength);
    u16(view, cursor + 28, 0);
    output.set(entry.path, cursor + 30);
    output.set(entry.data, cursor + 30 + entry.path.byteLength);
    cursor += 30 + entry.path.byteLength + entry.data.byteLength;
  }

  const centralOffset = cursor;
  for (const entry of prepared) {
    u32(view, cursor, 0x02014b50);
    u16(view, cursor + 4, 20);
    u16(view, cursor + 6, 20);
    u16(view, cursor + 8, UTF8_FLAG);
    u16(view, cursor + 10, 0); // store
    u16(view, cursor + 12, DOS_TIME);
    u16(view, cursor + 14, DOS_DATE);
    u32(view, cursor + 16, entry.crc);
    u32(view, cursor + 20, entry.data.byteLength);
    u32(view, cursor + 24, entry.data.byteLength);
    u16(view, cursor + 28, entry.path.byteLength);
    u16(view, cursor + 30, 0);
    u16(view, cursor + 32, 0);
    u16(view, cursor + 34, 0);
    u16(view, cursor + 36, 0);
    u32(view, cursor + 38, 0);
    u32(view, cursor + 42, entry.offset);
    output.set(entry.path, cursor + 46);
    cursor += 46 + entry.path.byteLength;
  }

  u32(view, cursor, 0x06054b50);
  u16(view, cursor + 4, 0);
  u16(view, cursor + 6, 0);
  u16(view, cursor + 8, prepared.length);
  u16(view, cursor + 10, prepared.length);
  u32(view, cursor + 12, centralSize);
  u32(view, cursor + 16, centralOffset);
  u16(view, cursor + 20, 0);

  return output;
}
