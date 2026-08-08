import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pinned because an unrelated lockfile higher up the tree confuses the
  // automatic workspace root detection.
  turbopack: {
    root: path.resolve("."),
  },
};

export default nextConfig;
