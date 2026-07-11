# Git Galaxy — Architecture

## The mapping (why the galaxy looks the way it does)

**The galactic disc is time. The center is the project's origin; the rim is now.**

### Stars = commits

- **Radius**: `r = R_max · sqrt(rank / total)` over chronological rank. The square root keeps
  *area density* uniform, so the core reads dense and bright — early furious history packed
  at the center, the newest work out at the frontier.
- **Angle**: the top ~6 authors by commit count each own a spiral arm
  (base angle + twist·radius + gaussian spread that widens toward the core). Everyone else
  becomes scattered field stars. Repos with fewer than 3 authors fall back to golden-angle
  phyllotaxis (a Vogel spiral) — zero collisions, still gorgeous.
- **Color**: blackbody-style temperature over age — newest blue-white → white → yellow →
  orange → oldest deep red. You can *see* where a project is alive.
- **Size**: `log(1 + insertions + deletions)`, clamped; merge commits get a 1.3× bonus.
- Radial jitter is **uniform and bounded** (not gaussian) so radius stays a faithful time axis.

### Planets & satellites = the tree at HEAD

A "home system" offset +55 on Y so it hovers above its own history:

- Root folder = the sun (emissive + the system's point light).
- Subfolders = planets orbiting their parent; nesting capped at depth 4.
- Planet size `∝ log(1 + descendant file count)`; orbit period `∝ radius^1.5` (Kepler III).
- Files = satellites colored by extension (curated hues for common ones, stable hash-hue
  otherwise), sized by `log(bytes)`, capped at 30 per folder.

### The orbit-packing lesson (learned the hard way)

The first layout gave every sibling folder its own concentric orbit, spaced by the sibling's
full subtree extent. That explodes combinatorially: each orbit must clear the *sum* of all
inner siblings' subtree diameters. On express, `examples/` (30 subfolders) alone pushed the
system to **2,700 units across** — 27× the galaxy itself.

The fix: siblings share rings, evenly phase-spaced. Same radius = same angular speed, so the
spacing holds forever without collision checks. A spacing cap (18 units) means one monster
subtree may slightly overlap a neighbor instead of inflating the entire system. Files use the
same trick (12 per ring "necklaces"). Result: express fits in ~135 units.

## Data flow

```
git binary ──execFile──> LocalGitRepoSource ──parsers──> GalaxySnapshot ──JSON──> layout*() ──> Three.js
             (no shell)   implements RepoSource            (shared types)          (shared, pure)   (web)
```

- **`RepoSource`** (`server/src/sources/types.ts`) is the seam for future sources
  (GitHub API) — `getMeta()`, `getCommits()`, `getTree()`; `buildSnapshot()` assembles above it.
- **Parsers are pure functions** (`server/src/parse.ts`) fed by fixture strings in tests.
  `git log` uses `%x1f`/`%x1e` field/record separators (robust against anything in subjects);
  `ls-tree` uses `-z` (NUL separators, no path quoting).
- **Layout is pure math** (`shared/src/layout/`) — no Three.js imports, deterministic via a
  seeded mulberry32 PRNG, so the same repo always renders the same galaxy and everything is
  unit-testable.
- **Rendering** (`web/src/scene/`) never touches git concepts; it consumes placements.

## Rendering decisions

- **Starfield: one `THREE.Points` draw call** for up to 5,000 stars. `PointsMaterial` only
  supports a global size, so a ~30-line `ShaderMaterial` provides per-star size, color,
  twinkle, and a global fade uniform. The glow sprite is a radial gradient drawn on a canvas
  (no asset files), rendered with additive blending and `depthWrite: false`.
- **Orbits animate on the CPU**: nested pivot groups, one rotation write per body per frame.
  Trivially cheap for hundreds of bodies, debuggable, and world positions stay readable for
  future raycast tooltips. (Shader-driven motion would obscure them.)
- **Payload sanity**: commits capped at 5,000 newest (`--max-commits`), 12-char hashes,
  80-char subjects, deduped author table → express (6,156 commits) is a ~1 MB JSON payload.

## Workspace shape

- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `moduleResolution: bundler`, `noEmit`
  everywhere — emission belongs to bundlers (Vite for web, tsup for the server CLI).
- `@git-galaxy/shared` uses the **internal-package pattern**: its `exports` points at raw
  `.ts` source. Vite, tsx, and Vitest consume it directly (no build-order coupling); tsup
  bundles it into the CLI via `noExternal`.
- Tests run from one root Vitest config across all packages.

## Deliberately deferred

Bloom postprocessing (`UnrealBloomPass`), hover tooltips (raycast → commit subject/author),
timeline playback (stars ignite in commit order), author-color mode toggle, GitHub source,
`--watch` re-parse, CI. The seams for all of these exist; none of them require reshaping
what's here.
