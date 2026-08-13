"use client";

import { currentDomainProfile } from "@oceanleo/ui/contracts";
import { useUI } from "@oceanleo/ui/i18n";

// 授权说明页。
//
// 改前这里是七行写死的常量（Openverse / Pexels / Pixabay / Poly Haven / Freesound /
// Jamendo / OfficePLUS），与货架上真实有什么毫无关系：那七个里只有 Poly Haven 与
// Freesound 真在货架上，另外五个一件都没有；而占货架 94% 的 svgrepo 压根没被提到。
//
// 下面这张表是**从货架真实来源生成的**。货架的定义就是后端 library_search 的过滤条件
// （supa.py:718-730）：status='approved' 且 usage_scope='standalone' 且
// supply_tier<>'link-only' 且 credit_bundle<>'{}' 且 license_family<>'unknown'。
//
// 复算命令（改动货架后照此重跑并更新 SHELF_SOURCES 与 SHELF_GENERATED_AT）：
//
//   ~/.cursor/bin/supabase-sql oceanleo "select source, count(*) as n,
//     string_agg(distinct license_code, ',' order by license_code) as codes,
//     string_agg(distinct type, ',' order by type) as types
//     from platform_assets
//     where status='approved' and usage_scope='standalone'
//       and supply_tier <> 'link-only' and credit_bundle <> '{}'
//       and license_family <> 'unknown'
//     group by source order by n desc"
//
// 之所以是快照而不是实时：后端今天没有「按来源聚合」的接口，
// /v1/assets/* 只有逐条搜索（assets_router.py 全部路由已逐个看过）。加接口落在 W1 的
// 独占面上，已写进 signals/W2-request.md。快照的生成日期对用户明示，不假装是实时的。

const SHELF_GENERATED_AT = "2026-08-07";

type Origin = "first-party" | "external";

interface ShelfSource {
  /** 库里的 source 键 */
  key: string;
  /** 展示名 */
  name: string;
  origin: Origin;
  count: number;
  types: string;
  /** 外部来源：实际出现过的授权 code。自产来源不填（自产不按 code 讲）。 */
  codes?: string;
  /** 用户真正要背的义务，一句话。 */
  duty: string;
}

const SHELF_SOURCES: ShelfSource[] = [
  { key: "svgrepo", name: "SVG Repo", origin: "external", count: 46303, types: "矢量图",
    codes: "CC0 / PDM / MIT", duty: "多数无附加义务；标 MIT 的那部分用在成品里必须附带许可证原文" },
  { key: "openmoji", name: "OpenMoji", origin: "external", count: 1644, types: "贴纸",
    codes: "CC-BY-SA", duty: "需署名，且衍生作品必须沿用同一授权" },
  { key: "oceanleo-design", name: "OceanLeo 自制 PPT 模板", origin: "first-party", count: 243, types: "PPT 模板",
    duty: "免费下载 · 可商用 · 禁止再分发" },
  { key: "polyhaven", name: "Poly Haven", origin: "external", count: 220, types: "3D 模型",
    codes: "CC0", duty: "无附加义务" },
  { key: "tabler", name: "Tabler Icons", origin: "external", count: 182, types: "矢量图",
    codes: "MIT", duty: "用在成品里必须附带许可证原文" },
  { key: "freesound", name: "Freesound", origin: "external", count: 138, types: "音频",
    codes: "CC0 / CC-BY", duty: "标 CC-BY 的需署名，标 CC0 的无附加义务" },
  { key: "fine-t2i", name: "fine-t2i 开源文生图数据集", origin: "external", count: 120, types: "Prompt 示例",
    codes: "Apache-2.0", duty: "用在成品里必须附带许可证原文与版权声明" },
  { key: "oceanleo-aigen", name: "OceanLeo AI 生成", origin: "first-party", count: 94, types: "图片",
    duty: "免费下载 · 可商用 · 禁止再分发" },
  { key: "opensource-font", name: "开源字体", origin: "external", count: 73, types: "字体",
    codes: "OFL / Free-Commercial", duty: "标 OFL 的随字体附带许可证原文，且字体本身不得单独售卖" },
  { key: "oceanleo", name: "OceanLeo 自制图片", origin: "first-party", count: 47, types: "图片",
    duty: "免费下载 · 可商用 · 禁止再分发" },
  { key: "oceanleo-chart", name: "OceanLeo 自制图表", origin: "first-party", count: 44, types: "图表",
    duty: "免费下载 · 可商用 · 禁止再分发" },
  { key: "oceanleo-curated", name: "OceanLeo 精选成品", origin: "first-party", count: 29, types: "文档 / PDF / 表格 / 网站",
    duty: "免费下载 · 可商用 · 禁止再分发" },
  { key: "oceanleo-design-template", name: "LeoDesign 可编辑模板", origin: "first-party", count: 29, types: "图片",
    duty: "免费下载 · 可商用 · 禁止再分发" },
  { key: "worldbank", name: "世界银行公开数据", origin: "external", count: 18, types: "图表",
    codes: "CC-BY", duty: "需署名" },
  { key: "met-museum", name: "大都会艺术博物馆", origin: "external", count: 3, types: "图片",
    codes: "CC0", duty: "无附加义务" },
  { key: "lucide", name: "Lucide", origin: "external", count: 2, types: "矢量图",
    codes: "ISC", duty: "用在成品里必须附带许可证原文" },
];

