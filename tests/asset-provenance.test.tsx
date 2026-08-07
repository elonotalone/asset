import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@oceanleo/ui/i18n/provider.js";

import {
  AssetProvenance,
  AssetOriginChip,
  PROVENANCE_FIXTURES,
  deriveProvenance,
  safeHttpUrl,
} from "@/components/AssetProvenance";
import { LicenseBadge, LicenseFlags } from "@/components/LicenseBadge";
import type { AssetLicense } from "@/lib/assets";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <I18nProvider locale="zh" messages={{}}>
      {node}
    </I18nProvider>,
  );
}

const { firstParty, externalCc0, externalApache } = PROVENANCE_FIXTURES;

function licenseOf(fixture: typeof firstParty): AssetLicense {
  const l = fixture.license || {};
  return {
    code: l.code || "",
    name: l.name || "",
    url: l.url || "",
    commercial_ok: l.commercial_ok !== false,
    modify_ok: l.modify_ok !== false,
    attribution_required: l.attribution_required === true,
    attribution_text: l.attribution_text || "",
  };
}

// --- 产权二分 ---------------------------------------------------------------

test("自产素材按来源认出，不依赖 W1 的 origin 列", () => {
  assert.equal(deriveProvenance(firstParty).origin, "first-party");
  assert.equal(deriveProvenance(externalCc0).origin, "external");
  assert.equal(deriveProvenance(externalApache).origin, "external");
});

test("服务端 origin 一旦上线就优先于按来源的推导", () => {
  const overridden = { ...firstParty, origin: "external" };
  assert.equal(deriveProvenance(overridden).origin, "external");
});

test("自产素材恒为禁止再分发；外部素材没明说可以就当不可以", () => {
  assert.equal(deriveProvenance(firstParty).redistributeOk, false);
  assert.equal(deriveProvenance(externalCc0).redistributeOk, false);
  assert.equal(
    deriveProvenance({ ...externalCc0, redistribute_ok: true }).redistributeOk,
    true,
  );
  // 自产不因服务端说可以就放宽。
  assert.equal(
    deriveProvenance({ ...firstParty, redistribute_ok: true }).redistributeOk,
    false,
  );
});

test("Free-Commercial / OFL 的开源字体不许被说成 OceanLeo 自产", () => {
  // [实测] 货架上 73 件 source='opensource-font'，code 是 Free-Commercial 或 OFL。
  // Free-Commercial 在 L5 里的 license_family 就是 'first-party'（事实 B8），
  // 按 family 判产权会谎报所有权，并把 OFL 的随附原文义务整段吞掉。
  const ofl = {
    source: "opensource-font",
    source_url: "https://fonts.example/x",
    license: { code: "OFL", name: "SIL Open Font License 1.1", commercial_ok: true, modify_ok: true, attribution_required: true },
  };
  const freeCommercial = { ...ofl, license: { ...ofl.license, code: "Free-Commercial" } };
  assert.equal(deriveProvenance(ofl).origin, "external");
  assert.equal(deriveProvenance(freeCommercial).origin, "external");
  assert.match(render(<AssetProvenance asset={ofl} />), /必须附带许可证原文/);
  assert.ok(!render(<AssetProvenance asset={ofl} />).includes("OceanLeo 自产"));
});

// --- 一个 CC0 字样都不许留 ---------------------------------------------------

test("自产素材的产权块里没有 CC0 字样，且明说禁止再分发", () => {
  const html = render(<AssetProvenance asset={firstParty} />);
  assert.ok(!html.includes("CC0"), "自产素材不许出现 CC0 字样");
  assert.match(html, /OceanLeo 自产/);
  assert.match(html, /禁止再分发/);
  assert.match(html, /可商用/);
  assert.match(html, /legal\/first-party-assets/);
});

test("库里那 334 行挂着 license_code=CC0 的自产素材，角标也不显示 CC0", () => {
  // 事实 B2：oceanleo-design / oceanleo / oceanleo-chart 共 334 行 license_code='CC0'。
  const cc0FirstParty = {
    source: "oceanleo-design",
    source_url: "https://asset.oceanleo.com/x.json",
    license: {
      code: "CC0",
      name: "CC0",
      url: "",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: false,
      attribution_text: "",
    },
  };
  const badge = render(
    <LicenseBadge license={licenseOf(cc0FirstParty)} asset={cc0FirstParty} />,
  );
  assert.ok(!badge.includes("CC0"), "自产素材的授权角标不许显示 CC0");
  assert.match(badge, /免费商用/);

  const flags = render(
    <LicenseFlags license={licenseOf(cc0FirstParty)} asset={cc0FirstParty} />,
  );
  assert.ok(!flags.includes("CC0"));
  assert.match(flags, /禁止再分发/);

  const block = render(<AssetProvenance asset={cc0FirstParty} />);
  assert.ok(!block.includes("CC0"));
});

