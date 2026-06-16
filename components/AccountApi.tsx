// 单一事实源已迁移到 @oceanleo/ui。本地 re-export 兼容站内既有 import
// （站内 api/page.tsx 用 <AccountApi/>）。新代码请用 "@oceanleo/ui/pages" 的 ApiPage。
export { ApiPage as AccountApi } from "@oceanleo/ui/pages";
