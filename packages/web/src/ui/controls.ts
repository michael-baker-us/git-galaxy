export interface PlaybackState {
  rotationPaused: boolean;
  orbitsPaused: boolean;
}

/**
 * Two independent toggles: galaxy rotation (disc spin + camera drift) and
 * orbital motion of planets/satellites. Buttons plus R / O keyboard shortcuts.
 */
export function mountControls(el: HTMLElement): PlaybackState {
  const state: PlaybackState = { rotationPaused: false, orbitsPaused: false };

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
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "r" || e.key === "R") rotationBtn.click();
    if (e.key === "o" || e.key === "O") orbitsBtn.click();
  });

  sync();
  el.append(rotationBtn, orbitsBtn);
  return state;
}
