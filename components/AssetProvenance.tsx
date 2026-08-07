"use client";

import { useUI } from "@oceanleo/ui/i18n";

// 产权与出处块。回答用户的三个问题：这东西是谁的、我能不能拿走、拿去用要背什么义务。
// 契约见 docs/work-logs/2026-08/asset-provenance-and-explore-packs/tasks/W2-provenance-api.md
//
// 后端字段（origin / redistribute_ok / supply_tier）尚未上线时，本文件的推导层用
// 已有字段兜底，且一律往严的方向倒：不知道能不能转手就说不能，不知道能不能下载就说
// 「未标注」而不是「可以」。服务端一旦给出真值，真值优先，推导层自动让位。

export type AssetOrigin = "first-party" | "external";

export interface ProvenanceFacts {
  origin: AssetOrigin;
  redistributeOk: boolean;
  sourceUrl: string;
  sourceLabel: string;
  /** undefined = 未标注，不是 false。三态的理由见契约 §5。 */
  downloadable?: boolean;
  licenseCode: string;
  licenseName: string;
  licenseUrl: string;
  commercialOk: boolean;
  modifyOk: boolean;
  attributionRequired: boolean;
  attributionText: string;
  /** undefined = 该 code 未登记完整条款，按最严文案渲染。 */
  noticeRequired?: boolean;
  shareAlike?: boolean;
}

// --- 只读镜像表 -------------------------------------------------------------
// 线上 /v1/assets/library/search 返回的 license 对象只有 7 个键，没有
// notice_required / share_alike / license_family（源头是 supa.py:574-582 手搓了这个
// 字典，没走 assets.py:_license_obj()，而后者是有这三个键的）。supa.py 是 W1 的独占
// 面，已写 signals/W2-request.md 请其补投影。
//
// 在投影补上之前，这张表逐条抄自 assets.py:113-180 的 _LICENSE_FLAGS，权威仍在 L5
// 规格。它**只用于展示**：不注册任何新 code、不改任何权限位。表里查不到的 code 回
// undefined，渲染成「请自行核对原始许可证」——是收紧不是放宽。
// 服务端补上投影后，服务端值优先，这张表可整块删除。
const LICENSE_OBLIGATIONS: Record<
  string,
  { notice: boolean; shareAlike: boolean; family: string }
> = {
  CC0: { notice: false, shareAlike: false, family: "public-domain" },
  "CC0-1.0": { notice: false, shareAlike: false, family: "public-domain" },
  PDM: { notice: false, shareAlike: false, family: "public-domain" },
  PEXELS: { notice: false, shareAlike: false, family: "platform-terms" },
  PIXABAY: { notice: false, shareAlike: false, family: "platform-terms" },
  "CC-BY": { notice: false, shareAlike: false, family: "attribution" },
  "CC-BY-SA": { notice: false, shareAlike: true, family: "share-alike" },
  "CC-BY-ND": { notice: false, shareAlike: false, family: "attribution" },
  "CC-BY-NC": { notice: false, shareAlike: false, family: "attribution" },
  "CC-BY-NC-SA": { notice: false, shareAlike: true, family: "share-alike" },
  "CC-BY-NC-ND": { notice: false, shareAlike: false, family: "attribution" },
  MIT: { notice: true, shareAlike: false, family: "permissive-notice" },
  ISC: { notice: true, shareAlike: false, family: "permissive-notice" },
  "APACHE-2.0": { notice: true, shareAlike: false, family: "permissive-notice" },
  OFL: { notice: true, shareAlike: false, family: "permissive-notice" },
  "CDLA-PERMISSIVE-2.0": { notice: true, shareAlike: false, family: "permissive-notice" },
  "ODBL-1.0": { notice: true, shareAlike: true, family: "share-alike" },
  "OCEANLEO-AIGEN": { notice: false, shareAlike: false, family: "first-party" },
  "OCEANLEO-FIRST-PARTY": { notice: false, shareAlike: false, family: "first-party" },
  "OCEANLEO-OWNED": { notice: false, shareAlike: false, family: "first-party" },
  "FREE-COMMERCIAL": { notice: false, shareAlike: false, family: "first-party" },
  // family='unknown' 的三个 code 故意不给 notice/shareAlike 的 false：见 obligationsOf()，
  // 它们走「未登记完整条款」这一支，说无义务是错的。
  "ARXIV-PERPETUAL-1.0": { notice: false, shareAlike: false, family: "unknown" },
  "WB-MICRODATA": { notice: false, shareAlike: false, family: "unknown" },
  UNKNOWN: { notice: false, shareAlike: false, family: "unknown" },
};

