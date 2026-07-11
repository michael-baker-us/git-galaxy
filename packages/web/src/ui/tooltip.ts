export interface Tooltip {
  show(html: string, clientX: number, clientY: number): void;
  hide(): void;
}

export function createTooltip(el: HTMLElement): Tooltip {
  return {
    show(html, clientX, clientY) {
      el.innerHTML = html;
      el.style.display = "block";
      // Keep the tooltip on-screen: flip to the other side of the cursor near edges.
      const { offsetWidth: w, offsetHeight: h } = el;
      const x = clientX + 16 + w > window.innerWidth ? clientX - w - 12 : clientX + 16;
      const y = clientY + 16 + h > window.innerHeight ? clientY - h - 12 : clientY + 16;
      el.style.left = `${Math.max(4, x)}px`;
      el.style.top = `${Math.max(4, y)}px`;
    },
    hide() {
      el.style.display = "none";
    },
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
