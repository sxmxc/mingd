import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  transpilePackages: ["@mingd/build-config", "@mingd/worker-protocol"],

  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
