import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The studio's content security policy, added to built pages only: the dev server injects
 * inline scripts and a websocket that it would block. Scripts, workers and data come from the
 * studio itself; the only frame allowed is the script sandbox (its own origin when
 * VITE_SANDBOX_URL points elsewhere). The sandbox page sets its own, stricter policy.
 */
function contentSecurityPolicy(sandboxUrl: string | undefined): Plugin {
  const sandboxOrigin = sandboxUrl ? new URL(sandboxUrl).origin : null;
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // The code editor injects its own style rules.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "worker-src 'self'",
    `frame-src 'self'${sandboxOrigin ? ` ${sandboxOrigin}` : ""}`,
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return {
    name: "gridloom-csp",
    apply: "build",
    transformIndexHtml: (html) => html.replace(/(<meta charset="UTF-8" \/>)/i, `$1\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig(({ mode }) => ({
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
    contentSecurityPolicy(loadEnv(mode, process.cwd(), "VITE_")["VITE_SANDBOX_URL"]),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Gridloom",
        short_name: "Gridloom",
        description: "Open-source studio for grid and tile generative art.",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        start_url: ".",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
        // The determinism check page and the script sandbox must load themselves, never the studio shell.
        navigateFallbackDenylist: [/check\.html$/, /sandbox\.html$/, /preview\.html$/],
      },
    }),
  ],
}));
