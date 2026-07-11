import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { UniverseSnapshot } from "@git-galaxy/shared";
import { GitError } from "../git";
import { LocalGitRepoSource } from "./local-git";
import { type SnapshotOptions, buildSnapshot } from "./types";

/** Keeps a directory of many clones from turning into a ten-minute scan. */
const MAX_REPOS = 24;

async function isGitRepo(path: string): Promise<boolean> {
  try {
    // .git is a directory in normal repos, a file in worktrees — both count.
    await stat(join(path, ".git"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds git repos to render: the path itself, or its immediate children
 * (pointing at ~/repos renders every repo in it as its own galaxy).
 */
export async function discoverRepos(rootPath: string): Promise<string[]> {
  if (await isGitRepo(rootPath)) return [rootPath];

  let entries: string[];
  try {
    entries = await readdir(rootPath);
  } catch {
    throw new GitError(`not a directory: ${rootPath}`);
  }

  const checks = await Promise.all(
    entries
      .filter((name) => !name.startsWith("."))
      .sort()
      .map(async (name) => {
        const path = join(rootPath, name);
        return (await isGitRepo(path)) ? path : null;
      }),
  );
  const repos = checks.filter((p): p is string => p !== null);
  if (repos.length === 0) {
    throw new GitError(`no git repositories found in ${rootPath}`);
  }
  if (repos.length > MAX_REPOS) {
    console.warn(`✦ found ${repos.length} repos; rendering the first ${MAX_REPOS}`);
  }
  return repos.slice(0, MAX_REPOS);
}

export async function buildUniverse(
  repoPaths: string[],
  options: SnapshotOptions,
): Promise<UniverseSnapshot> {
  const galaxies = await Promise.all(
    repoPaths.map(async (path) => {
      const source = new LocalGitRepoSource(path);
      await source.validate();
      return buildSnapshot(source, options);
    }),
  );
  return { generatedAt: Date.now(), galaxies };
}
