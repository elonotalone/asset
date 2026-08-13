import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 境内（asset.oceanleo.cn）镜像跑的是广州机上一个自包含的 `next start`，需要 standalone。
  // Vercel 不需要，而无条件写 `output` 会改变 .com 的构建方式，所以保持 opt-in：
  // 只有 CN 镜像构建会设这个开关。
  ...(process.env.OCEANLEO_BUILD_STANDALONE === "1"
    ? { output: "standalone" as const }
    : {}),
  transpilePackages: ["@oceanleo/ui"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};


const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
export default withNextIntl(nextConfig);

