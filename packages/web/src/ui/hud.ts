import type { UniverseSnapshot } from "@git-galaxy/shared";
import { escapeHtml } from "./tooltip";

export function renderHud(el: HTMLElement, universe: UniverseSnapshot, note?: string): void {
  const { galaxies } = universe;
  const lines: string[] = [];

  const first = galaxies[0];
  if (galaxies.length === 1 && first) {
    const { meta, commits, tree } = first;
    const shown =
      meta.truncated && meta.totalCommits > commits.length
        ? `${commits.length.toLocaleString()} of ${meta.totalCommits.toLocaleString()} commits`
        : `${meta.totalCommits.toLocaleString()} commits`;
    lines.push(
      `<div class="title">✦ ${escapeHtml(meta.repoName)} <span class="dim">· ${escapeHtml(meta.headRef)}</span></div>`,
      `<div>${shown} · ${tree.totalFiles.toLocaleString()} files · ${first.authors.length.toLocaleString()} authors</div>`,
    );
    if (meta.totalCommits === 0) {
      lines.push(`<div class="dim">empty repository — no stars yet</div>`);
    }
  } else {
    const commits = galaxies.reduce((s, g) => s + g.meta.totalCommits, 0);
    const files = galaxies.reduce((s, g) => s + g.tree.totalFiles, 0);
    lines.push(
      `<div class="title">✦ universe <span class="dim">· ${galaxies.length} repositories</span></div>`,
      `<div>${commits.toLocaleString()} commits · ${files.toLocaleString()} files</div>`,
    );
  }

  lines.push(`<div class="dim">hover for details · drag to explore</div>`);
  if (note) lines.push(`<div class="dim">${escapeHtml(note)}</div>`);
  el.innerHTML = lines.join("");
}
