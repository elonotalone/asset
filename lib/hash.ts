// 确定性 hash（字符串 → 稳定 32 位整数）。模板专区全链路（taxonomy / DNA /
// engine / 缩略图）共用，保证服务端每次渲染一致、同子类下变体彼此不同。
// FNV-1a。
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
