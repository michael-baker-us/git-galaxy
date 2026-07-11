/**
 * The API contract between server and web. The server assembles a
 * GalaxySnapshot once per run; the frontend never sees git directly.
 */

/** One or many repos: pointing the CLI at a directory of repos yields a universe. */
export interface UniverseSnapshot {
  /** Epoch milliseconds. */
  generatedAt: number;
  galaxies: GalaxySnapshot[];
}

export interface GalaxySnapshot {
  meta: GalaxyMeta;
  /** Deduplicated author table; commits reference it by index. */
  authors: Author[];
  /** Newest-first. May be capped — see meta.truncated. */
  commits: Commit[];
  /** File tree at HEAD. */
  tree: FolderNode;
}

export interface GalaxyMeta {
  repoName: string;
  headRef: string;
  /** Epoch milliseconds. */
  generatedAt: number;
  /** True commit count of the repo, even when commits[] is capped. */
  totalCommits: number;
  truncated: boolean;
}

export interface Author {
  name: string;
  email: string;
  commitCount: number;
}

export interface Commit {
  /** Abbreviated to 12 chars. */
  hash: string;
  /** Abbreviated parent hashes; length > 1 means a merge commit. */
  parents: string[];
  /** Index into GalaxySnapshot.authors. */
  authorId: number;
  /** Author time, epoch seconds. */
  timestamp: number;
  /** Truncated to 80 chars. */
  subject: string;
  stats: CommitStats;
}

export interface CommitStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export type TreeNode = FolderNode | FileNode;

export interface FolderNode {
  type: "dir";
  name: string;
  /** Repo-relative path, "" for the root. */
  path: string;
  children: TreeNode[];
  /** Recursive file count, computed server-side. */
  totalFiles: number;
  /** Recursive byte total, computed server-side. */
  totalBytes: number;
}

export interface FileNode {
  type: "file";
  name: string;
  path: string;
  bytes: number;
  /** Lowercased extension without the dot, "" if none. */
  ext: string;
}
