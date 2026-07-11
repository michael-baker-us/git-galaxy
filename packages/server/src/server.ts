import { existsSync } from "node:fs";
import type { UniverseSnapshot } from "@git-galaxy/shared";
import express from "express";

export function createApp(universe: UniverseSnapshot, staticDir?: string): express.Express {
  const app = express();

  app.get("/api/universe", (_req, res) => {
    res.json(universe);
  });

  // Single-galaxy view of the first repo, kept for compatibility.
  app.get("/api/galaxy", (_req, res) => {
    const first = universe.galaxies[0];
    if (!first) {
      res.status(404).json({ error: "no galaxies" });
      return;
    }
    res.json(first);
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      repo: universe.galaxies[0]?.meta.repoName ?? "",
      repos: universe.galaxies.map((g) => g.meta.repoName),
    });
  });

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
  }

  return app;
}
