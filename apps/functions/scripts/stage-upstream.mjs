import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isolate } from "isolate-package";

function loadIsolateConfig() {
  const configPath = resolve(process.cwd(), "isolate.config.json");

  if (!existsSync(configPath)) {
    return {};
  }

  const rawConfig = readFileSync(configPath, "utf8");
  return JSON.parse(rawConfig);
}

try {
  const existingConfig = loadIsolateConfig();

  await isolate({
    ...existingConfig,
    isolateDirName: ".deploy",
  });

  console.log("Upstream deploy staging prepared in .deploy");
} catch (error) {
  console.error("Failed to prepare upstream deploy staging:", error);
  process.exit(1);
}