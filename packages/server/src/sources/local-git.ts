import { basename } from "node:path";
import type { Author, Commit, FolderNode, GalaxyMeta } from "@git-galaxy/shared";
import { GitError, GitNotInstalledError, runGit } from "../git";
import { LOG_FORMAT, buildTree, parseGitLog, parseLsTree } from "../parse";
import type { RepoSource } from "./types";

/** Errors git emits for a repo whose HEAD has no commits yet. */
const EMPTY_REPO_PATTERN =
  /does not have any commits yet|bad default revision|Not a valid object name|ambiguous argument 'HEAD'|unknown revision/i;

const isEmptyRepoError = (error: unknown): boolean =>
  error instanceof GitError &&
  !(error instanceof GitNotInstalledError) &&
  EMPTY_REPO_PATTERN.test(error.stderr + error.message);

export class LocalGitRepoSource implements RepoSource {
  constructor(private readonly repoPath: string) {}

  /** Throws GitError if repoPath is not inside a git repository. */
  async validate(): Promise<void> {
    try {
      await runGit(this.repoPath, ["rev-parse", "--git-dir"]);
    } catch (error) {
      if (error instanceof GitNotInstalledError) throw error;
      throw new GitError(`not a git repository: ${this.repoPath}`);
    }
  }

  async getMeta(): Promise<Omit<GalaxyMeta, "generatedAt" | "truncated">> {
    const toplevel = await runGit(this.repoPath, ["rev-parse", "--show-toplevel"]);

    let headRef: string;
    try {
      headRef = (await runGit(this.repoPath, ["symbolic-ref", "--short", "-q", "HEAD"])).trim();
    } catch {
      // Detached HEAD: fall back to the abbreviated commit hash.
      headRef = (
        await runGit(this.repoPath, ["rev-parse", "--short", "HEAD"]).catch(() => "HEAD")
      ).trim();
    }

    let totalCommits = 0;
    try {
      totalCommits = Number((await runGit(this.repoPath, ["rev-list", "--count", "HEAD"])).trim());
    } catch (error) {
      if (!isEmptyRepoError(error)) throw error;
    }

    return { repoName: basename(toplevel.trim()), headRef, totalCommits };
  }

  async getCommits(opts: { maxCommits: number }): Promise<{
    authors: Author[];
    commits: Commit[];
  }> {
    try {
      const raw = await runGit(this.repoPath, [
        "log",
        "--numstat",
        "--no-renames",
        `--max-count=${opts.maxCommits}`,
        `--format=${LOG_FORMAT}`,
      ]);
      return parseGitLog(raw);
    } catch (error) {
      if (isEmptyRepoError(error)) return { authors: [], commits: [] };
      throw error;
    }
  }

  async getTree(): Promise<FolderNode> {
    try {
      const raw = await runGit(this.repoPath, ["ls-tree", "-r", "-l", "-z", "HEAD"]);
      return buildTree(parseLsTree(raw));
    } catch (error) {
      if (isEmptyRepoError(error)) return buildTree([]);
      throw error;
    }
  }
}
