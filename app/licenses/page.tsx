import { SiteShell } from "@/components/SiteShell";

export const metadata = {
  title: "授权说明 | LeoAsset",
};

const SOURCES = [
  { name: "Openverse", types: "图片 / 矢量", license: "CC0 / CC-BY 系列", note: "WordPress 基金会聚合，自带授权字段" },
  { name: "Pexels", types: "图片 / 视频", license: "Pexels License", note: "可免费商用，无需署名" },
  { name: "Pixabay", types: "图片 / 视频", license: "Pixabay Content License", note: "可免费商用，无需署名" },
  { name: "Poly Haven", types: "3D / HDRI / 贴图", license: "CC0", note: "完全公共领域，最自由" },
  { name: "Freesound", types: "音效", license: "CC0 / CC-BY 系列", note: "逐条标注授权，需看具体许可" },
  { name: "Jamendo", types: "音乐", license: "CC 系列（含 NC/ND）", note: "默认已过滤掉禁止商用的曲目" },
  { name: "OfficePLUS / 开源模板库", types: "PPT 模板", license: "CC-BY 系列", note: "聚合开源 PPT 模板，使用时按 CC-BY 署名" },
];

const CODES = [
  { code: "CC0 / 平台许可", commercial: true, modify: true, attr: false, tone: "emerald" },
  { code: "CC-BY", commercial: true, modify: true, attr: true, tone: "amber" },
  { code: "CC-BY-SA", commercial: true, modify: true, attr: true, tone: "amber" },
  { code: "CC-BY-ND", commercial: true, modify: false, attr: true, tone: "amber" },
  { code: "CC-BY-NC", commercial: false, modify: true, attr: true, tone: "rose" },
  { code: "CC-BY-NC-ND", commercial: false, modify: false, attr: true, tone: "rose" },
];

function Cell({ ok }: { ok: boolean }) {
  return <span className={ok ? "text-emerald-600" : "text-rose-500"}>{ok ? "✓" : "✕"}</span>;
}

export default function LicensesPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-semibold text-zinc-900">授权说明</h1>
        <p className="mt-2 text-sm text-zinc-500">
          素材库聚合多个开源素材源，每个素材都标注了具体授权。库内默认只展示
          <span className="font-medium text-zinc-700">「可商用」</span>素材；切换过滤可进一步只看「可改编」或查看全部（含仅非商用）。
        </p>

        <h2 className="mt-8 text-lg font-semibold text-zinc-800">素材来源</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2">来源</th>
                <th className="px-4 py-2">类型</th>
                <th className="px-4 py-2">主要授权</th>
                <th className="px-4 py-2">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {SOURCES.map((s) => (
                <tr key={s.name}>
                  <td className="px-4 py-2 font-medium text-zinc-800">{s.name}</td>
                  <td className="px-4 py-2 text-zinc-600">{s.types}</td>
                  <td className="px-4 py-2 text-zinc-600">{s.license}</td>
                  <td className="px-4 py-2 text-zinc-500">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-lg font-semibold text-zinc-800">授权类型对照</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2">授权</th>
                <th className="px-4 py-2 text-center">可商用</th>
                <th className="px-4 py-2 text-center">可改编</th>
                <th className="px-4 py-2 text-center">需署名</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {CODES.map((c) => (
                <tr key={c.code}>
                  <td className="px-4 py-2 font-medium text-zinc-800">{c.code}</td>
                  <td className="px-4 py-2 text-center"><Cell ok={c.commercial} /></td>
                  <td className="px-4 py-2 text-center"><Cell ok={c.modify} /></td>
                  <td className="px-4 py-2 text-center"><Cell ok={!c.attr} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-xs text-zinc-400">
          需署名的素材（CC-BY 系列）在详情页提供一键复制的署名文本，请在最终作品中保留。
          本库仅做聚合与授权归一化展示，最终合规责任随各素材原始授权条款。
        </p>
      </div>
    </SiteShell>
  );
}
