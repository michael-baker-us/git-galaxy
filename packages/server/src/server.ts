import { existsSync } from "node:fs";
import type { GalaxySnapshot } from "@git-galaxy/shared";
import express from "express";

export function createApp(snapshot: GalaxySnapshot, staticDir?: string): express.Express {
  const app = express();

  app.get("/api/galaxy", (_req, res) => {
    res.json(snapshot);
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, repo: snapshot.meta.repoName });
  });

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
  }

  return app;
}
