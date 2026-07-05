// 模板配图池：把每个子类映射到一组【自托管在 OSS 的行业图片】（Pixabay/Pexels
// 可商用授权，来自 platform_assets 图库）。模板引擎渲染时按 (subKey, seed) 确定性
// 从池里取一张，替代旧的 loremflickr/picsum 第三方随机图——后者大陆慢、常空白、
// 与行业无关。图片走我们自己的 CDN，秒开且稳定。
//
// 池数据（lib/template-photo-pool.json）由
// oceandino: lucy-service/scripts/asset_ingest/build_template_photo_pool.py
// 从 OSS 图库离线生成（subKey→图库类目映射也在那）。图库更新后重跑该脚本即可。

import poolData from "./template-photo-pool.json";
import { hashStr } from "./hash";

interface PoolData {
  pool: Record<string, string[]>;
  fallback: string[];
}

const DATA = poolData as PoolData;

/**
 * 按 (subKey, seed) 确定性取一张配图 URL。
 * - 命中子类池：在该子类的图片列表里按 seed 取模选一张（同 slug 同槽位恒定）。
 * - 子类池空/缺失：回退到全局 fallback 池（广谱行业图，永不空白）。
 * - 极端兜底（两池皆空，理论不会）：返回空串，<img> onerror 会隐藏它。
 */
export function poolPhoto(subKey: string, seed: number): string {
  const list = DATA.pool[subKey];
  if (list && list.length) {
    return list[seed % list.length];
  }
  const fb = DATA.fallback;
  if (fb && fb.length) {
    return fb[seed % fb.length];
  }
  return "";
}

/** 全局 fallback 池的确定性取图（缩略图合成回退等场景用）。 */
export function poolFallbackPhoto(seed: number): string {
  const fb = DATA.fallback;
  if (fb && fb.length) return fb[seed % fb.length];
  return "";
}

/** 供缩略图组件按 slug 稳定取一张（合成回退版式用）。 */
export function poolPhotoForSlug(subKey: string, slug: string): string {
  return poolPhoto(subKey, hashStr(slug));
}
