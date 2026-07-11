import type { Author, Commit, FolderNode, GalaxyMeta, GalaxySnapshot } from "@git-galaxy/shared";

/**
 * Where galaxy data comes from. LocalGitRepoSource today; a GitHub API
 * source can implement the same seam later without touching server or CLI.
 */
export interface RepoSource {
  getMeta(): Promise<Omit<GalaxyMeta, "generatedAt" | "truncated">>;
  getCommits(opts: { maxCommits: number }): Promise<{ authors: Author[]; commits: Commit[] }>;
  getTree(): Promise<FolderNode>;
}

export interface SnapshotOptions {
  maxCommits: number;
}

export async function buildSnapshot(
  source: RepoSource,
  options: SnapshotOptions,
): Promise<GalaxySnapshot> {
  const [meta, log, tree] = await Promise.all([
    source.getMeta(),
    source.getCommits({ maxCommits: options.maxCommits }),
    source.getTree(),
  ]);
  return {
    meta: {
      ...meta,
      generatedAt: Date.now(),
      truncated: log.commits.length < meta.totalCommits,
    },
    authors: log.authors,
    commits: log.commits,
    tree,
  };
}
