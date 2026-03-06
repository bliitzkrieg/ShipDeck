import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src/renderer"),
  // Use relative base so asset paths work with Electron's file:// protocol.
  // Without this, Vite defaults to "/" which produces absolute paths like
  // "/assets/index.js" — these fail when loaded via loadFile() in production
  // because file:// treats them as filesystem-root paths.
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});