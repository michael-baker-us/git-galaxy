import { describe, expect, it } from "vitest";
import { FIELD_SEP, RECORD_SEP, buildTree, parseGitLog, parseLsTree } from "./parse";

const RS = RECORD_SEP;
const US = FIELD_SEP;

const H1 = "a".repeat(40);
const H2 = "b".repeat(40);
const H3 = "c".repeat(40);
const H4 = "d".repeat(40);

function logRecord(fields: {
  hash: string;
  parents: string;
  name: string;
  email: string;
  at: number;
  subject: string;
  numstat?: string;
}): string {
  const header = [
    fields.hash,
    fields.parents,
    fields.name,
    fields.email,
    fields.at,
    fields.subject,
  ].join(US);
  return `${RS}${header}\n${fields.numstat ? `\n${fields.numstat}\n` : ""}`;
}

describe("parseGitLog", () => {
  it("parses commits, stats, and deduplicates authors", () => {
    const raw = [
      logRecord({
        hash: H1,
        parents: H2,
        name: "Alice",
        email: "alice@example.com",
        at: 1_700_000_200,
        subject: "Add engine",
        numstat: "10\t2\tsrc/engine.ts\n5\t0\tREADME.md",
      }),
      logRecord({
        hash: H2,
        parents: H3,
        name: "Åsa Öberg",
        email: "asa@example.com",
        at: 1_700_000_100,
        subject: "初期化 with unicode",
        numstat: "1\t1\tsrc/app.ts",
      }),
      logRecord({
        hash: H3,
        parents: "",
        name: "Alice",
        email: "alice@example.com",
        at: 1_700_000_000,
        subject: "Initial commit",
        numstat: "100\t0\tsrc/app.ts",
      }),
    ].join("");

    const { authors, commits } = parseGitLog(raw);
    expect(commits).toHaveLength(3);
    expect(authors).toHaveLength(2);
    expect(authors[0]).toEqual({ name: "Alice", email: "alice@example.com", commitCount: 2 });

    const first = commits[0];
    expect(first?.hash).toBe(H1.slice(0, 12));
    expect(first?.parents).toEqual([H2.slice(0, 12)]);
    expect(first?.stats).toEqual({ filesChanged: 2, insertions: 15, deletions: 2 });
    expect(commits[1]?.authorId).toBe(1);
    expect(commits[2]?.authorId).toBe(0);
    // Root commit: %P is empty.
    expect(commits[2]?.parents).toEqual([]);
  });

  it("recognizes merge commits by multiple parents", () => {
    const raw = logRecord({
      hash: H1,
      parents: `${H2} ${H3}`,
      name: "Bob",
      email: "bob@example.com",
      at: 1_700_000_000,
      subject: "Merge branch 'feature'",
    });
    const { commits } = parseGitLog(raw);
    expect(commits[0]?.parents).toHaveLength(2);
  });

  it("counts binary files as changed without line churn", () => {
    const raw = logRecord({
      hash: H1,
      parents: H2,
      name: "Bob",
      email: "bob@example.com",
      at: 1_700_000_000,
      subject: "Add logo",
      numstat: "-\t-\tassets/logo.png\n3\t1\tsrc/app.ts",
    });
    const { commits } = parseGitLog(raw);
    expect(commits[0]?.stats).toEqual({ filesChanged: 2, insertions: 3, deletions: 1 });
  });

  it("handles empty commits (no numstat block)", () => {
    const raw = logRecord({
      hash: H4,
      parents: H1,
      name: "Bob",
      email: "bob@example.com",
      at: 1_700_000_000,
      subject: "chore: empty",
    });
    const { commits } = parseGitLog(raw);
    expect(commits[0]?.stats).toEqual({ filesChanged: 0, insertions: 0, deletions: 0 });
  });

  it("truncates long subjects to 80 chars", () => {
    const raw = logRecord({
      hash: H1,
      parents: H2,
      name: "Bob",
      email: "bob@example.com",
      at: 1_700_000_000,
      subject: "x".repeat(120),
    });
    const { commits } = parseGitLog(raw);
    expect(commits[0]?.subject).toHaveLength(80);
  });

  it("returns nothing for empty input", () => {
    expect(parseGitLog("")).toEqual({ authors: [], commits: [] });
  });
});

describe("parseLsTree", () => {
  const raw = [
    `100644 blob ${H1}    1234\tREADME.md`,
    `100644 blob ${H2}     567\tsrc/main.ts`,
    `100755 blob ${H3}      89\tsrc/bin/run.sh`,
    `160000 commit ${H4}       -\tvendor/submodule`,
  ].join("\0");

  it("parses blob entries with sizes and skips submodules", () => {
    const entries = parseLsTree(`${raw}\0`);
    expect(entries).toEqual([
      { path: "README.md", bytes: 1234 },
      { path: "src/main.ts", bytes: 567 },
      { path: "src/bin/run.sh", bytes: 89 },
    ]);
  });

  it("returns nothing for empty input (zero-commit repo)", () => {
    expect(parseLsTree("")).toEqual([]);
  });
});

describe("buildTree", () => {
  it("folds flat paths into a nested tree with bottom-up totals", () => {
    const root = buildTree([
      { path: "README.md", bytes: 100 },
      { path: "src/main.ts", bytes: 200 },
      { path: "src/scene/stars.ts", bytes: 300 },
      { path: "src/scene/dust.ts", bytes: 50 },
    ]);
    expect(root.totalFiles).toBe(4);
    expect(root.totalBytes).toBe(650);

    const src = root.children.find((c) => c.type === "dir" && c.name === "src");
    if (src?.type !== "dir") throw new Error("missing src dir");
    expect(src.totalFiles).toBe(3);
    expect(src.totalBytes).toBe(550);

    const scene = src.children.find((c) => c.type === "dir" && c.name === "scene");
    if (scene?.type !== "dir") throw new Error("missing scene dir");
    expect(scene.totalFiles).toBe(2);
    expect(scene.path).toBe("src/scene");
  });

  it("extracts lowercase extensions and handles dotfiles", () => {
    const root = buildTree([
      { path: "a/Photo.JPG", bytes: 1 },
      { path: ".gitignore", bytes: 1 },
      { path: "Makefile", bytes: 1 },
    ]);
    const all = new Map<string, string>();
    const walk = (node: typeof root): void => {
      for (const child of node.children) {
        if (child.type === "file") all.set(child.name, child.ext);
        else walk(child);
      }
    };
    walk(root);
    expect(all.get("Photo.JPG")).toBe("jpg");
    expect(all.get(".gitignore")).toBe("");
    expect(all.get("Makefile")).toBe("");
  });

  it("sorts folders before files, biggest first", () => {
    const root = buildTree([
      { path: "z.txt", bytes: 10 },
      { path: "a.txt", bytes: 999 },
      { path: "small/x.ts", bytes: 1 },
      { path: "big/one.ts", bytes: 1 },
      { path: "big/two.ts", bytes: 1 },
    ]);
    expect(root.children.map((c) => c.name)).toEqual(["big", "small", "a.txt", "z.txt"]);
  });
});