// 事实 B1 的六个自产 source，也正是 W1 回填 origin='first-party' 的那批。推导与将来的
// 服务端真值按构造一致。
const FIRST_PARTY_SOURCES = new Set([
  "oceanleo",
  "oceanleo-aigen",
  "oceanleo-chart",
  "oceanleo-curated",
  "oceanleo-design",
  "oceanleo-design-template",
]);

// 来源键 → 展示名。查不到就原样显示来源键（不编一个好看的名字）。
const SOURCE_LABELS: Record<string, string> = {
  openverse: "Openverse",
  pexels: "Pexels",
  pixabay: "Pixabay",
  polyhaven: "Poly Haven",
  freesound: "Freesound",
  jamendo: "Jamendo",
  officeplus: "OfficePLUS",
  svgrepo: "SVG Repo",
  kenney: "Kenney",
};

export function sourceLabelOf(source: string): string {
  const key = (source || "").trim();
  return SOURCE_LABELS[key.toLowerCase()] || key;
}

// 授权义务：服务端给了就用服务端的，否则查镜像表。family='unknown' 或表里没有的 code
// 一律回 undefined，由渲染层说「请自行核对」。
function obligationsOf(
  code: string,
  serverNotice?: boolean,
  serverShareAlike?: boolean,
): { noticeRequired?: boolean; shareAlike?: boolean } {
  if (typeof serverNotice === "boolean" || typeof serverShareAlike === "boolean") {
    return { noticeRequired: serverNotice, shareAlike: serverShareAlike };
  }
  const row = LICENSE_OBLIGATIONS[(code || "").trim().toUpperCase()];
  if (!row || row.family === "unknown") return {};
  return { noticeRequired: row.notice, shareAlike: row.shareAlike };
}

function isFirstPartyCode(code: string): boolean {
  const upper = (code || "").trim().toUpperCase();
  if (!upper) return false;
  // 前缀判定覆盖尚未落进镜像表的自产 code（合同 §4.0 的 OceanLeo-Free-1.0 由 W1 注册
  // 进 L5 后才会出现）。这里只判「是不是我们的」，不主张任何权限位。
  if (upper.startsWith("OCEANLEO")) return true;
  return LICENSE_OBLIGATIONS[upper]?.family === "first-party";
}

/** 只放行 http/https。javascript: / data: 之类一律当作没有出处，不渲染链接。 */
export function safeHttpUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? raw : "";
  } catch {
    return "";
  }
}

function readableHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// 组件接受的最小素材形状。刻意不引用 lib/assets.ts 的 Asset：那个文件不在 W2 的独占
// 面上（类型轴归 W3、成品货架接入归 W4），用结构化取值谁都不用等谁改类型。
export interface ProvenanceAssetLike {
  source?: string;
  source_url?: string;
  origin?: string;
  redistribute_ok?: boolean;
  supply_tier?: string;
  download_url?: string;
  license?: {
    code?: string;
    name?: string;
    url?: string;
    commercial_ok?: boolean;
    modify_ok?: boolean;
    attribution_required?: boolean;
    attribution_text?: string;
    notice_required?: boolean;
    share_alike?: boolean;
    redistribute_ok?: boolean;
  };
}

