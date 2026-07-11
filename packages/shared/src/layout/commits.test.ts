import { describe, expect, it } from "vitest";
import type { Author, Commit } from "../types";
import { galaxyRadius, layoutCommits, starSizeBoost } from "./commits";

function makeCommit(overrides: Partial<Commit> & { timestamp: number }): Commit {
  return {
    hash: "abc123def456",
    parents: ["000000000000"],
    authorId: 0,
    subject: "a commit",
    stats: { filesChanged: 1, insertions: 10, deletions: 2 },
    ...overrides,
  };
}

/** count commits per author, newest-first timestamps. */
function makeHistory(
  perAuthor: number[],
  startTs = 1_700_000_000,
): {
  commits: Commit[];
  authors: Author[];
} {
  const authors: Author[] = perAuthor.map((count, i) => ({
    name: `author-${i}`,
    email: `a${i}@example.com`,
    commitCount: count,
  }));
  const commits: Commit[] = [];
  let ts = startTs;
  const remaining = [...perAuthor];
  while (remaining.some((r) => r > 0)) {
    for (let a = 0; a < remaining.length; a++) {
      if ((remaining[a] ?? 0) > 0) {
        remaining[a] = (remaining[a] ?? 0) - 1;
        commits.push(makeCommit({ timestamp: ts, authorId: a }));
        ts -= 3600;
      }
    }
  }
  return { commits, authors };
}

describe("galaxyRadius / starSizeBoost", () => {
  it("shrinks the disc for short histories and clamps both ends", () => {
    expect(galaxyRadius(0)).toBe(26);
    expect(galaxyRadius(23)).toBe(26);
    expect(galaxyRadius(4000)).toBe(100);
    expect(galaxyRadius(50_000)).toBe(100);
    expect(galaxyRadius(500)).toBeGreaterThan(26);
    expect(galaxyRadius(500)).toBeLessThan(100);
  });

  it("boosts star size for sparse galaxies only", () => {
    expect(starSizeBoost(23)).toBeCloseTo(1.9);
    expect(starSizeBoost(5000)).toBe(1);
    expect(starSizeBoost(500)).toBeGreaterThan(1);
  });
});

describe("layoutCommits", () => {
  it("returns one placement per commit", () => {
    const { commits, authors } = makeHistory([40, 30, 20]);
    expect(layoutCommits(commits, authors)).toHaveLength(commits.length);
  });

  it("handles degenerate inputs without NaN", () => {
    expect(layoutCommits([], [])).toEqual([]);
    const single = layoutCommits(
      [makeCommit({ timestamp: 1_700_000_000 })],
      [{ name: "a", email: "a@x", commitCount: 1 }],
    );
    expect(single).toHaveLength(1);
    for (const p of single) {
      for (const v of [...p.position, p.size]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("produces only finite positions, sizes, and colors", () => {
    const { commits, authors } = makeHistory([100, 60, 30, 5, 1]);
    for (const p of layoutCommits(commits, authors)) {
      for (const v of [...p.position, p.size, ...p.color]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("is deterministic for the same seed and differs across seeds", () => {
    const { commits, authors } = makeHistory([50, 40, 10]);
    const a = layoutCommits(commits, authors, { seed: 7 });
    const b = layoutCommits(commits, authors, { seed: 7 });
    const c = layoutCommits(commits, authors, { seed: 8 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("places older commits closer to the galactic center (within jitter)", () => {
    const { commits, authors } = makeHistory([80, 60, 40]);
    const placements = layoutCommits(commits, authors, { maxRadius: 100 });
    const radiusOf = (p: { position: [number, number, number] }) =>
      Math.hypot(p.position[0], p.position[2]);
    // commits[] is newest-first; the last one is the oldest.
    const oldest = placements[placements.length - 1];
    const newest = placements[0];
    if (!oldest || !newest) throw new Error("empty layout");
    expect(radiusOf(oldest)).toBeLessThan(20);
    expect(radiusOf(newest)).toBeGreaterThan(80);
  });

  it("keeps sizes within clamps and boosts merges", () => {
    const authors = [{ name: "a", email: "a@x", commitCount: 2 }];
    const huge = makeCommit({
      timestamp: 1_700_000_000,
      stats: { filesChanged: 500, insertions: 900_000, deletions: 900_000 },
    });
    const tiny = makeCommit({
      timestamp: 1_699_000_000,
      stats: { filesChanged: 1, insertions: 0, deletions: 0 },
    });
    const merge = makeCommit({
      timestamp: 1_698_000_000,
      parents: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"],
      stats: { filesChanged: 1, insertions: 10, deletions: 0 },
    });
    const plain = makeCommit({
      timestamp: 1_697_000_000,
      stats: { filesChanged: 1, insertions: 10, deletions: 0 },
    });
    const [pHuge, pTiny, pMerge, pPlain] = layoutCommits([huge, tiny, merge, plain], authors);
    if (!pHuge || !pTiny || !pMerge || !pPlain) throw new Error("empty layout");
    const boost = starSizeBoost(4);
    expect(pHuge.size).toBeLessThanOrEqual(4.5 * boost);
    expect(pTiny.size).toBeGreaterThanOrEqual(0.8);
    expect(pMerge.size).toBeGreaterThan(pPlain.size);
  });

  it("falls back to phyllotaxis for repos with fewer than 3 authors", () => {
    const { commits, authors } = makeHistory([30]);
    // Phyllotaxis angles/radii use no rng (only y-jitter does), so the
    // disc-plane placement is identical across seeds.
    const a = layoutCommits(commits, authors, { seed: 1 });
    const b = layoutCommits(commits, authors, { seed: 99 });
    const plane = (ps: typeof a) => ps.map((p) => [p.position[0], p.position[2]]);
    expect(plane(a)).toEqual(plane(b));
  });
});
