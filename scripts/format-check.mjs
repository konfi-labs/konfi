import { execFileSync, spawnSync } from "node:child_process";

const formattableExtension = /\.(m?[jt]sx?|jsonc?|mdx?|ya?ml)$/;
const skippedPath =
  /(^|\/)(\.next|\.turbo|build|client|coverage|dist|dist-web|node_modules|out|storybook-static|target)(\/|$)/;

function git(args) {
  const output = execFileSync("git", args, { encoding: "utf8" }).trim();
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function getChangedFiles() {
  try {
    if (process.env.GITHUB_BASE_REF) {
      const base = execFileSync(
        "git",
        ["merge-base", "HEAD", `origin/${process.env.GITHUB_BASE_REF}`],
        { encoding: "utf8" },
      ).trim();

      return git([
        "diff",
        "--name-only",
        "--diff-filter=ACMR",
        `${base}...HEAD`,
      ]);
    }

    if (process.env.CI) {
      return git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
    }

    return [
      ...git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]),
      ...git(["ls-files", "--others", "--exclude-standard"]),
    ];
  } catch {
    return [];
  }
}

const files = [...new Set(getChangedFiles())]
  .map((file) => file.replaceAll("\\", "/"))
  .filter((file) => formattableExtension.test(file) && !skippedPath.test(file));

if (files.length === 0) {
  console.log("No changed formattable files.");
  process.exit(0);
}

const result = spawnSync("pnpm", ["exec", "oxfmt", "--check", ...files], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
