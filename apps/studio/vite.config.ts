import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative base so the static build works on any GitHub/Cloudflare Pages path.
  base: "./",
  worker: { format: "es" },
  build: {
    rollupOptions: {
      // check.html: cross-browser determinism page used by the Playwright test.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        check: fileURLToPath(new URL("./check.html", import.meta.url)),
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Gridloom",
        short_name: "Gridloom",
        description: "Open-source studio for grid and tile generative art.",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        start_url: ".",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
        // The determinism check page must load itself, never the studio shell.
        navigateFallbackDenylist: [/check\.html$/],
      },
    }),
  ],
});
