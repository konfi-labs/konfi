import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(currentFilePath), "..");
const workspaceRoot = path.resolve(desktopRoot, "..", "..");
const packageJsonPath = path.join(desktopRoot, "package.json");

const stripWrappingQuotes = (value) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

const loadMissingEnvFromFile = async (filePath) => {
  try {
    const fileContents = await readFile(filePath, "utf8");

    for (const rawLine of fileContents.split(/\r?\n/u)) {
      const trimmedLine = rawLine.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const normalizedLine = trimmedLine.startsWith("export ")
        ? trimmedLine.slice("export ".length)
        : trimmedLine;
      const separatorIndex = normalizedLine.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const key = normalizedLine.slice(0, separatorIndex).trim();
      const value = normalizedLine.slice(separatorIndex + 1).trim();

      if (!key || process.env[key] !== undefined) {
        continue;
      }

      process.env[key] = stripWrappingQuotes(value);
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    throw error;
  }
};

await loadMissingEnvFromFile(path.join(desktopRoot, ".env"));
await loadMissingEnvFromFile(path.join(workspaceRoot, ".env"));

const isPublishRequested = process.argv.some(
  (arg) => arg === "--publish" || arg.startsWith("--publish="),
);

const normalizeHttpUrlEnv = (key, { required = false } = {}) => {
  const rawValue = process.env[key]?.trim();

  if (!rawValue) {
    if (required) {
      throw new Error(`${key} is required for desktop release packaging.`);
    }
    return null;
  }

  try {
    const url = new URL(rawValue);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Unsupported protocol: ${url.protocol}`);
    }
    return url.toString().replace(/\/$/u, "");
  } catch (error) {
    throw new Error(`${key} must be a valid HTTP(S) URL.`, { cause: error });
  }
};

const parseCsvEnv = (key) =>
  process.env[key]
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const buildConfig = structuredClone(packageJson.build ?? {});
const repoOwner = process.env.DESKTOP_UPDATER_REPO_OWNER?.trim();
const repoName = process.env.DESKTOP_UPDATER_REPO_NAME?.trim();

if (repoOwner && repoName) {
  buildConfig.publish = [
    {
      private: true,
      provider: "github",
      owner: repoOwner,
      repo: repoName,
      releaseType: "release",
      vPrefixedTagName: true,
    },
  ];
} else {
  delete buildConfig.publish;
}

const childEnv = { ...process.env };
const updaterToken = process.env.DESKTOP_UPDATER_GITHUB_TOKEN?.trim();

if (updaterToken) {
  childEnv.GH_TOKEN ??= updaterToken;
  childEnv.GITHUB_RELEASE_TOKEN ??= updaterToken;
  childEnv.GITHUB_TOKEN ??= updaterToken;
}

if (isPublishRequested) {
  if (!repoOwner || !repoName) {
    throw new Error(
      "DESKTOP_UPDATER_REPO_OWNER and DESKTOP_UPDATER_REPO_NAME are required when publishing desktop releases.",
    );
  }

  if (
    !childEnv.GH_TOKEN &&
    !childEnv.GITHUB_RELEASE_TOKEN &&
    !childEnv.GITHUB_TOKEN
  ) {
    throw new Error(
      "DESKTOP_UPDATER_GITHUB_TOKEN is required when publishing desktop releases.",
    );
  }
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "konfi-desktop-builder-"));
const configPath = path.join(tempDir, "electron-builder.config.json");
const runtimeConfigPath = path.join(tempDir, "desktop-config.json");
const cliPath = path.join(
  desktopRoot,
  "node_modules",
  "electron-builder",
  "out",
  "cli",
  "cli.js",
);

const runtimeConfig = {
  adminUrl: normalizeHttpUrlEnv("KONFI_DESKTOP_ADMIN_URL", {
    required: isPublishRequested,
  }),
  companyUrl: normalizeHttpUrlEnv("KONFI_DESKTOP_COMPANY_URL"),
  allowedOrigins: parseCsvEnv("KONFI_DESKTOP_ALLOWED_ORIGINS"),
};

const hasRuntimeConfig = Object.values(runtimeConfig).some((value) =>
  Array.isArray(value) ? value.length > 0 : Boolean(value),
);

if (hasRuntimeConfig) {
  const existingExtraResources =
    buildConfig.extraResources === undefined
      ? []
      : Array.isArray(buildConfig.extraResources)
        ? buildConfig.extraResources
        : [buildConfig.extraResources];

  await writeFile(runtimeConfigPath, JSON.stringify(runtimeConfig, null, 2));
  buildConfig.extraResources = [
    ...existingExtraResources,
    {
      from: runtimeConfigPath,
      to: "desktop-config.json",
    },
  ];
}

await writeFile(configPath, JSON.stringify(buildConfig, null, 2));

const args = [cliPath, "--config", configPath, ...process.argv.slice(2)];

try {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: desktopRoot,
      env: childEnv,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(
        new Error(`electron-builder exited with code ${code ?? "unknown"}.`),
      );
    });
  });
} finally {
  await rm(tempDir, { force: true, recursive: true });
}
