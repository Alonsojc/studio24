import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? "/studio24" : "",
  assetPrefix: isProd ? "/studio24/" : "",
  productionBrowserSourceMaps: process.env.SENTRY_UPLOAD_SOURCEMAPS === "1",
  turbopack: {
    root: process.cwd(),
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
