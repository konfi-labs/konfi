#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import { basename, join } from "node:path";

const cwd = process.cwd();

function run(command, args = []) {
  try {
    const executable = process.platform === "win32" && ["pnpm", "bun", "npm", "npx"].includes(command)
      ? `${command}.cmd`
      : command;
    return execFileSync(executable, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function statusSummary() {
  const lines = run("git", ["status", "--short"]).split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return "clean";
  const shown = lines.slice(0, 20).join("\n");
  const suffix = lines.length > 20 ? `\n... ${lines.length - 20} more` : "";
  return `${lines.length} changed file(s)\n${shown}${suffix}`;
}

function packageManagerVersion(packageManager = "") {
  const [manager] = packageManager.split("@");
  if (!manager) return "";
  if (process.platform === "win32" && ["pnpm", "bun", "npm", "yarn"].includes(manager)) {
    try {
      return execFileSync(`${manager} --version`, {
        cwd,
        encoding: "utf8",
        shell: true,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "";
    }
  }
  return run(manager, ["--version"]);
}

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(250);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

const root = run("git", ["rev-parse", "--show-toplevel"]) || cwd;
const pkg = readJson(join(root, "package.json")) ?? {};
const packageManager = pkg.packageManager ?? "";
const commonScripts = [
  "agent:context",
  "dev",
  "test",
  "lint",
  "build",
  "build:agent",
  "build:ci",
].filter((name) => pkg.scripts?.[name]);
const ports = [
  ["store", 3000],
  ["admin", 3001],
];
const portStates = await Promise.all(
  ports.map(async ([name, port]) => `${name}:${port}=${(await checkPort(port)) ? "listening" : "closed"}`),
);

console.log(`repo: ${root}`);
console.log(`branch: ${run("git", ["branch", "--show-current"]) || "unknown"}`);
console.log(`node: ${process.version}`);
if (packageManager) {
  const version = packageManagerVersion(packageManager);
  console.log(`packageManager: ${packageManager}${version ? ` (installed ${version})` : ""}`);
}
console.log(`scripts: ${commonScripts.join(", ") || "none detected"}`);
console.log(`ports: ${portStates.join(", ")}`);
console.log("status:");
console.log(statusSummary());
