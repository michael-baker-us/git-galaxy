import type { FileNode, FolderNode } from "./types";

export interface TreeEntry {
  path: string;
  bytes: number;
}

/**
 * Folds flat file paths into a FolderNode tree with bottom-up totals.
 * Pure — fed by `git ls-tree` on the server and by the GitHub trees API
 * in the browser.
 */
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
