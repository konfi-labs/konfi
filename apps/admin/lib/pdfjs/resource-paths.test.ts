import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPdfJsResourcePaths,
  resolvePdfJsPackageRoot,
} from "./resource-paths";

describe("pdfjs resource paths", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a string package.json path when require.resolve returns one", () => {
    const repoRoot = path.resolve("repo-root");
    const packageJsonPath = path.join(
      repoRoot,
      "node_modules",
      "pdfjs-dist",
      "package.json",
    );

    expect(
      resolvePdfJsPackageRoot({
        resolvedPackageJsonPath: packageJsonPath,
      }),
    ).toBe(path.dirname(packageJsonPath));
  });

  it("falls back to walking up from the runtime directories when bundlers return numeric module ids", () => {
    const repoRoot = path.resolve("repo-root");
    const packageJsonPath = path.join(
      repoRoot,
      "node_modules",
      "pdfjs-dist",
      "package.json",
    );
    const existsSyncSpy = vi
      .spyOn(fs, "existsSync")
      .mockImplementation((candidatePath) => {
        if (typeof candidatePath !== "string") {
          return false;
        }

        return path.normalize(candidatePath) === path.normalize(packageJsonPath);
      });

    expect(
      resolvePdfJsPackageRoot({
        cwd: path.join(repoRoot, "apps", "admin"),
        resolvedPackageJsonPath: 201645,
        startDir: path.join(repoRoot, "apps", "admin", ".next", "server"),
      }),
    ).toBe(path.dirname(packageJsonPath));
    expect(existsSyncSpy).toHaveBeenCalled();
  });

  it("falls back to detecting cmaps/ directly when package.json was pruned by NFT", () => {
    const repoRoot = path.resolve("repo-root");
    const packageRoot = path.join(repoRoot, "node_modules", "pdfjs-dist");
    const cMapsDir = path.join(packageRoot, "cmaps");
    const existsSyncSpy = vi
      .spyOn(fs, "existsSync")
      .mockImplementation((candidatePath) => {
        if (typeof candidatePath !== "string") {
          return false;
        }

        return path.normalize(candidatePath) === path.normalize(cMapsDir);
      });

    expect(
      resolvePdfJsPackageRoot({
        cwd: repoRoot,
        resolvedPackageJsonPath: 201645,
        startDir: path.join(repoRoot, "apps", "admin", ".next", "server"),
      }),
    ).toBe(packageRoot);
    expect(existsSyncSpy).toHaveBeenCalled();
  });

  it("builds trailing-slash file urls for pdfjs asset directories", () => {
    const repoRoot = path.resolve("repo-root");
    const packageJsonPath = path.join(
      repoRoot,
      "node_modules",
      "pdfjs-dist",
      "package.json",
    );

    expect(
      createPdfJsResourcePaths({
        resolvedPackageJsonPath: packageJsonPath,
      }),
    ).toEqual({
      cMapsDir: pathToFileURL(
        `${path.join(repoRoot, "node_modules", "pdfjs-dist", "cmaps")}${path.sep}`,
      ).href,
      standardFontsDir: pathToFileURL(
        `${path.join(repoRoot, "node_modules", "pdfjs-dist", "standard_fonts")}${path.sep}`,
      ).href,
    });
  });
});