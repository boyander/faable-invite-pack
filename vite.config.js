import { defineConfig } from "vite";

export default defineConfig({
  // three.js (~670 kB) goes in its own chunk, loaded while the cover is on screen
  build: { chunkSizeWarningLimit: 800 },
});
