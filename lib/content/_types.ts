// 共享类型 + 图标库，供各行业 content fragment 使用。
import type { SiteContent } from "../template-content";

export type SubContent = Partial<SiteContent>;
export type ContentMap = Partial<Record<string, SubContent>>;

// 常用 svg path（feature 图标用）。撰写 features 时从这里挑。
export const I = {
  star: "M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 9.5l6.9-.6z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  bolt: "M13 2L3 14h7l-1 8 10-12h-7z",
  heart: "M12 21s-7-4.5-9.5-9A5 5 0 0112 5a5 5 0 019.5 7c-2.5 4.5-9.5 9-9.5 9z",
  globe: "M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20",
  cog: "M12 8a4 4 0 100 8 4 4 0 000-8zM3 12h3M18 12h3M12 3v3M12 18v3",
  users: "M16 14a4 4 0 10-8 0M12 7a3 3 0 100 6 3 3 0 000-6zM2 20c0-3 4-5 10-5s10 2 10 5",
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  check: "M20 6L9 17l-5-5",
  truck: "M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 18a2 2 0 100-4 2 2 0 000 4zM18 18a2 2 0 100-4 2 2 0 000 4z",
  leaf: "M11 3C6 5 4 10 4 14c0 3 2 5 5 5 6 0 11-7 11-16-4 0-6 0-9 0z",
  cart: "M3 3h2l2 12h11l2-8H6M9 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z",
  phone: "M5 4h4l2 5-3 2a14 14 0 006 6l2-3 5 2v4a2 2 0 01-2 2A18 18 0 013 6a2 2 0 012-2z",
  clock: "M12 7v5l3 2M12 22a10 10 0 100-20 10 10 0 000 20z",
  award: "M12 15a6 6 0 100-12 6 6 0 000 12zM8 14l-2 7 6-3 6 3-2-7",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2",
} as const;
