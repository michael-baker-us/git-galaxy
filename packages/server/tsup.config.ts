import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  // Shared exports raw .ts source (internal-package pattern), so it must be
  // bundled in; runtime deps like express stay external.
  noExternal: ["@git-galaxy/shared"],
});
