#!/usr/bin/env node
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { GitError } from "./git";
import { createApp } from "./server";
import { LocalGitRepoSource } from "./sources/local-git";
import { buildSnapshot } from "./sources/types";

const HELP = `git-galaxy — render a git repository as a 3D galaxy

Usage: git-galaxy [repo-path] [options]

  repo-path            Path to a git repository (default: current directory)

Options:
  -p, --port <n>       Port to serve on (default: 4242)
      --max-commits <n>  Cap on commits fetched, newest first (default: 5000)
      --open           Open the browser once the galaxy is ready
  -h, --help           Show this help
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      port: { type: "string", short: "p", default: "4242" },
      "max-commits": { type: "string", default: "5000" },
      open: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const port = Number(values.port);
  const maxCommits = Number(values["max-commits"]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new GitError(`invalid port: ${values.port}`);
  }
  if (!Number.isInteger(maxCommits) || maxCommits < 1) {
    throw new GitError(`invalid --max-commits: ${values["max-commits"]}`);
  }

  const repoPath = resolve(positionals[0] ?? process.cwd());
  await assertPortFree(port);
  const source = new LocalGitRepoSource(repoPath);
  await source.validate();

  console.log(`✦ scanning ${repoPath} …`);
  const snapshot = await buildSnapshot(source, { maxCommits });
  const { meta, tree } = snapshot;
  const shown = meta.truncated
    ? `${snapshot.commits.length.toLocaleString()} of ${meta.totalCommits.toLocaleString()}`
    : meta.totalCommits.toLocaleString();
  console.log(
    `✦ ${meta.repoName} · ${meta.headRef} · ${shown} commits · ${tree.totalFiles.toLocaleString()} files`,
  );

  // Built frontend lives at packages/web/dist relative to both src/ (tsx) and dist/ (built).
  const staticDir = resolve(fileURLToPath(import.meta.url), "../../../web/dist");
  const app = createApp(snapshot, staticDir);

  await new Promise<void>((resolvePromise, reject) => {
    const server = app.listen(port, () => resolvePromise());
    server.on("error", reject);
  });

  const url = `http://localhost:${port}`;
  console.log(`✦ galaxy ready → ${url}`);
  if (values.open) openBrowser(url);
}

/**
 * A dual-stack quirk lets a second server "successfully" bind the IPv4 side
 * of a port whose IPv6 side another instance holds — the browser then talks
 * to the old instance while the new one reports ready. Probe before binding
 * and refuse the port if anything already answers on it.
 */
async function assertPortFree(port: number): Promise<void> {
  let body: { repo?: string } | null = null;
  try {
    const res = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(700),
    });
    body = (await res.json().catch(() => null)) as { repo?: string } | null;
  } catch {
    return; // nothing answered — the port is ours
  }
  const who = body?.repo ? `another git-galaxy serving "${body.repo}"` : "another process";
  throw new GitError(`port ${port} is already in use by ${who} — stop it or pass --port <n>`);
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  execFile(command, [url], (error) => {
    if (error) console.error(`could not open browser: ${error.message}`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof GitError ? error.message : String(error);
  console.error(`git-galaxy: ${message}`);
  process.exit(1);
});
