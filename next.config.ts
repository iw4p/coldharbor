import type { NextConfig } from "next";

export default {
  // The MCP SDK spawns child processes; keep it out of the bundle.
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
} satisfies NextConfig;