const FIRST_PARTY_COUNT = SHELF_SOURCES.filter((s) => s.origin === "first-party")
  .reduce((sum, s) => sum + s.count, 0);
const EXTERNAL_COUNT = SHELF_SOURCES.filter((s) => s.origin === "external")
  .reduce((sum, s) => sum + s.count, 0);

// 授权义务对照。**Apache-2.0 与 CC0 必须落在不同的行里**——它俩今天在界面上长得一样，
// 而差别很大：CC0 是放弃权利，拿走就是你的；Apache-2.0 是给你许可，每一份拷贝都得带着
// 许可证原文和版权声明。
interface DutyRow {
  codes: string;
  what: string;
  duty: string;
  tone: "emerald" | "amber" | "rose";
}

const DUTY_ROWS: DutyRow[] = [
  {
    codes: "OceanLeo 自产",
    what: "我们自己做的",
    duty: "免费下载、可商用、不必署名。唯一的限制是不要把文件本身转手、转售或打包分发给第三方。",
    tone: "emerald",
  },
  {
    codes: "CC0 / PDM",
    what: "作者放弃了权利",
    duty: "拿走就当自己的用，无任何附加义务。",
    tone: "emerald",
  },
  {
    codes: "MIT / ISC / Apache-2.0 / OFL / CDLA-Permissive-2.0",
    what: "作者授予你许可，但有条件",
    duty: "可商用、可改，但**用在成品里必须附带许可证原文与版权声明**（常见做法是附一个 NOTICE 或第三方声明文件）。只在网页上放一个链接不算履行义务。",
    tone: "amber",
  },
  {
    codes: "CC-BY / NASA-OPEN",
    what: "要写出作者是谁",
    duty: "可商用、可改，但要在作品里署名。详情页提供可一键复制的署名文本。",
    tone: "amber",
  },
  {
    codes: "CC-BY-SA / ODbL-1.0",
    what: "改了要用同样的规矩放出去",
    duty: "可商用、可改、需署名，并且**基于它做出来的衍生作品必须沿用同一授权**。做闭源商业产品前请先确认这一条能接受。",
    tone: "amber",
  },
  {
    codes: "CC-BY-NC 系列",
    what: "禁止商用",
    duty: "只能用于非商业用途。货架默认不展示这类素材，只有把过滤切到「全部」才会出现。",
    tone: "rose",
  },
];

const TONE_CLASS: Record<DutyRow["tone"], string> = {
  emerald: "border-emerald-200 bg-emerald-50",
  amber: "border-amber-200 bg-amber-50",
  rose: "border-rose-200 bg-rose-50",
};

// duty 文案里用 **…** 标出必须加粗的关键句，避免为一句话引入 markdown 依赖。
function Emphasized({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((chunk, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold">
            {chunk}
          </strong>
        ) : (
          <span key={i}>{chunk}</span>
        ),
      )}
    </>
  );
}

