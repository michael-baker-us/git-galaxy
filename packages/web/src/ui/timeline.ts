export interface TimelineUi {
  /** Reflect playback position (0..1) and its date into the widgets. */
  sync(t: number, dateLabel: string): void;
  setPlaying(playing: boolean): void;
}

const RESOLUTION = 1000;

/**
 * Bottom-center transport: play/pause (T), a scrubber, and the current date.
 * Scrubbing pauses playback and hands position control to the user.
 */
export function mountTimeline(
  el: HTMLElement,
  hooks: { onScrub(t: number): void; onTogglePlay(): void },
): TimelineUi {
  const playBtn = document.createElement("button");
  playBtn.textContent = "⏵ history (T)";
  playBtn.addEventListener("click", hooks.onTogglePlay);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(RESOLUTION);
  slider.value = String(RESOLUTION);
  slider.addEventListener("input", () => hooks.onScrub(Number(slider.value) / RESOLUTION));

  const date = document.createElement("span");
  date.className = "date";

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "t" || e.key === "T") playBtn.click();
  });

  el.append(playBtn, slider, date);
  return {
    sync(t, dateLabel) {
      slider.value = String(Math.round(t * RESOLUTION));
      date.textContent = dateLabel;
    },
    setPlaying(playing) {
      playBtn.textContent = playing ? "⏸ history (T)" : "⏵ history (T)";
    },
  };
}
