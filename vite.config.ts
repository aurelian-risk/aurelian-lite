import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import pkg from "./package.json";

// Bundles everything (JS/CSS/assets) into exactly ONE index.html.
// That file runs by double-click over file:// — no server, no CDN, offline.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  // The version and licence the running build reports. Read from package.json so the
  // single file cannot claim a version the repository does not have.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_LICENSE__: JSON.stringify(pkg.license),
  },
  base: "./",
  // No static asset dir. (Also stops Vite from treating the sibling `public/`
  // open-source subrepo as its publicDir and copying it into dist/.)
  publicDir: false,
  // Inference runs in an inlined ES-module Web Worker (so it can dynamic-import
  // the CDN model libs and stream results without freezing the UI thread).
  worker: { format: "es" },
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000, // inline all assets
    chunkSizeWarningLimit: 5000,
  },
});
