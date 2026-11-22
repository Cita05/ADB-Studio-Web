import { defineConfig } from "vite";

// Everything the browser extension needs at runtime is emitted into ONE
// folder at the repository root: `extension/`. That folder is exactly what
// you select in chrome://extensions → "Load unpacked" — no `dist` inside
// `web/`, no extra copy step.
export default defineConfig({
  base: "./",
  build: {
    outDir: "../extension",
    emptyOutDir: true,
    target: "chrome118",
    rollupOptions: {
      input: {
        index: "index.html",
        background: "src/background.js",
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
