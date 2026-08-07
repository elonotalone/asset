"use client";

import type { AssetLicense } from "@/lib/assets";
import {
  deriveProvenance,
  type ProvenanceAssetLike,
} from "@/components/AssetProvenance";

// 产权与授权的两个小件：角标（LicenseBadge）与权限行（LicenseFlags）。
//
// 两条产品要求落在这里：
// ① 自产素材**一个 CC0 字样都不许留**。库里有 334 行自产素材今天挂着 license_code='CC0'
//    （事实 B2），照着 code 原样渲染就会把「放弃权利」写在我们自己的资产上。传了 asset
//    就能按来源认出自产，角标改显「免费商用」。
// ② Apache-2.0 与 CC0 不许长得一样。它俩的差别不在 commercial/modify/署名这三位上
//    （DB 里常常一模一样），而在 notice_required：Apache 的许可证原文必须随每份拷贝
//    走。这一位今天线上 API 不返回，由 AssetProvenance 的只读镜像表按 code 推出。

// 把素材传进来才能认出自产（license.code 对那 334 行是 'CC0'，光看 code 认不出）。
function readFacts(license: AssetLicense, asset?: ProvenanceAssetLike) {
  return deriveProvenance({
    ...(asset || {}),
    license: { ...license, ...(asset?.license || {}) },
  });
}

export function LicenseBadge({
  license,
  size = "sm",
  asset,
}: {
  license: AssetLicense;
  size?: "sm" | "md";
  /** 给了就能认出自产并按产权而非 code 渲染；不给则退回按 code 渲染。 */
  asset?: ProvenanceAssetLike;
}) {
  const f = readFacts(license, asset);
  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]";

  if (f.origin === "first-party") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 font-medium text-emerald-700 ${pad}`}
        title="OceanLeo 自产：可免费下载、可商用、不必署名，但禁止再分发"
      >
        免费商用
      </span>
    );
  }

  // 未登记完整条款的（含 UNKNOWN / arXiv / 世行微数据）与需随附许可证原文的，都不能和
  // CC0 一样显示成一片绿。
  const unregistered = f.noticeRequired === undefined && f.shareAlike === undefined;
  const tone = !f.commercialOk
    ? "bg-rose-50 text-rose-700 border-rose-200"
    : unregistered ||
        f.noticeRequired === true ||
        f.shareAlike === true ||
        f.attributionRequired ||
        !f.modifyOk
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";

  const title = !f.commercialOk
    ? `${f.licenseName}：不可用于商业用途`
    : f.noticeRequired === true
      ? `${f.licenseName}：可商用，但成品里必须附带许可证原文与版权声明`
      : unregistered
        ? `${f.licenseName}：条款未登记完整，用前请自行核对`
        : f.licenseName;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${tone} ${pad}`}
      title={title}
    >
      {f.licenseCode || "未标注"}
      {f.noticeRequired === true && <span aria-hidden>©</span>}
    </span>
  );
}

function LicenseFlag({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? "text-emerald-600" : "text-rose-500"}`}>
      <span aria-hidden>{ok ? "✓" : "✕"}</span>
      {ok ? yes : no}
    </span>
  );
}

export function LicenseFlags({
  license,
  asset,
}: {
  license: AssetLicense;
  /** 传了才能认出自产；AssetDetail 挂上 <AssetProvenance/> 后可一并传。 */
  asset?: ProvenanceAssetLike;
}) {
  const f = readFacts(license, asset);

  if (f.origin === "first-party") {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <LicenseFlag ok yes="可商用" no="仅非商用" />
          <LicenseFlag ok yes="可修改" no="禁止改编" />
          <LicenseFlag ok yes="免署名" no="需署名" />
          <LicenseFlag ok={false} yes="可再分发" no="禁止再分发" />
        </div>
        <p className="text-zinc-500">OceanLeo 自产，可免费下载并用于商业作品，但不要把文件本身转手分发给第三方。</p>
      </div>
    );
  }

  const unregistered = f.noticeRequired === undefined && f.shareAlike === undefined;

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <LicenseFlag ok={f.commercialOk} yes="可商用" no="仅非商用" />
        <LicenseFlag ok={f.modifyOk} yes="可修改" no="禁止改编" />
        <LicenseFlag ok={!f.attributionRequired} yes="免署名" no="需署名" />
      </div>
      {f.noticeRequired === true && (
        <p className="text-amber-700">
          <span className="font-medium">用在成品里必须附带许可证原文</span>
          ：把完整授权条文与版权声明一并放进你的作品，只给一个链接不算。
        </p>
      )}
      {unregistered && (
        <p className="text-amber-700">这件素材的授权我们没有登记完整条款，用前请自行核对原始许可证。</p>
      )}
      {f.shareAlike === true && (
        <p className="text-zinc-600">
          <span className="font-medium">衍生作品必须沿用同一授权</span>：基于它改出来的东西要用相同条款发布。
        </p>
      )}
    </div>
  );
}
