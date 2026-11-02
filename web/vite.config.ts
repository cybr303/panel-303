import { defineConfig } from "vite";

// Served from https://cybr303.github.io/panel-303/
export default defineConfig({
  base: "/panel-303/",
  build: { outDir: "dist", target: "es2022" },
});
