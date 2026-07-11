# Git Galaxy 🌌

Every repository becomes a galaxy. **Stars are commits. Planets are folders. Satellites are files.** Pure eye candy.

Point it at any local git repo and it renders that repo as an animated 3D galaxy in your browser:

- The **galactic disc is time** — the dense core is the project's earliest history, the rim is now.
- The most prolific **authors each own a spiral arm**; everyone else scatters as field stars.
- Star **color is a temperature ramp over age** (newest burn blue-white, oldest fade to deep red), and star **size follows churn** — big refactors blaze, typo fixes twinkle. Merges get a brightness bonus.
- The file tree at HEAD is the **galactic nucleus**: a solar system at the center of its own history — the root folder is the sun, subfolders orbit as planets on tilted planes (Kepler's third law, so inner bodies visibly outrun outer ones), and files swarm as satellites colored by extension.

## Usage

```bash
npm install
npm run build
node packages/server/dist/cli.js /path/to/any/repo --open
```

```
git-galaxy [path] [options]

  path                  A git repository — or a directory of repositories
                        (e.g. ~/repos), rendered as a universe of galaxies
  -p, --port <n>        Port to serve on (default: 4242)
      --max-commits <n> Cap on commits fetched per repo, newest first (default: 5000)
      --open            Open the browser once the galaxy is ready
```

In the browser: drag to explore, scroll to zoom, **hover anything** for details
(stars show the commit, planets the folder, satellites the file, suns the repo).
`R` pauses/resumes galaxy rotation, `O` pauses/resumes orbital motion — or use
the buttons in the corner.

**`F` boards the spaceship** 🚀 — mouse steers, `W`/`S` throttle, `A`/`D` roll,
`Shift` boosts, `Esc` (or `F`) returns to orbit view aimed wherever you were
heading. **`H` resets** everything to the first-open view, intro and all.

## Development

```bash
npm run dev        # tsx-watched server (this repo) + Vite dev server with /api proxy
npm test           # Vitest across all packages
npm run typecheck  # tsc --noEmit per package
npm run lint       # Biome
```

Open the Vite URL it prints; `#system` in the URL deep-links the camera to the folder system.

## Architecture

npm workspaces, three packages:

| Package | What it is |
|---|---|
| `@git-galaxy/shared` | The API contract (`GalaxySnapshot`) + pure layout math (spiral placement, orbital packing, color ramps). No Three.js, no Node APIs — fully unit-tested. |
| `@git-galaxy/server` | CLI + Express server. Spawns git plumbing (`log --numstat`, `ls-tree -r -l -z`) behind a `RepoSource` interface, serves `GET /api/galaxy` and the built frontend. |
| `@git-galaxy/web` | Vite + Three.js renderer: one `THREE.Points` draw call for the whole starfield (custom shader, additive glow, twinkle), nested pivot groups for the orbital system. |

See [docs/architecture.md](docs/architecture.md) for the design decisions and their tradeoffs.
