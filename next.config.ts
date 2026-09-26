import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    output: "standalone",
    distDir: process.env.GUTTER_VISUAL_TEST === "1" ? ".next-visual" : phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}

