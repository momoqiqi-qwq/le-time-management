import { defineConfig } from "vite";
import { cppuDevBridge } from "./dev/cppu-bridge.js";

export default defineConfig({
  clearScreen: false,
  plugins: [cppuDevBridge()],
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
    outDir: "dist",
  },
});
