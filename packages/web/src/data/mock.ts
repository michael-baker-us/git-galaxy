import {
  type Author,
  type Commit,
  type FileNode,
  type FolderNode,
  type GalaxySnapshot,
  type TreeNode,
  createRng,
} from "@git-galaxy/shared";

/**
 * Procedural fake repo so the renderer runs with zero backend — used while
 * developing the scene and as a fallback when /api/galaxy is unreachable.
 */
export function mockGalaxy(commitCount = 2500, seed = 42): GalaxySnapshot {
  const rng = createRng(seed);

  const weights = [0.34, 0.24, 0.18, 0.13, 0.07, 0.04];
  const authors: Author[] = weights.map((_, i) => ({
    name: `dev-${i}`,
    email: `dev${i}@example.com`,
    commitCount: 0,
  }));

  const now = Math.floor(Date.now() / 1000);
  const spanSeconds = 3 * 365 * 24 * 3600;
  const commits: Commit[] = [];
  for (let i = 0; i < commitCount; i++) {
    // Newest-first, slightly uneven cadence.
    const timestamp = now - Math.floor((i / commitCount) * spanSeconds + rng.range(0, 4000));
    const roll = rng.next();
    let authorId = 0;
    let acc = 0;
    for (let a = 0; a < weights.length; a++) {
      acc += weights[a] ?? 0;
      if (roll < acc) {
        authorId = a;
        break;
      }
    }
    const author = authors[authorId];
    if (author) author.commitCount++;
    const churnScale = Math.exp(rng.gaussian() * 1.3 + 3.2);
    const isMerge = rng.next() < 0.08;
    commits.push({
      hash: i.toString(16).padStart(12, "0"),
      parents: isMerge ? ["aaaaaaaaaaaa", "bbbbbbbbbbbb"] : ["aaaaaaaaaaaa"],
      authorId,
      timestamp,
      subject: `mock commit #${commitCount - i}`,
      stats: {
        filesChanged: 1 + Math.floor(rng.range(0, 8)),
        insertions: Math.floor(churnScale),
        deletions: Math.floor(churnScale * rng.range(0.1, 0.9)),
      },
    });
  }

  return {
    meta: {
      repoName: "mock-galaxy",
      headRef: "main",
      generatedAt: Date.now(),
      totalCommits: commitCount,
      truncated: false,
    },
    authors,
    commits,
    tree: mockTree(),
  };
}

function f(path: string, bytes: number): FileNode {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return { type: "file", name, path, bytes, ext: dot > 0 ? name.slice(dot + 1) : "" };
}

function d(path: string, children: TreeNode[]): FolderNode {
  const totalFiles = children.reduce((s, c) => s + (c.type === "file" ? 1 : c.totalFiles), 0);
  const totalBytes = children.reduce((s, c) => s + (c.type === "file" ? c.bytes : c.totalBytes), 0);
  return { type: "dir", name: path.split("/").pop() ?? "", path, children, totalFiles, totalBytes };
}

function mockTree(): FolderNode {
  return d("", [
    f("README.md", 6_000),
    f("package.json", 1_800),
    d("src", [
      f("src/main.ts", 4_200),
      f("src/app.ts", 9_500),
      f("src/config.ts", 1_100),
      d("src/core", [
        f("src/core/engine.ts", 22_000),
        f("src/core/state.ts", 8_000),
        f("src/core/events.ts", 5_400),
      ]),
      d("src/render", [f("src/render/canvas.ts", 14_000), f("src/render/shaders.ts", 7_700)]),
    ]),
    d("docs", [f("docs/guide.md", 15_000), f("docs/api.md", 9_000)]),
    d("tests", [f("tests/app.test.ts", 6_500), f("tests/core.test.ts", 8_200)]),
  ]);
}
