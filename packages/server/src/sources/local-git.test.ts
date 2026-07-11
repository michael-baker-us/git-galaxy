import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GitError } from "../git";
import { LocalGitRepoSource } from "./local-git";
import { buildSnapshot } from "./types";

const execFileAsync = promisify(execFile);

/**
 * Integration: exercises the real spawn → parse pipeline against a
 * throwaway repo scripted in test setup.
 */

let repoDir: string;
let emptyRepoDir: string;
let plainDir: string;

const git = (cwd: string, ...args: string[]) =>
  execFileAsync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test Author",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test Author",
      GIT_COMMITTER_EMAIL: "test@example.com",
      GIT_AUTHOR_DATE: "2026-01-02T03:04:05Z",
      GIT_COMMITTER_DATE: "2026-01-02T03:04:05Z",
    },
  });

beforeAll(async () => {
  repoDir = await mkdtemp(join(tmpdir(), "git-galaxy-test-"));
  emptyRepoDir = await mkdtemp(join(tmpdir(), "git-galaxy-empty-"));
  plainDir = await mkdtemp(join(tmpdir(), "git-galaxy-plain-"));

  await git(repoDir, "init", "-b", "main");
  await writeFile(join(repoDir, "README.md"), "# hello\n");
  await git(repoDir, "add", ".");
  await git(repoDir, "commit", "-m", "Initial commit");

  await writeFile(join(repoDir, "app.ts"), "export const x = 1;\n");
  await git(repoDir, "add", ".");
  await git(repoDir, "commit", "-m", "Add app");

  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(repoDir, "src", "scene"), { recursive: true });
  await writeFile(join(repoDir, "src", "scene", "stars.ts"), "// stars\n".repeat(20));
  await git(repoDir, "add", ".");
  await git(repoDir, "commit", "-m", "Add nested scene module");

  await git(emptyRepoDir, "init", "-b", "main");
}, 30_000);

afterAll(async () => {
  for (const dir of [repoDir, emptyRepoDir, plainDir]) {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("LocalGitRepoSource (integration)", () => {
  it("builds a full snapshot from a real repo", async () => {
    const snapshot = await buildSnapshot(new LocalGitRepoSource(repoDir), { maxCommits: 5000 });

    expect(snapshot.meta.repoName).toBe(basename(repoDir));
    expect(snapshot.meta.headRef).toBe("main");
    expect(snapshot.meta.totalCommits).toBe(3);
    expect(snapshot.meta.truncated).toBe(false);

    expect(snapshot.commits).toHaveLength(3);
    expect(snapshot.commits[0]?.subject).toBe("Add nested scene module");
    expect(snapshot.commits[2]?.subject).toBe("Initial commit");
    expect(snapshot.commits[2]?.parents).toEqual([]);
    expect(snapshot.commits[0]?.stats.insertions).toBeGreaterThan(0);

    expect(snapshot.authors).toEqual([
      { name: "Test Author", email: "test@example.com", commitCount: 3 },
    ]);

    expect(snapshot.tree.totalFiles).toBe(3);
    const src = snapshot.tree.children.find((c) => c.name === "src");
    expect(src?.type).toBe("dir");
  });

  it("respects maxCommits and reports truncation", async () => {
    const snapshot = await buildSnapshot(new LocalGitRepoSource(repoDir), { maxCommits: 2 });
    expect(snapshot.commits).toHaveLength(2);
    expect(snapshot.meta.totalCommits).toBe(3);
    expect(snapshot.meta.truncated).toBe(true);
  });

  it("serves an empty galaxy for a zero-commit repo instead of crashing", async () => {
    const snapshot = await buildSnapshot(new LocalGitRepoSource(emptyRepoDir), {
      maxCommits: 5000,
    });
    expect(snapshot.meta.totalCommits).toBe(0);
    expect(snapshot.meta.headRef).toBe("main");
    expect(snapshot.commits).toEqual([]);
    expect(snapshot.tree.children).toEqual([]);
  });

  it("rejects a directory that is not a git repository", async () => {
    await expect(new LocalGitRepoSource(plainDir).validate()).rejects.toThrow(GitError);
  });
});
