import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GitError } from "../git";
import { buildUniverse, discoverRepos } from "./universe";

const execFileAsync = promisify(execFile);

let parentDir: string;

const git = (cwd: string, ...args: string[]) =>
  execFileAsync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test Author",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test Author",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });

beforeAll(async () => {
  parentDir = await mkdtemp(join(tmpdir(), "git-galaxy-universe-"));
  for (const name of ["alpha", "beta"]) {
    const repo = join(parentDir, name);
    await mkdir(repo);
    await git(repo, "init", "-b", "main");
    await writeFile(join(repo, "README.md"), `# ${name}\n`);
    await git(repo, "add", ".");
    await git(repo, "commit", "-m", `${name} initial`);
  }
  await mkdir(join(parentDir, "not-a-repo"));
  await mkdir(join(parentDir, ".hidden"));
}, 30_000);

afterAll(async () => {
  if (parentDir) await rm(parentDir, { recursive: true, force: true });
});

describe("discoverRepos", () => {
  it("returns the path itself when it is a repo", async () => {
    const repos = await discoverRepos(join(parentDir, "alpha"));
    expect(repos).toEqual([join(parentDir, "alpha")]);
  });

  it("finds child repos of a directory, skipping non-repos and hidden dirs", async () => {
    const repos = await discoverRepos(parentDir);
    expect(repos).toEqual([join(parentDir, "alpha"), join(parentDir, "beta")]);
  });

  it("rejects a directory containing no repos", async () => {
    await expect(discoverRepos(join(parentDir, "not-a-repo"))).rejects.toThrow(GitError);
  });
});

describe("buildUniverse", () => {
  it("builds one galaxy per repo", async () => {
    const universe = await buildUniverse(await discoverRepos(parentDir), { maxCommits: 100 });
    expect(universe.galaxies).toHaveLength(2);
    expect(universe.galaxies.map((g) => g.meta.repoName)).toEqual(["alpha", "beta"]);
    expect(universe.galaxies[0]?.commits).toHaveLength(1);
  });
});
