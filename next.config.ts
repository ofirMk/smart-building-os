import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** גישה ל-dev מרשת מקומית (HMR / webpack-hmr) — רשימת host מותרים */
  allowedDevOrigins: ["10.0.0.26", "localhost", "127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
