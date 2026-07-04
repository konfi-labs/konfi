import * as fs from "fs/promises";
import * as path from "path";

/* eslint-disable turbo/no-undeclared-env-vars */

// Compute directories where bundled Ghostscript may live
export const getBundledToolDirs = (isPackaged: boolean): string[] => {
  const dirs: string[] = [];

  if (isPackaged) {
    // Preferred: extraResources output
    dirs.push(
      path.join(process.resourcesPath, "ghostscript"),
      path.join(process.resourcesPath, "ghostscript", "bin"),
    );

    // Fallback: if asarUnpack was used, executables may be here
    const unpackedRoot = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "resources",
    );
    dirs.push(
      path.join(unpackedRoot, "ghostscript"),
      path.join(unpackedRoot, "ghostscript", "bin"),
    );
  } else {
    // Dev: run from repo
    const projectRoot = path.resolve(__dirname, "..", "..");
    const resRoot = path.join(projectRoot, "resources");
    dirs.push(
      path.join(resRoot, "ghostscript"),
      path.join(resRoot, "ghostscript", "bin"),
    );
  }
  return dirs;
};

// Try to resolve Ghostscript executable path from bundled dirs explicitly
export const resolveBundledExecutable = async (
  command: string,
  isPackaged: boolean,
): Promise<string | null> => {
  const candidates = (() => {
    if (process.platform === "win32") {
      switch (command) {
        case "gswin64c":
          return ["gswin64c.exe"];
        case "gswin32c":
          return ["gswin32c.exe"];
        case "gs":
          return ["gs.exe", "gswin64c.exe", "gswin32c.exe"];
        default:
          return [`${command}.exe`];
      }
    }
    return [command];
  })();

  const dirs = getBundledToolDirs(isPackaged);
  for (const d of dirs) {
    for (const c of candidates) {
      const full = path.join(d, c);
      try {
        await fs.access(full);
        return full;
      } catch {
        // continue
      }
    }
  }
  return null;
};

// Prepend bundled tool dirs to PATH so child processes (gm/gs) can be found
export const augmentPATHWithBundledTools = (isPackaged: boolean) => {
  const sep = process.platform === "win32" ? ";" : ":";
  const dirs = getBundledToolDirs(isPackaged);
  const unique = Array.from(new Set(dirs.filter(Boolean)));
  if (unique.length > 0) {
    process.env.PATH = `${unique.join(sep)}${sep}${process.env.PATH ?? ""}`;
    console.log("Prepended bundled tool dirs to PATH:", unique);
  }
};

// Configure Ghostscript environment (set GS_LIB to find lib and Resource folders)
export const configureGhostscriptEnv = async (isPackaged: boolean) => {
  // Prefer a 64-bit Ghostscript if present, else 32-bit, else any 'gs'
  const gsPath =
    (await resolveBundledExecutable("gswin64c", isPackaged)) ||
    (await resolveBundledExecutable("gswin32c", isPackaged)) ||
    (await resolveBundledExecutable("gs", isPackaged));

  if (gsPath) {
    process.env.GS_PROG = gsPath;

    // Attempt to set GS_LIB to include both lib and Resource
    const exeDir = path.dirname(gsPath);
    const candDirs = [
      // typical structure when exe is in ghostscript/bin
      path.join(exeDir, "..", "lib"),
      path.join(exeDir, "..", "Resource"),
      // fallback variants
      path.join(exeDir, "lib"),
      path.join(exeDir, "Resource"),
    ].map((p) => path.normalize(p));

    const existing: string[] = [];
    for (const d of candDirs) {
      try {
        await fs.access(d);
        existing.push(d);
      } catch {
        // ignore
      }
    }

    if (existing.length > 0) {
      const sep = process.platform === "win32" ? ";" : ":";
      process.env.GS_LIB = Array.from(new Set(existing)).join(sep);
    }
  }

  console.log("Ghostscript env configured:", {
    GS_PROG: process.env.GS_PROG,
    GS_LIB: process.env.GS_LIB,
  });
};
