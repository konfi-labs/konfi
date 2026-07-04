#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageRoot));
const unitSeparator = "\x1f";

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: packageRoot,
    env: process.env,
    stdio: "inherit",
    ...options,
  });
}

function commandOutput(command, args) {
  return execFileSync(command, args, {
    cwd: packageRoot,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function existingDirectory(path) {
  return path && existsSync(path) ? resolve(path) : undefined;
}

function defaultCargoHome() {
  return existingDirectory(process.env.CARGO_HOME) ??
    existingDirectory(resolve(homedir(), ".cargo"));
}

function defaultRustupHome() {
  return existingDirectory(process.env.RUSTUP_HOME) ??
    existingDirectory(resolve(homedir(), ".rustup"));
}

function rustSysroot() {
  const sysroot = commandOutput("rustc", ["--print", "sysroot"]);
  return existingDirectory(sysroot);
}

function remapFlags() {
  const prefixes = [
    [repoRoot, "/workspace"],
    [packageRoot, "/workspace/packages/wasm"],
    [defaultCargoHome(), "/cargo"],
    [defaultRustupHome(), "/rustup"],
    [rustSysroot(), "/rustup/toolchain"],
  ];
  const seen = new Set();

  return prefixes.flatMap(([from, to]) => {
    if (!from || seen.has(from)) {
      return [];
    }

    seen.add(from);
    return ["--remap-path-prefix", `${from}=${to}`];
  });
}

function cargoEnv() {
  const existing = process.env.CARGO_ENCODED_RUSTFLAGS
    ? process.env.CARGO_ENCODED_RUSTFLAGS.split(unitSeparator)
    : [];
  const flags = [...existing, ...remapFlags()];

  return {
    ...process.env,
    CARGO_ENCODED_RUSTFLAGS: flags.join(unitSeparator),
  };
}

run("cargo", ["build", "--target", "wasm32-unknown-unknown", "--release"], {
  env: cargoEnv(),
});
run("wasm-bindgen", [
  "target/wasm32-unknown-unknown/release/wasm.wasm",
  "--out-dir",
  "dist",
  "--target",
  "experimental-nodejs-module",
]);
run("wasm-bindgen", [
  "target/wasm32-unknown-unknown/release/wasm.wasm",
  "--out-dir",
  "dist-web",
  "--target",
  "web",
]);
run("node", ["scripts/normalize-wasm-bindgen-output.mjs"]);
run("node", ["scripts/sync-admin-public-wasm.mjs"]);
