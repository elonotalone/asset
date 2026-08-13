// AI 拼版成品模板 —— asset.oceanleo.com/design 的数据源。
// 模板由 design 站的 AI 自动拼版工作流批量生成（路线 D：模板槽位填充 + 美术
// 指导 + 约束兜底），渲染成自包含预览图，清单落在 public/design-templates/manifest.json。
// 设计文档：docs/architecture/oceanleo-design-ai-layout.md（oceandino repo）。

export interface DesignTemplate {
  id: string;
  title: string;
  industry: string;
  channel: string;
  material: string;
  width: number;
  height: number;
  preview: string; // 预览图 URL（public 下）
  doc: string; // 可编辑 DesignDocument JSON URL（"拿去编辑"用）
  attributions: string[];
}

import {
  currentDomainProfile,
  currentFamilySubsiteOrigin,
} from "@oceanleo/ui/contracts";

import manifest from "@/public/design-templates/manifest.json";

export const DESIGN_TEMPLATES: DesignTemplate[] = manifest as DesignTemplate[];

/**
 * design 站的编辑器深链：把成品模板载入画布继续编辑。
 *
 * 编辑器与文档都取当前域名家族的那一份：境内页面必须落在境内 design 站、
 * 拉境内素材站的文档，否则用户点「拿去编辑」就被送出境，而且那边的登录态还不通。
 * 当前家族没有 design 站时返回 ""（不猜一个境外 origin 出来）。
 */
export function editUrl(t: DesignTemplate): string {
  // design 站读取 ?tplDoc=<绝对URL> 载入自包含文档（见 design 站 editor 载入逻辑）。
  const designOrigin = currentFamilySubsiteOrigin("design");
  if (!designOrigin) return "";
  const docUrl = `${currentDomainProfile().assetOrigin}${t.doc}`;
  return `${designOrigin}/editor?tplDoc=${encodeURIComponent(docUrl)}`;
}

export function filterTemplates(
  list: DesignTemplate[],
  sel: { channel?: string; material?: string; industry?: string; q?: string },
): DesignTemplate[] {
  const all = "全部";
  return list.filter((t) => {
    if (sel.channel && sel.channel !== all && t.channel !== sel.channel) return false;
    if (sel.material && sel.material !== all && t.material !== sel.material) return false;
    if (sel.industry && sel.industry !== all && t.industry !== sel.industry) return false;
    if (sel.q) {
      const q = sel.q.trim().toLowerCase();
      if (q && !`${t.title} ${t.industry} ${t.channel} ${t.material}`.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });
}
