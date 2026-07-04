import "server-only";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type PdfJsResourcePaths = {
  cMapsDir: string;
  standardFontsDir: string;
};

type ResolvePdfJsPackageRootParams = {
  cwd?: string;
  packageName?: string;
  resolvedPackageJsonPath?: unknown;
  startDir?: string;
};

function toPdfJsFactoryUrl(dirPath: string): string {
  const withTrailingSeparator = dirPath.endsWith(path.sep)
    ? dirPath
    : `${dirPath}${path.sep}`;

  return pathToFileURL(withTrailingSeparator).href;
}

function findPackageRootFromDirectory(params: {
  packageName: string;
  startDirectory: string;
}): string | null {
  const { packageName, startDirectory } = params;
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    const candidatePackageRoot = path.join(
      currentDirectory,
      "node_modules",
      packageName,
    );
    const packageJsonPath = path.join(candidatePackageRoot, "package.json");
    const cMapsDir = path.join(candidatePackageRoot, "cmaps");

    // `package.json` is the canonical marker, but Next.js File Tracing on
    // Vercel sometimes prunes it even when the asset directories are kept
    // (see `outputFileTracingIncludes` in apps/admin/next.config.mjs). Fall
    // back to detecting `cmaps/` directly so the resolver still works in
    // those traced bundles.
    if (fs.existsSync(packageJsonPath) || fs.existsSync(cMapsDir)) {
      return candidatePackageRoot;
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

export function resolvePdfJsPackageRoot(
  params: ResolvePdfJsPackageRootParams = {},
): string {
  const {
    cwd = process.cwd(),
    packageName = "pdfjs-dist",
    resolvedPackageJsonPath,
    startDir = cwd,
  } = params;

  if (typeof resolvedPackageJsonPath === "string") {
    return path.dirname(resolvedPackageJsonPath);
  }

  for (const candidateDirectory of new Set([cwd, startDir])) {
    const packageRoot = findPackageRootFromDirectory({
      packageName,
      startDirectory: candidateDirectory,
    });

    if (packageRoot) {
      return packageRoot;
    }
  }

  throw new Error(
    `Unable to resolve ${packageName} package root for PDF.js assets.`,
  );
}

export function createPdfJsResourcePaths(
  params: ResolvePdfJsPackageRootParams = {},
): PdfJsResourcePaths {
  const pdfJsPackageRoot = resolvePdfJsPackageRoot(params);

  return {
    cMapsDir: toPdfJsFactoryUrl(path.join(pdfJsPackageRoot, "cmaps")),
    standardFontsDir: toPdfJsFactoryUrl(
      path.join(pdfJsPackageRoot, "standard_fonts"),
    ),
  };
}