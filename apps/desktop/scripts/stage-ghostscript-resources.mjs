import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdtemp,
  mkdir,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const GHOSTSCRIPT_VERSION = "10.06.0";
const GHOSTSCRIPT_TAG = "gs10060";
const DOWNLOAD_BASE_URL =
  "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const resourcesRoot = path.join(appRoot, "resources");
const bundledGhostscriptRoot = path.join(resourcesRoot, "ghostscript");

const argv = new Set(process.argv.slice(2));
const verifyOnly = argv.has("--verify");
const ciMode = argv.has("--ci");
const force = argv.has("--force");

const artifacts = {
  source: {
    name: `ghostscript-${GHOSTSCRIPT_VERSION}.tar.xz`,
    sha256:
      "64352648c2c081c8a9fb1a12dc1965e01ead7c57f58b72d1b54f6ef1cef3c561",
  },
  windowsX64: {
    name: "gs10060w64.exe",
    sha256:
      "8d552205c0fe87a16bac2f377c8a1b090cfcbc610db7c281bd6a646b39c9c468",
  },
};

const pathExists = async (targetPath) => {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
};

const run = async (command, args, options = {}) => {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
};

const getDownloadUrl = (artifactName) =>
  `${DOWNLOAD_BASE_URL}/${GHOSTSCRIPT_TAG}/${artifactName}`;

const sha256File = async (filePath) => {
  const hash = createHash("sha256");
  const input = createReadStream(filePath);

  await new Promise((resolve, reject) => {
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", reject);
    input.on("end", resolve);
  });

  return hash.digest("hex");
};

