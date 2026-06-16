import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@oceanleo/ui"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
