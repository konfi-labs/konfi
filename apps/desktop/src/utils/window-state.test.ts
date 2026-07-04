import { describe, expect, it } from "vitest";
import { sanitizeWindowState } from "./window-state";

const display = { x: 0, y: 0, width: 1920, height: 1080 };

describe("window state", () => {
  it("restores valid bounds and zoom", () => {
    expect(
      sanitizeWindowState(
        { x: 100, y: 100, width: 1200, height: 800, maximized: true, zoomFactor: 1.25 },
        [display],
      ),
    ).toEqual({
      x: 100,
      y: 100,
      width: 1200,
      height: 800,
      maximized: true,
      zoomFactor: 1.25,
    });
  });

  it("ignores off-screen and too-small bounds", () => {
    expect(
      sanitizeWindowState(
        { x: 5000, y: 5000, width: 200, height: 100, maximized: false, zoomFactor: 9 },
        [display],
      ),
    ).toEqual({
      width: 1400,
      height: 900,
      maximized: false,
      zoomFactor: 1,
    });
  });
});
