import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SOURCE_URL =
  "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/audio/music/jamendo-186949.mp3";
const SOURCE_SHA256 =
  "46aaa7d8a70f44f7b2993a872f30a949bcfb86a1a73699d2184000aff18827c8";
const OUTPUT = resolve(
  "public/oceanleo-catalog/v1/previews/the-accident-cover.jpg",
);

function synchsafe(bytes, offset) {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function frameSize(bytes, offset, version) {
  return version === 4
    ? synchsafe(bytes, offset)
    : bytes.readUInt32BE(offset);
}

function imageFromApic(frame) {
  const encoding = frame[0];
  if (encoding !== 0 && encoding !== 3) {
    throw new Error("Only ISO-8859-1/UTF-8 APIC metadata is supported.");
  }
  const mimeEnd = frame.indexOf(0, 1);
  if (mimeEnd < 0) throw new Error("APIC MIME delimiter is missing.");
  const mime = frame.subarray(1, mimeEnd).toString("utf8");
  const descriptionEnd = frame.indexOf(0, mimeEnd + 2);
  if (descriptionEnd < 0) {
    throw new Error("APIC description delimiter is missing.");
  }
  const image = frame.subarray(descriptionEnd + 1);
  const jpeg =
    image[0] === 0xff && image[1] === 0xd8 && image.at(-2) === 0xff;
  const png =
    image.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (
    image.length < 8_000 ||
    (mime !== "image/jpeg" && mime !== "image/png") ||
    (!jpeg && !png)
  ) {
    throw new Error("Embedded APIC artwork is missing or not a real image.");
  }
  return { image, mime };
}

const response = await fetch(SOURCE_URL, {
  headers: { "user-agent": "OceanLeo-catalog-cover-extractor/1" },
});
if (!response.ok) {
  throw new Error(`Audio source returned HTTP ${response.status}.`);
}
const source = Buffer.from(await response.arrayBuffer());
const sourceDigest = createHash("sha256").update(source).digest("hex");
if (sourceDigest !== SOURCE_SHA256) {
  throw new Error(
    `Audio source digest drifted: expected ${SOURCE_SHA256}, received ${sourceDigest}.`,
  );
}
if (source.subarray(0, 3).toString("ascii") !== "ID3") {
  throw new Error("Audio source does not contain an ID3v2 tag.");
}

const version = source[3];
const tagEnd = 10 + synchsafe(source, 6);
let cursor = 10;
let artwork = null;
while (cursor + 10 <= tagEnd) {
  const id = source.subarray(cursor, cursor + 4).toString("ascii");
  const size = frameSize(source, cursor + 4, version);
  if (!/^[A-Z0-9]{4}$/.test(id) || size <= 0) break;
  if (id === "APIC") {
    artwork = imageFromApic(source.subarray(cursor + 10, cursor + 10 + size));
    break;
  }
  cursor += 10 + size;
}
if (!artwork) throw new Error("Audio source contains no usable APIC artwork.");

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, artwork.image);
console.log(
  JSON.stringify({
    output: OUTPUT,
    mime: artwork.mime,
    bytes: artwork.image.length,
    sha256: createHash("sha256").update(artwork.image).digest("hex"),
  }),
);
