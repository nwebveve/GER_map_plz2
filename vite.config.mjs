import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: `${rootDir}index.html`,
        map: `${rootDir}map.html`
      }
    }
  }
});