const downloadArtifact = async (artifact, tempDir) => {
  const targetPath = path.join(tempDir, artifact.name);
  const response = await fetch(getDownloadUrl(artifact.name));

  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download ${artifact.name}: ${response.status} ${response.statusText}`,
    );
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath));

  const actualSha256 = await sha256File(targetPath);
  if (actualSha256 !== artifact.sha256) {
    throw new Error(
      `Checksum mismatch for ${artifact.name}. Expected ${artifact.sha256}, got ${actualSha256}.`,
    );
  }

  return targetPath;
};

const hasGhostscriptExecutable = async (root) => {
  const binDir = path.join(root, "bin");
  const candidates =
    process.platform === "win32"
      ? ["gswin64c.exe", "gswin32c.exe", "gs.exe"]
      : ["gs"];

  for (const candidate of candidates) {
    if (await pathExists(path.join(binDir, candidate))) {
      return true;
    }
  }

  return false;
};

const hasLicenseNotice = async (root) => {
  const candidates = [
    "LICENSE",
    "COPYING",
    "COPYING.txt",
    path.join("doc", "COPYING"),
    path.join("doc", "LICENSE"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(path.join(root, candidate))) {
      return true;
    }
  }

  return false;
};

const hasGhostscriptBundle = async (root) => {
  const [hasExecutable, hasLib, hasResource, hasLicense] = await Promise.all([
    hasGhostscriptExecutable(root),
    pathExists(path.join(root, "lib")),
    pathExists(path.join(root, "Resource")),
    hasLicenseNotice(root),
  ]);

  return hasExecutable && hasLib && hasResource && hasLicense;
};

const assertGhostscriptBundle = async (root) => {
  if (await hasGhostscriptBundle(root)) {
    return;
  }

  throw new Error(
    `Ghostscript bundle at ${root} is incomplete. Expected bin, lib, Resource, executable, and license/notice files.`,
  );
};

const compareVersionsDescending = (left, right) =>
  right.localeCompare(left, undefined, {
    numeric: true,
    sensitivity: "base",
  });

const findWindowsGhostscriptInstall = async (preferredRoot = null) => {
  const installRoots = [
    preferredRoot,
    path.join("C:\\", "Program Files", "gs"),
    path.join("C:\\", "Program Files (x86)", "gs"),
  ].filter(Boolean);
  const discoveredInstalls = [];

  for (const installRoot of installRoots) {
    if (!(await pathExists(installRoot))) {
      continue;
    }

    if (await hasGhostscriptBundle(installRoot)) {
      discoveredInstalls.push(installRoot);
    }

    const entries = await readdir(installRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const candidateRoot = path.join(installRoot, entry.name);
      if (await hasGhostscriptBundle(candidateRoot)) {
        discoveredInstalls.push(candidateRoot);
      }
    }
  }

  discoveredInstalls.sort((left, right) =>
    compareVersionsDescending(path.basename(left), path.basename(right)),
  );

  return discoveredInstalls[0] ?? null;
};

const copyIfExists = async (sourcePath, targetPath) => {
  if (!(await pathExists(sourcePath))) {
    return false;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { recursive: true });
  return true;
};

const stageGhostscriptBundle = async (sourceRoot) => {
  await assertGhostscriptBundle(sourceRoot);
  await mkdir(resourcesRoot, { recursive: true });
  await rm(bundledGhostscriptRoot, { force: true, recursive: true });
  await cp(sourceRoot, bundledGhostscriptRoot, { recursive: true });
  await assertGhostscriptBundle(bundledGhostscriptRoot);
};

const installWindowsGhostscript = async (installerPath, tempDir) => {
  const installRoot = path.join(tempDir, "ghostscript-install");

  await mkdir(installRoot, { recursive: true });
  await run(installerPath, ["/S", `/D=${installRoot}`]);

  const stagedRoot = await findWindowsGhostscriptInstall(installRoot);
  if (!stagedRoot) {
    throw new Error("Silent Ghostscript install did not produce a bundle.");
  }

  return stagedRoot;
};

const stageWindowsCiBundle = async (tempDir) => {
  const installerPath = await downloadArtifact(artifacts.windowsX64, tempDir);
  const installRoot = await installWindowsGhostscript(installerPath, tempDir);
  await stageGhostscriptBundle(installRoot);
};

const extractSource = async (archivePath, tempDir) => {
  const sourceParent = path.join(tempDir, "source");

  await mkdir(sourceParent, { recursive: true });
  await run("tar", ["-xf", archivePath, "-C", sourceParent]);

  const entries = await readdir(sourceParent, { withFileTypes: true });
  const sourceEntry = entries.find(
    (entry) =>
      entry.isDirectory() &&
      entry.name.includes(`ghostscript-${GHOSTSCRIPT_VERSION}`),
  );

  if (!sourceEntry) {
    throw new Error("Unable to locate extracted Ghostscript source directory.");
  }

  return path.join(sourceParent, sourceEntry.name);
};

const buildUnixGhostscript = async (sourceDir, installRoot) => {
  const jobs = String(Math.max(2, os.cpus().length));

  await run(
    "./configure",
    [
      `--prefix=${installRoot}`,
      "--disable-cups",
      "--disable-fontconfig",
      "--disable-gtk",
      "--without-x",
    ],
    { cwd: sourceDir },
  );
  await run("make", ["-j", jobs], { cwd: sourceDir });
  await run("make", ["install"], { cwd: sourceDir });
};

const findUnixShareRoot = async (installRoot) => {
  const shareGhostscriptRoot = path.join(installRoot, "share", "ghostscript");
  const preferred = path.join(shareGhostscriptRoot, GHOSTSCRIPT_VERSION);

  if (await pathExists(preferred)) {
    return preferred;
  }

  const entries = await readdir(shareGhostscriptRoot, { withFileTypes: true });
  const versionEntry = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => compareVersionsDescending(left.name, right.name))[0];

  if (!versionEntry) {
    throw new Error("Unable to locate installed Ghostscript share directory.");
  }

  return path.join(shareGhostscriptRoot, versionEntry.name);
};

const normalizeUnixBundle = async (installRoot, sourceDir, normalizedRoot) => {
  const shareRoot = await findUnixShareRoot(installRoot);

  await rm(normalizedRoot, { force: true, recursive: true });
  await mkdir(normalizedRoot, { recursive: true });
  await cp(path.join(installRoot, "bin"), path.join(normalizedRoot, "bin"), {
    recursive: true,
  });
  await cp(
    path.join(shareRoot, "Resource"),
    path.join(normalizedRoot, "Resource"),
    {
      recursive: true,
    },
  );
  await cp(path.join(shareRoot, "lib"), path.join(normalizedRoot, "lib"), {
    recursive: true,
  });

  await copyIfExists(
    path.join(sourceDir, "LICENSE"),
    path.join(normalizedRoot, "LICENSE"),
  );
  await copyIfExists(
    path.join(sourceDir, "COPYING"),
    path.join(normalizedRoot, "COPYING"),
  );
  await copyIfExists(
    path.join(sourceDir, "doc", "COPYING"),
    path.join(normalizedRoot, "doc", "COPYING"),
  );

  const gsPath = path.join(normalizedRoot, "bin", "gs");
  if (await pathExists(gsPath)) {
    await chmod(gsPath, 0o755);
  }

  await assertGhostscriptBundle(normalizedRoot);
};

const stageUnixCiBundle = async (tempDir) => {
  const archivePath = await downloadArtifact(artifacts.source, tempDir);
  const sourceDir = await extractSource(archivePath, tempDir);
  const installRoot = path.join(tempDir, "ghostscript-install");
  const normalizedRoot = path.join(tempDir, "ghostscript-normalized");

  await buildUnixGhostscript(sourceDir, installRoot);
  await normalizeUnixBundle(installRoot, sourceDir, normalizedRoot);
  await stageGhostscriptBundle(normalizedRoot);
};

const stageLocalWindowsBundle = async () => {
  const installRoot = await findWindowsGhostscriptInstall();

  if (!installRoot) {
    throw new Error(
      "Ghostscript resources are missing. Install Ghostscript on this machine or provide resources/ghostscript with bin, lib, Resource, and license files before packaging.",
    );
  }

  console.log(`[ghostscript] Staging runtime from ${installRoot}`);
  await stageGhostscriptBundle(installRoot);
};

const main = async () => {
  if (verifyOnly) {
    await assertGhostscriptBundle(bundledGhostscriptRoot);
    console.log(
      `[ghostscript] Verified bundled runtime in ${bundledGhostscriptRoot}`,
    );
    return;
  }

  if (!force && (await hasGhostscriptBundle(bundledGhostscriptRoot))) {
    console.log(
      `[ghostscript] Using bundled runtime from ${bundledGhostscriptRoot}`,
    );
    return;
  }

  if (!ciMode) {
    if (process.platform === "win32") {
      await stageLocalWindowsBundle();
      return;
    }

    throw new Error(
      "Ghostscript resources are missing. Run this script with --ci to build a pinned bundle, or provide resources/ghostscript with bin, lib, Resource, and license files.",
    );
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "konfi-ghostscript-"));

  try {
    if (process.platform === "win32") {
      await stageWindowsCiBundle(tempDir);
    } else {
      await stageUnixCiBundle(tempDir);
    }

    console.log(
      `[ghostscript] Ghostscript ${GHOSTSCRIPT_VERSION} resources ready in ${bundledGhostscriptRoot}`,
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
};

main().catch((error) => {
  console.error(
    "[ghostscript]",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
