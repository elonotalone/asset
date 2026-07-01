import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@oceanleo/ui"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};


const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
export default withNextIntl(nextConfig);