export function deriveProvenance(asset: ProvenanceAssetLike): ProvenanceFacts {
  const license = asset.license || {};
  const code = (license.code || "").trim();
  const source = (asset.source || "").trim();

  const serverOrigin = (asset.origin || "").trim().toLowerCase();
  const origin: AssetOrigin =
    serverOrigin === "first-party" || serverOrigin === "external"
      ? (serverOrigin as AssetOrigin)
      : FIRST_PARTY_SOURCES.has(source.toLowerCase()) || isFirstPartyCode(code)
        ? "first-party"
        : "external";

  // 自产恒为「禁止再分发」；其余素材没有明确说可以，就当作不可以。
  const serverRedistribute =
    typeof asset.redistribute_ok === "boolean"
      ? asset.redistribute_ok
      : typeof license.redistribute_ok === "boolean"
        ? license.redistribute_ok
        : undefined;
  const redistributeOk =
    origin === "first-party" ? false : serverRedistribute === true;

  const tier = (asset.supply_tier || "").trim().toLowerCase();
  const downloadable =
    tier === "byte-portable"
      ? true
      : tier === "link-only"
        ? false
        : asset.download_url
          ? true
          : undefined;

  // 自产素材的 source_url 指向内部 JSON（例 .../design-templates/doc/mc-logo-02.json），
  // 那不是出处，点开会下载到一个文件。自产分支改指法务页。
  const sourceUrl = origin === "first-party" ? "" : safeHttpUrl(asset.source_url || "");

  return {
    origin,
    redistributeOk,
    sourceUrl,
    sourceLabel: origin === "first-party" ? "OceanLeo" : sourceLabelOf(source),
    downloadable,
    licenseCode: code,
    licenseName: license.name || code,
    licenseUrl: safeHttpUrl(license.url || ""),
    commercialOk: license.commercial_ok !== false,
    modifyOk: license.modify_ok !== false,
    attributionRequired: license.attribution_required === true,
    attributionText: license.attribution_text || "",
    ...obligationsOf(code, license.notice_required, license.share_alike),
  };
}

export const FIRST_PARTY_TERMS_URL = "https://oceanleo.com/legal/first-party-assets";

function Divider() {
  return <div className="my-2.5 h-px bg-zinc-200" />;
}

