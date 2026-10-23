import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O app é 100% dinâmico (dados do banco a cada request); o modelo clássico de
  // renderização é suficiente para o MVP e evita a complexidade de Cache Components.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["postgres", "exceljs"],
};

export default nextConfig;
