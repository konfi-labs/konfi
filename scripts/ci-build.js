#!/usr/bin/env node
/**
 * CI Build Wrapper Script
 * Cross-platform script to run CI builds with font swapping
 */

const { spawn } = require("child_process");
const path = require("path");

const swapFontsScript = path.join(__dirname, "ci-swap-fonts.js");
const restoreFontsScript = path.join(__dirname, "ci-restore-fonts.js");
const rootDir = path.join(__dirname, "..");

const args = process.argv.slice(2);
const agentCache = args.includes("--agent-cache");
const unknownArgs = args.filter((arg) => arg !== "--agent-cache");

let cleanupStarted = false;

async function restoreFonts() {
  if (cleanupStarted) {
    return;
  }

  cleanupStarted = true;

  try {
    console.log("🔄 Restoring original fonts...");
    await runScript(restoreFontsScript);
  } catch (restoreError) {
    console.error(
      "⚠️  Warning: Failed to restore fonts:",
      restoreError.message,
    );
  }
}

async function exitWithCleanup(exitCode) {
  await restoreFonts();
  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void exitWithCleanup(130);
});

process.on("SIGTERM", () => {
  void exitWithCleanup(143);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error);
  void exitWithCleanup(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled rejection:", reason);
  void exitWithCleanup(1);
});

async function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath], {
      stdio: "inherit",
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Script ${scriptPath} exited with code ${code}`));
      } else {
        resolve();
      }
    });

    proc.on("error", reject);
  });
}

async function runBuild() {
  return new Promise((resolve, reject) => {
    const dotenvCliScript = path.join(
      rootDir,
      "node_modules",
      "dotenv-cli",
      "cli.js",
    );
    const buildArgs = ["-e", ".env.ci", "--", "turbo", "run", "build:ci"];

    if (agentCache) {
      buildArgs.push(
        "--cache=local:r",
        "--cache-dir",
        ".tmp/codex-turbo-cache",
      );
    }

    const proc = spawn(process.execPath, [dotenvCliScript, ...buildArgs], {
      stdio: "inherit",
      cwd: rootDir,
    });

    proc.on("close", (code) => {
      resolve(code);
    });

    proc.on("error", reject);
  });
}

async function main() {
  let buildExitCode = 0;

  if (unknownArgs.length > 0) {
    console.error(`❌ Unknown arguments: ${unknownArgs.join(", ")}`);
    process.exit(1);
  }

  try {
    // Step 1: Swap fonts
    console.log("🔄 Swapping fonts for CI build...");
    await runScript(swapFontsScript);

    // Step 2: Run build
    console.log("🏗️  Running CI build...");
    buildExitCode = await runBuild();
  } catch (error) {
    console.error("❌ Build failed:", error.message);
    buildExitCode = 1;
  } finally {
    // Step 3: Always restore fonts
    await restoreFonts();
  }

  process.exit(buildExitCode);
}

main();
