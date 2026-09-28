import type { NextConfig } from "next";

export default {
  // The MCP SDK spawns child processes; keep it out of the bundle.
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
  // No "N" button over the canvas; compile and runtime errors still show.
  devIndicators: false,
} satisfies NextConfig;