export function LicensesView() {
  const tt = useUI();
  const total = FIRST_PARTY_COUNT + EXTERNAL_COUNT;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900">{tt("产权与授权说明")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        {tt(
          "素材库里的每一件东西，要么是 OceanLeo 自己做的，要么是从外部开源平台收进来的。这两种的规矩不一样，下面分开讲清楚。",
        )}
      </p>

      {/* 产权二分：这是用户最先要知道的事 */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
          <p className="text-sm font-semibold text-sky-900">
            {tt("OceanLeo 自产")}
            <span className="ml-2 font-normal text-sky-700">
              {tt("{n} 件", { n: FIRST_PARTY_COUNT })}
            </span>
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-700">
            {tt(
              "免费下载 · 可商用 · 不必署名。唯一的限制是：不要把文件本身当素材再转手、转售或打包分发给第三方。",
            )}
          </p>
          <a
            href={`${currentDomainProfile().portalOrigin}/legal/first-party-assets`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs text-sky-700 hover:underline"
          >
            {tt("完整条款")} ↗
          </a>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-900">
            {tt("外部素材")}
            <span className="ml-2 font-normal text-zinc-600">
              {tt("{n} 件", { n: EXTERNAL_COUNT })}
            </span>
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-700">
            {tt(
              "来自公开的开源素材平台，每一件都在详情页标出了它的原始出处（可点开）与授权。义务随原始授权走，见下方对照。",
            )}
          </p>
        </div>
      </div>

      {/* 义务对照：Apache-2.0 与 CC0 在这里被明确分开 */}
      <h2 className="mt-8 text-lg font-semibold text-zinc-800">{tt("用了之后你要做什么")}</h2>
      <p className="mt-1 text-xs text-zinc-500">
        {tt("同样是「可以免费商用」，义务差别很大。下面按义务分组，不是按授权名字分组。")}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {DUTY_ROWS.map((row) => (
          <div key={row.codes} className={`rounded-xl border px-4 py-3 ${TONE_CLASS[row.tone]}`}>
            <p className="text-sm font-semibold text-zinc-900">
              {tt(row.codes)}
              <span className="ml-2 text-xs font-normal text-zinc-600">{tt(row.what)}</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-700">
              <Emphasized text={tt(row.duty)} />
            </p>
          </div>
        ))}
      </div>

      {/* 货架真实来源 */}
      <h2 className="mt-8 text-lg font-semibold text-zinc-800">{tt("货架上的素材来自哪里")}</h2>
      <p className="mt-1 text-xs text-zinc-500">
        {tt(
          "下面是当前货架上真实存在的全部来源，共 {sources} 个来源、{total} 件。数据截至 {date}。",
          { sources: SHELF_SOURCES.length, total, date: SHELF_GENERATED_AT },
        )}
      </p>
      <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">{tt("来源")}</th>
              <th className="px-4 py-2">{tt("类型")}</th>
              <th className="px-4 py-2 text-right">{tt("件数")}</th>
              <th className="px-4 py-2">{tt("你要做什么")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {SHELF_SOURCES.map((s) => (
              <tr key={s.key} className={s.origin === "first-party" ? "bg-sky-50/40" : undefined}>
                <td className="px-4 py-2">
                  <span className="font-medium text-zinc-800">{tt(s.name)}</span>
                  <span
                    className={`ml-2 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                      s.origin === "first-party"
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-zinc-200 bg-white text-zinc-500"
                    }`}
                  >
                    {s.origin === "first-party" ? tt("自产") : tt("外部")}
                  </span>
                  {s.codes ? (
                    <span className="mt-0.5 block text-[11px] text-zinc-400">{s.codes}</span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-zinc-600">{tt(s.types)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-600">{s.count}</td>
                <td className="px-4 py-2 text-xs text-zinc-600">{tt(s.duty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-zinc-400">
        {tt(
          "需署名的素材在详情页提供一键复制的署名文本，请在最终作品中保留。本页按素材落库时记录的授权归一化整理；若某件素材的原始授权与此处不一致，以其出处页面上的原始条款为准。",
        )}
      </p>
    </div>
  );
}
