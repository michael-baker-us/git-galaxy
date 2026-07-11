import { describe, expect, it } from "vitest";
import { commitTemperatureColor, extColor, folderColor, hslToRgb } from "./color";

describe("commitTemperatureColor", () => {
  it("renders the newest commits blue-white (blue dominates red)", () => {
    const [r, , b] = commitTemperatureColor(0);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeCloseTo(1.0);
  });

  it("renders the oldest commits deep red (red dominates blue)", () => {
    const [r, , b] = commitTemperatureColor(1);
    expect(r).toBeGreaterThan(b);
    expect(r).toBeCloseTo(1.0);
  });

  it("renders the midpoint as warm white (all channels bright)", () => {
    for (const channel of commitTemperatureColor(0.5)) {
      expect(channel).toBeGreaterThan(0.8);
    }
  });

  it("clamps out-of-range input", () => {
    expect(commitTemperatureColor(-2)).toEqual(commitTemperatureColor(0));
    expect(commitTemperatureColor(7)).toEqual(commitTemperatureColor(1));
  });
});

describe("hslToRgb", () => {
  it("converts primaries", () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual([1, 0, 0]);
    expect(hslToRgb(120, 1, 0.5)).toEqual([0, 1, 0]);
    expect(hslToRgb(240, 1, 0.5)).toEqual([0, 0, 1]);
  });

  it("handles negative and wrapped hues", () => {
    expect(hslToRgb(-120, 1, 0.5)).toEqual(hslToRgb(240, 1, 0.5));
    expect(hslToRgb(480, 1, 0.5)).toEqual(hslToRgb(120, 1, 0.5));
  });
});

describe("extColor / folderColor", () => {
  it("is stable for the same input", () => {
    expect(extColor("ts")).toEqual(extColor("ts"));
    expect(extColor("weirdext")).toEqual(extColor("weirdext"));
    expect(folderColor("src")).toEqual(folderColor("src"));
  });

  it("returns channels in [0, 1] even for unknown extensions", () => {
    for (const ext of ["", "zig", "☃"]) {
      for (const channel of extColor(ext)) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});
