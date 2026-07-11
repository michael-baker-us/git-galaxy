import type { GalaxySnapshot } from "@git-galaxy/shared";

export function renderHud(el: HTMLElement, snapshot: GalaxySnapshot, note?: string): void {
  const { meta, commits, tree } = snapshot;
  const shown =
    meta.truncated && meta.totalCommits > commits.length
      ? `${commits.length.toLocaleString()} of ${meta.totalCommits.toLocaleString()} commits`
      : `${meta.totalCommits.toLocaleString()} commits`;
  const lines = [
    `<div class="title">✦ ${escapeHtml(meta.repoName)} <span class="dim">· ${escapeHtml(meta.headRef)}</span></div>`,
    `<div>${shown} · ${tree.totalFiles.toLocaleString()} files · ${snapshot.authors.length.toLocaleString()} authors</div>`,
  ];
  if (meta.totalCommits === 0) {
    lines.push(`<div class="dim">empty repository — no stars yet</div>`);
  }
  if (note) lines.push(`<div class="dim">${escapeHtml(note)}</div>`);
  el.innerHTML = lines.join("");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
