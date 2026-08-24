import { notFound } from "next/navigation";

// 2026-08-24 裁定：DesignZone 与 684 份模板语料已下架。
// 旧书签 /design/<类型> 落到这里直接 404，不再加载语料或组件。
export default function RetiredDesignTypePage() {
  notFound();
}
