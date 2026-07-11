import { describe, expect, it } from "vitest";
import type { FileNode, FolderNode } from "../types";
import { type BodyPlacement, layoutTree } from "./tree";

function file(path: string, bytes = 1000): FileNode {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return {
    type: "file",
    name,
    path,
    bytes,
    ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : "",
  };
}

function dir(path: string, children: (FolderNode | FileNode)[]): FolderNode {
  const totalFiles = children.reduce((sum, c) => sum + (c.type === "file" ? 1 : c.totalFiles), 0);
  const totalBytes = children.reduce(
    (sum, c) => sum + (c.type === "file" ? c.bytes : c.totalBytes),
    0,
  );
  return {
    type: "dir",
    name: path.split("/").pop() ?? "",
    path,
    children,
    totalFiles,
    totalBytes,
  };
}

const sampleTree = (): FolderNode =>
  dir("", [
    file("README.md", 4000),
    dir("src", [
      file("src/main.ts", 2000),
      file("src/util.ts", 800),
      dir("src/scene", [file("src/scene/stars.ts", 5000)]),
    ]),
    dir("docs", [file("docs/guide.md", 12_000)]),
  ]);

describe("layoutTree", () => {
  it("places every folder and file with a valid parent reference", () => {
    const placements = layoutTree(sampleTree());
    const byPath = new Map(placements.map((p) => [p.path, p]));
    expect(byPath.get("")?.kind).toBe("root");
    expect(byPath.get("src")?.parentPath).toBe("");
    expect(byPath.get("src/scene")?.parentPath).toBe("src");
    expect(byPath.get("src/main.ts")?.parentPath).toBe("src");
    for (const p of placements) {
      if (p.parentPath !== null) expect(byPath.has(p.parentPath)).toBe(true);
    }
  });

  it("produces only finite numbers and positive periods for orbiting bodies", () => {
    for (const p of layoutTree(sampleTree())) {
      for (const v of [p.orbitRadius, p.orbitPeriod, p.phase, p.inclination, p.bodyRadius]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      if (p.kind !== "root") {
        expect(p.orbitRadius).toBeGreaterThan(0);
        expect(p.orbitPeriod).toBeGreaterThan(0);
      }
    }
  });

  it("separates sibling folders: shared rings by phase, or distinct rings by radius", () => {
    const placements = layoutTree(sampleTree());
    const siblings = placements.filter((p) => p.kind === "folder" && p.parentPath === "");
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i];
        const b = siblings[j];
        if (!a || !b) continue;
        if (a.orbitRadius === b.orbitRadius) {
          // Same ring: arc distance between them must clear both bodies.
          let dPhase = Math.abs(a.phase - b.phase) % (2 * Math.PI);
          dPhase = Math.min(dPhase, 2 * Math.PI - dPhase);
          expect(dPhase * a.orbitRadius).toBeGreaterThan(a.bodyRadius + b.bodyRadius);
        } else {
          expect(Math.abs(a.orbitRadius - b.orbitRadius)).toBeGreaterThan(0.5);
        }
      }
    }
  });

  it("keeps deep wide trees compact (no combinatorial orbit blow-up)", () => {
    // 20 sibling folders of 12 files each: concentric orbits would push the
    // outermost sibling past 200 units; shared rings must stay well under that.
    const wide = dir(
      "",
      Array.from({ length: 20 }, (_, i) =>
        dir(
          `pkg${i}`,
          Array.from({ length: 12 }, (_, j) => file(`pkg${i}/f${j}.ts`, 1000)),
        ),
      ),
    );
    const placements = layoutTree(wide);
    const maxOrbit = Math.max(...placements.map((p) => p.orbitRadius));
    expect(maxOrbit).toBeLessThan(100);
  });

  it("gives bigger folders bigger bodies", () => {
    const placements = layoutTree(sampleTree());
    const byPath = new Map(placements.map((p) => [p.path, p]));
    const src = byPath.get("src");
    const docs = byPath.get("docs");
    if (!src || !docs) throw new Error("missing folders");
    expect(src.bodyRadius).toBeGreaterThan(docs.bodyRadius);
  });

  it("caps satellites per folder", () => {
    const many = dir(
      "",
      Array.from({ length: 100 }, (_, i) => file(`f${i}.ts`, 100 + i)),
    );
    const placements = layoutTree(many, { maxFilesPerFolder: 30 });
    expect(placements.filter((p) => p.kind === "file")).toHaveLength(30);
  });

  it("stops descending below maxDepth but keeps the folder as a leaf planet", () => {
    const deep = dir("", [
      dir("a", [dir("a/b", [dir("a/b/c", [dir("a/b/c/d", [file("a/b/c/d/x.ts")])])])]),
    ]);
    const placements = layoutTree(deep, { maxDepth: 2 });
    const paths = placements.map((p: BodyPlacement) => p.path);
    expect(paths).toContain("a/b");
    expect(paths).not.toContain("a/b/c");
    expect(paths).not.toContain("a/b/c/d/x.ts");
  });

  it("is deterministic per seed", () => {
    expect(layoutTree(sampleTree(), { seed: 3 })).toEqual(layoutTree(sampleTree(), { seed: 3 }));
  });

  it("handles an empty root (zero-commit repo)", () => {
    const placements = layoutTree(dir("", []));
    expect(placements).toHaveLength(1);
    expect(placements[0]?.kind).toBe("root");
  });
});
