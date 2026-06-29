// 模板预览详情页（/templates/<slug>）拥有独立 layout 边界：它是一个全屏
// 自包含预览，绝不复用素材库外壳（左侧栏/搜索/筛选）。给它单独的 layout
// 让 App Router 在 /templates（素材库画廊）与 /templates/<slug>（全屏预览）
// 之间软导航时，两个 segment 互为干净边界、不会出现一个页面套住另一个页面
// 的嵌套渲染。
export default function TemplateDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