/** 卡片角标：一眼分清自产与外部。 */
export function AssetOriginChip({ asset }: { asset: ProvenanceAssetLike }) {
  const tt = useUI();
  const origin = deriveProvenance(asset).origin;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
        origin === "first-party"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-zinc-200 bg-white/90 text-zinc-600"
      }`}
      title={
        origin === "first-party"
          ? tt("OceanLeo 自产：可免费下载、可商用，但禁止再分发")
          : tt("外部素材：请按其原始授权使用")
      }
    >
      {origin === "first-party" ? tt("自产") : tt("外部")}
    </span>
  );
}

export function AssetProvenance({
  asset,
  facts,
}: {
  asset?: ProvenanceAssetLike;
  facts?: ProvenanceFacts;
}) {
  const tt = useUI();
  const f = facts || (asset ? deriveProvenance(asset) : null);
  if (!f) return null;

  const isFirstParty = f.origin === "first-party";
  const hasNoObligation =
    f.noticeRequired === false && f.shareAlike === false && !f.attributionRequired;
  const unregistered = f.noticeRequired === undefined && f.shareAlike === undefined;

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3.5 py-3">
      {/* 第一段 · 这东西是谁的 */}
      {isFirstParty ? (
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {tt("OceanLeo 自产")}
            <span className="mx-1.5 font-normal text-zinc-400">·</span>
            <span className="font-medium text-zinc-700">{tt("免费下载")}</span>
            <span className="mx-1.5 font-normal text-zinc-400">·</span>
            <span className="font-medium text-zinc-700">{tt("可商用")}</span>
            <span className="mx-1.5 font-normal text-zinc-400">·</span>
            <span className="font-semibold text-rose-600">{tt("禁止再分发")}</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            {tt(
              "这件素材由 OceanLeo 自己制作。你可以免费下载、用在你的商业作品里，不必署名。但不可以把文件本身当作素材再转手、转售或打包分发给第三方。",
            )}
          </p>
          <a
            href={FIRST_PARTY_TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-xs text-sky-600 hover:underline"
          >
            {tt("完整条款")} ↗
          </a>
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {tt("外部素材")}
            {f.sourceLabel ? (
              <>
                <span className="mx-1.5 font-normal text-zinc-400">·</span>
                <span className="font-medium text-zinc-700">
                  {tt("来自 {source}", { source: f.sourceLabel })}
                </span>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            {tt("出处：")}
            {f.sourceUrl ? (
              <a
                href={f.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 hover:underline"
              >
                {readableHost(f.sourceUrl)} ↗
              </a>
            ) : (
              <span className="text-zinc-500">{tt("该来源未提供可跳转的原始页面")}</span>
            )}
          </p>
        </div>
      )}

      <Divider />

      {/* 第二段 · 我能不能拿走 */}
      <p className="text-xs text-zinc-700">
        {f.downloadable === true
          ? tt("可免费下载原文件。")
          : f.downloadable === false
            ? tt("不提供文件下载，只能到出处获取。")
            : tt("下载资格未标注，以下载时的提示为准。")}
        {!isFirstParty && !f.redistributeOk ? (
          <span className="text-zinc-500">
            {" "}
            {tt("下载后可自己使用，但不要把文件本身再转手分发给第三方。")}
          </span>
        ) : null}
      </p>

      {/* 第三段 · 用了要背什么义务。自产已在第一段说完，不重复。 */}
      {!isFirstParty && (
        <>
          <Divider />
          <div className="flex flex-col gap-1.5">
            {f.noticeRequired === true && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-800">
                <span className="font-semibold">
                  {tt("用在成品里必须附带许可证原文")}
                </span>
                {tt(
                  "：把这个授权的完整条文与版权声明一并放进你的作品（常见做法是附一个 NOTICE 或第三方声明文件）。只给一个链接不算。",
                )}
              </p>
            )}
            {unregistered && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-800">
                {tt(
                  "这件素材的授权我们没有登记完整条款，用前请自行核对原始许可证。",
                )}
              </p>
            )}
            {f.shareAlike === true && (
              <p className="text-xs leading-relaxed text-zinc-700">
                <span className="font-semibold">{tt("改过之后要用同一个授权发布")}</span>
                {tt("：基于它做出来的衍生作品必须沿用相同授权条款。")}
              </p>
            )}
            {f.attributionRequired && (
              <p className="text-xs text-zinc-700">
                {tt("需要署名（下方提供可一键复制的署名文本）。")}
              </p>
            )}
            {hasNoObligation && (
              <p className="text-xs text-zinc-600">
                {tt("可直接用于商业作品，无附加义务。")}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- 本地夹具 ---------------------------------------------------------------
// W1 的字段上线前用它自测三种形态；上线后仍可用于回归。三条都取自线上真实读数的形状。
export const PROVENANCE_FIXTURES: Record<string, ProvenanceAssetLike> = {
  // 线上实测行（2026-08-07）：自产设计模板，source_url 指向内部 JSON。
  firstParty: {
    source: "oceanleo-design-template",
    source_url: "https://asset.oceanleo.com/design-templates/doc/mc-logo-02.json",
    supply_tier: "byte-portable",
    license: {
      code: "OceanLeo-owned",
      name: "OceanLeo-owned",
      url: "",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: false,
      attribution_text: "",
    },
  },
  externalCc0: {
    source: "polyhaven",
    source_url: "https://polyhaven.com/a/rock_boulder_dry",
    supply_tier: "byte-portable",
    license: {
      code: "CC0",
      name: "Creative Commons Zero (Public Domain)",
      url: "https://creativecommons.org/publicdomain/zero/1.0/",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: false,
      attribution_text: "",
    },
  },
  externalApache: {
    source: "svgrepo",
    source_url: "https://www.svgrepo.com/svg/303108/apache-logo",
    supply_tier: "byte-portable",
    license: {
      code: "Apache-2.0",
      name: "Apache License 2.0",
      url: "https://www.apache.org/licenses/LICENSE-2.0",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: true,
      attribution_text: "\"apache-logo\" (Apache-2.0)",
    },
  },
};
