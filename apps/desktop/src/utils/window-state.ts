import type { BrowserWindow, Rectangle } from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
const DEFAULT_WIDTH = 1400;
const DEFAULT_HEIGHT = 900;

export interface StoredWindowState {
  readonly x?: number;
  readonly y?: number;
  readonly width: number;
  readonly height: number;
  readonly maximized: boolean;
  readonly zoomFactor: number;
}

export const sanitizeWindowState = (
  candidate: Partial<StoredWindowState> | null | undefined,
  displays: readonly Rectangle[],
): StoredWindowState => {
  const width =
    typeof candidate?.width === "number" && candidate.width >= MIN_WIDTH
      ? Math.round(candidate.width)
      : DEFAULT_WIDTH;
  const height =
    typeof candidate?.height === "number" && candidate.height >= MIN_HEIGHT
      ? Math.round(candidate.height)
      : DEFAULT_HEIGHT;
  const x = typeof candidate?.x === "number" ? Math.round(candidate.x) : undefined;
  const y = typeof candidate?.y === "number" ? Math.round(candidate.y) : undefined;
  const hasVisibleOrigin =
    x === undefined ||
    y === undefined ||
    displays.some((display) => {
      const area = display;
      return (
        x >= area.x &&
        y >= area.y &&
        x < area.x + area.width &&
        y < area.y + area.height
      );
    });

  return {
    ...(hasVisibleOrigin && x !== undefined && y !== undefined ? { x, y } : {}),
    width,
    height,
    maximized: candidate?.maximized === true,
    zoomFactor:
      typeof candidate?.zoomFactor === "number" &&
      candidate.zoomFactor >= 0.25 &&
      candidate.zoomFactor <= 5
        ? candidate.zoomFactor
        : 1,
  };
};

export const getWindowStatePath = (userDataPath: string) =>
  path.join(userDataPath, "window-state.json");

export const loadWindowState = async (
  userDataPath: string,
  displays: readonly Rectangle[],
): Promise<StoredWindowState> => {
  try {
    const raw = await fs.readFile(getWindowStatePath(userDataPath), "utf-8");
    return sanitizeWindowState(JSON.parse(raw) as Partial<StoredWindowState>, displays);
  } catch {
    return sanitizeWindowState(null, displays);
  }
};

export const saveWindowState = async (
  userDataPath: string,
  window: BrowserWindow,
) => {
  const bounds = window.getNormalBounds();
  const state: StoredWindowState = {
    ...bounds,
    maximized: window.isMaximized(),
    zoomFactor: window.webContents.getZoomFactor(),
  };
  await fs.writeFile(
    getWindowStatePath(userDataPath),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
};
