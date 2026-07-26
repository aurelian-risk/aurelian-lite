import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Bundles everything (JS/CSS/assets) into exactly ONE index.html.
// That file runs by double-click over file:// — no server, no CDN, offline.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: "./",
  publicDir: false, // no static asset dir — everything is bundled into index.html
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000, // inline all assets
    chunkSizeWarningLimit: 5000,
  },
});
