import { readdirSync, rmSync, statSync } from "fs";
import { join } from "path";

/**
 * Clean script to remove all generated files (dist folders and .tsbuildinfo files)
 * This ensures incremental builds don't get out of sync
 */

const packagesDir = join(process.cwd(), "packages");
const appsDir = join(process.cwd(), "apps");

function cleanDirectory(dir: string) {
  try {
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Remove dist, .turbo, and .next folders
        if (item === "dist" || item === ".turbo" || item === ".next") {
          console.log(`Removing: ${fullPath}`);
          rmSync(fullPath, { recursive: true, force: true });
        } else if (item !== "node_modules") {
          // Recurse into subdirectories (except node_modules)
          cleanDirectory(fullPath);
        }
      } else if (item.endsWith(".tsbuildinfo")) {
        // Remove .tsbuildinfo files
        console.log(`Removing: ${fullPath}`);
        rmSync(fullPath, { force: true });
      }
    }
  } catch (error) {
    console.error(`Error cleaning ${dir}:`, error);
  }
}

console.log("🧹 Cleaning all generated files...\n");

console.log("Cleaning packages...");
cleanDirectory(packagesDir);

console.log("\nCleaning apps...");
cleanDirectory(appsDir);

console.log("\nCleaning root cache directories...");
const rootCacheDirs = [
  join(process.cwd(), "node_modules", ".cache", "turbo"),
  join(process.cwd(), ".turbo"),
];

for (const cacheDir of rootCacheDirs) {
  try {
    console.log(`Removing: ${cacheDir}`);
    rmSync(cacheDir, { recursive: true, force: true });
  } catch (error) {
    // Directory doesn't exist, skip silently
  }
}

console.log("\n✅ Clean complete!");
