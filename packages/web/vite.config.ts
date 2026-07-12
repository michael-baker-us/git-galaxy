import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths work both under the CLI's static server and on GitHub Pages.
  base: "./",
  server: {
    proxy: {
      "/api": "http://localhost:4242",
    },
  },
});
