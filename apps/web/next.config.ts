import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@coldharbor/core"],
  // The MCP SDK spawns child processes; keep it out of the bundle.
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
};

export default nextConfig;
