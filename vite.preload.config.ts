import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/preload/index.ts"),
      formats: ["cjs"],
      fileName: () => "index"
    },
    outDir: path.resolve(__dirname, "dist/preload"),
    emptyOutDir: false,
    rollupOptions: {
      external: ["electron"]
    }
  }
});