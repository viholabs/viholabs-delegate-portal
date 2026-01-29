import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Importantísimo: evita que Webpack bundle-e pdf-parse en el server.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
