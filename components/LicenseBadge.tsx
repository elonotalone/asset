"use client";

import type { AssetLicense } from "@/lib/assets";

// Compact, color-coded license badge. Green = safest (CC0/platform license),
// amber = usable-but-with-conditions (attribution / share-alike / no-deriv),
// red = restricted (non-commercial). The library defaults to commercial-OK,
// so red only appears when the user switches the filter to "any".
export function LicenseBadge({ license, size = "sm" }: { license: AssetLicense; size?: "sm" | "md" }) {
  const tone = !license.commercial_ok
    ? "bg-rose-50 text-rose-700 border-rose-200"
    : license.attribution_required || !license.modify_ok
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${tone} ${pad}`}
      title={license.name}
    >
      {license.code}
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

export function LicenseFlags({ license }: { license: AssetLicense }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <LicenseFlag ok={license.commercial_ok} yes="可商用" no="仅非商用" />
      <LicenseFlag ok={license.modify_ok} yes="可修改" no="禁止改编" />
      <LicenseFlag ok={!license.attribution_required} yes="免署名" no="需署名" />
    </div>
  );
}
