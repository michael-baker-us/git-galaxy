import type { Author, Commit, FileNode, FolderNode } from "@git-galaxy/shared";

/**
 * Pure parsers for git plumbing output. Fed by fixture strings in tests;
 * the only code that touches a real git binary lives in sources/local-git.
 */

/** Record separator between commits; field separator within the header line. */
export const RECORD_SEP = "\x1e";
export const FIELD_SEP = "\x1f";

/** --format string paired with parseGitLog. Subjects are single-line by definition. */
export const LOG_FORMAT = `${RECORD_SEP}%H${FIELD_SEP}%P${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%at${FIELD_SEP}%s`;

const HASH_LENGTH = 12;
const SUBJECT_LENGTH = 80;
const NUMSTAT_LINE = /^(\d+|-)\t(\d+|-)\t/;

export interface ParsedLog {
  authors: Author[];
  commits: Commit[];
}

/** Parses `git log --numstat --format=LOG_FORMAT` output. */
export function parseGitLog(raw: string): ParsedLog {
  const authors: Author[] = [];
  const authorIds = new Map<string, number>();
  const commits: Commit[] = [];

  for (const record of raw.split(RECORD_SEP)) {
    if (record.trim() === "") continue;
    const newline = record.indexOf("\n");
    const header = newline === -1 ? record : record.slice(0, newline);
    const body = newline === -1 ? "" : record.slice(newline + 1);

    const fields = header.split(FIELD_SEP);
    if (fields.length < 6) continue;
    const [hash, parents, name, email, timestamp, subject] = fields as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];

    const authorKey = `${name}\x00${email}`;
    let authorId = authorIds.get(authorKey);
    if (authorId === undefined) {
      authorId = authors.length;
      authorIds.set(authorKey, authorId);
      authors.push({ name, email, commitCount: 0 });
    }
    const author = authors[authorId];
    if (author) author.commitCount++;

    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;
    for (const line of body.split("\n")) {
      const m = NUMSTAT_LINE.exec(line);
      if (!m) continue;
      filesChanged++;
      // Binary files report "-": they count as changed but add no line churn.
      if (m[1] !== "-") insertions += Number(m[1]);
      if (m[2] !== "-") deletions += Number(m[2]);
    }

    commits.push({
      hash: hash.slice(0, HASH_LENGTH),
      parents: parents
        .split(" ")
        .filter(Boolean)
        .map((p) => p.slice(0, HASH_LENGTH)),
      authorId,
      timestamp: Number(timestamp),
      subject: subject.slice(0, SUBJECT_LENGTH),
      stats: { filesChanged, insertions, deletions },
    });
  }

  return { authors, commits };
}

export interface TreeEntry {
  path: string;
  bytes: number;
}

/** Parses `git ls-tree -r -l -z HEAD` output (NUL-separated, no path quoting). */
export function parseLsTree(raw: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const entry of raw.split("\0")) {
    if (entry === "") continue;
    const tab = entry.indexOf("\t");
    if (tab === -1) continue;
    const meta = entry.slice(0, tab).split(/\s+/);
    const [, type, , size] = meta;
    // Skip submodules (type "commit") and anything else that isn't a blob.
    if (type !== "blob") continue;
    entries.push({ path: entry.slice(tab + 1), bytes: Number(size) || 0 });
  }
  return entries;
}

/** Folds flat ls-tree paths into a FolderNode tree with bottom-up totals. */
export function buildTree(entries: TreeEntry[]): FolderNode {
  const root: FolderNode = {
    type: "dir",
    name: "",
    path: "",
    children: [],
    totalFiles: 0,
    totalBytes: 0,
  };
  const folders = new Map<string, FolderNode>([["", root]]);

  const folderFor = (path: string): FolderNode => {
    const existing = folders.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf("/");
    const parent = folderFor(slash === -1 ? "" : path.slice(0, slash));
    const folder: FolderNode = {
      type: "dir",
      name: slash === -1 ? path : path.slice(slash + 1),
      path,
      children: [],
      totalFiles: 0,
      totalBytes: 0,
    };
    parent.children.push(folder);
    folders.set(path, folder);
    return folder;
  };

  for (const entry of entries) {
    const slash = entry.path.lastIndexOf("/");
    const name = slash === -1 ? entry.path : entry.path.slice(slash + 1);
    const dot = name.lastIndexOf(".");
    const file: FileNode = {
      type: "file",
      name,
      path: entry.path,
      bytes: entry.bytes,
      ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : "",
    };
    folderFor(slash === -1 ? "" : entry.path.slice(0, slash)).children.push(file);
  }

  const finalize = (folder: FolderNode): void => {
    for (const child of folder.children) {
      if (child.type === "dir") {
        finalize(child);
        folder.totalFiles += child.totalFiles;
        folder.totalBytes += child.totalBytes;
      } else {
        folder.totalFiles += 1;
        folder.totalBytes += child.bytes;
      }
    }
    // Deterministic, layout-friendly order: big folders first, then big files.
    folder.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      if (a.type === "dir" && b.type === "dir") return b.totalFiles - a.totalFiles;
      if (a.type === "file" && b.type === "file") return b.bytes - a.bytes;
      return 0;
    });
  };
  finalize(root);

  return root;
}
