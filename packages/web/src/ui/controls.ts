export interface PlaybackState {
  rotationPaused: boolean;
  orbitsPaused: boolean;
  /** Clears both pauses and re-syncs button labels. */
  resetPlayback(): void;
}

/**
 * Two independent toggles — galaxy rotation (disc spin + camera drift) and
 * orbital motion — plus a reset that reloads the first-open view.
 * Keyboard: R / O / H.
 */
export function mountControls(el: HTMLElement, onReset: () => void): PlaybackState {
  const state: PlaybackState = {
    rotationPaused: false,
    orbitsPaused: false,
    resetPlayback() {
      state.rotationPaused = false;
      state.orbitsPaused = false;
      sync();
    },
  };

  const rotationBtn = document.createElement("button");
  const orbitsBtn = document.createElement("button");
  const sync = () => {
    rotationBtn.textContent = `${state.rotationPaused ? "▶" : "⏸"} rotation (R)`;
    orbitsBtn.textContent = `${state.orbitsPaused ? "▶" : "⏸"} orbits (O)`;
  };
  rotationBtn.addEventListener("click", () => {
    state.rotationPaused = !state.rotationPaused;
    sync();
  });
  orbitsBtn.addEventListener("click", () => {
    state.orbitsPaused = !state.orbitsPaused;
    sync();
  });
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "⌂ reset (H)";
  resetBtn.addEventListener("click", onReset);

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "r" || e.key === "R") rotationBtn.click();
    if (e.key === "o" || e.key === "O") orbitsBtn.click();
    if (e.key === "h" || e.key === "H") resetBtn.click();
  });

  sync();
  el.append(rotationBtn, orbitsBtn, resetBtn);
  return state;
}