// --- Apache-2.0 与 CC0 不许长得一样 -----------------------------------------

test("Apache-2.0 明说必须附带许可证原文，CC0 不说", () => {
  const apache = render(<AssetProvenance asset={externalApache} />);
  const cc0 = render(<AssetProvenance asset={externalCc0} />);
  assert.match(apache, /必须附带许可证原文/);
  assert.ok(
    !cc0.includes("必须附带许可证原文"),
    "CC0 没有随附原文的义务，不许照抄 Apache 的话",
  );
  assert.match(cc0, /无附加义务/);
  assert.notEqual(apache, cc0, "两种授权渲染出来不许一模一样");
});

test("权限行里 Apache-2.0 与 CC0 也不一样", () => {
  const apache = render(<LicenseFlags license={licenseOf(externalApache)} />);
  const cc0 = render(<LicenseFlags license={licenseOf(externalCc0)} />);
  assert.match(apache, /必须附带许可证原文/);
  assert.ok(!cc0.includes("必须附带许可证原文"));
});

test("share-alike 的素材说明衍生作品要沿用同一授权", () => {
  const sa = {
    source: "openverse",
    source_url: "https://example.org/a",
    license: {
      code: "CC-BY-SA",
      name: "CC Attribution-ShareAlike",
      url: "https://creativecommons.org/licenses/by-sa/4.0/",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: true,
      attribution_text: "x",
    },
  };
  assert.match(render(<AssetProvenance asset={sa} />), /衍生作品必须沿用相同授权条款/);
});

// --- 拿不准就判严 -----------------------------------------------------------

test("未登记条款的 code 渲染成请自行核对，不渲染成无义务", () => {
  const unknown = {
    source: "somewhere",
    source_url: "https://example.org/a",
    license: {
      code: "SOME-NEW-LICENSE",
      name: "Some New License",
      url: "",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: false,
      attribution_text: "",
    },
  };
  const html = render(<AssetProvenance asset={unknown} />);
  assert.match(html, /请自行核对原始许可证/);
  assert.ok(!html.includes("无附加义务"));
});

test("UNKNOWN 与 arXiv 这类 family=unknown 的 code 也走最严那一支", () => {
  for (const code of ["UNKNOWN", "ARXIV-PERPETUAL-1.0", "WB-MICRODATA"]) {
    const f = deriveProvenance({ source: "x", license: { code } });
    assert.equal(f.noticeRequired, undefined, `${code} 不许被当成无 notice 义务`);
    assert.equal(f.shareAlike, undefined);
  }
});

test("下载资格是三态，缺字段时说未标注而不是能或不能", () => {
  assert.equal(deriveProvenance({ source: "x", supply_tier: "byte-portable" }).downloadable, true);
  assert.equal(deriveProvenance({ source: "x", supply_tier: "link-only" }).downloadable, false);
  assert.equal(deriveProvenance({ source: "x" }).downloadable, undefined);
  const html = render(<AssetProvenance asset={{ source: "svgrepo", source_url: "https://a.example/b", license: { code: "CC0" } }} />);
  assert.match(html, /下载资格未标注/);
});

// --- 出处 -------------------------------------------------------------------

test("外部素材渲染可点开的出处链接", () => {
  const html = render(<AssetProvenance asset={externalApache} />);
  assert.match(html, /href="https:\/\/www\.svgrepo\.com\/svg\/303108\/apache-logo"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /svgrepo\.com/);
});

test("自产素材不把内部 JSON 当出处渲染", () => {
  const html = render(<AssetProvenance asset={firstParty} />);
  assert.ok(
    !html.includes("design-templates/doc/mc-logo-02.json"),
    "自产素材的 source_url 指向内部 JSON，不是出处，不许渲染成可点链接",
  );
  assert.equal(deriveProvenance(firstParty).sourceUrl, "");
});

test("非 http(s) 的出处一律不渲染成链接", () => {
  assert.equal(safeHttpUrl("javascript:alert(1)"), "");
  assert.equal(safeHttpUrl("data:text/html,<script>"), "");
  assert.equal(safeHttpUrl("  not a url  "), "");
  assert.equal(safeHttpUrl("https://ok.example/a"), "https://ok.example/a");
  const html = render(
    <AssetProvenance
      asset={{ source: "svgrepo", source_url: "javascript:alert(1)", license: { code: "CC0" } }}
    />,
  );
  assert.ok(!html.includes("javascript:"));
  assert.match(html, /该来源未提供可跳转的原始页面/);
});

// --- 卡片角标 ---------------------------------------------------------------

test("卡片角标一眼分清自产与外部", () => {
  assert.match(render(<AssetOriginChip asset={firstParty} />), /自产/);
  assert.match(render(<AssetOriginChip asset={externalCc0} />), /外部/);
});
