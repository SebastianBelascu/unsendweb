import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unsendnext lives inside the backend folder, which has its own lockfile.
  // Pin the Turbopack workspace root to this project to silence the
  // "inferred workspace root" warning and keep module resolution correct.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
