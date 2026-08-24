import { notFound } from "next/navigation";

// 2026-08-24 裁定：平面设计成品入口与 684 份模板语料已下架。
// 旧书签 /design/<类型> 落到这里直接 404。
export default function RetiredDesignTypePage() {
  notFound();
}
