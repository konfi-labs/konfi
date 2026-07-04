import { readFileSync, writeFileSync } from "node:fs";

const wasmJsPath = new URL("../dist/wasm.js", import.meta.url);
const wasmJsSource = readFileSync(wasmJsPath, "utf8");

const appAwareLoaderImports = [
  "import { existsSync, readFileSync } from 'node:fs';",
  "import { dirname, join } from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
].join("\n");

const appAwareLoaderBody = [
  "const wasmPathCandidates = [",
  "    process.env.KONFI_WASM_PATH,",
  "    join(process.cwd(), 'public', 'wasm', 'wasm_bg.wasm'),",
  "    join(process.cwd(), 'apps', 'admin', 'public', 'wasm', 'wasm_bg.wasm'),",
  "    join(dirname(fileURLToPath(import.meta.url)), 'wasm_bg.wasm'),",
  "].filter((candidate) => typeof candidate === 'string');",
  "const wasmPath = wasmPathCandidates.find((candidate) => existsSync(candidate));",
  "if (!wasmPath) {",
  "    throw new Error(`Unable to locate wasm_bg.wasm. Checked: ${wasmPathCandidates.join(', ')}`);",
  "}",
  "const wasmBytes = readFileSync(wasmPath);",
].join("\n");

const importPattern = /import \{ readFileSync \} from 'node:fs';/;

const loaderBodyPatterns = [
  /const wasmUrl = new URL\('wasm_bg\.wasm', import\.meta\.url\);\s*const wasmBytes = readFileSync\(wasmUrl\);/,
  /const wasmPath = join\(dirname\(fileURLToPath\(import\.meta\.url\)\), 'wasm_bg\.wasm'\);\s*const wasmBytes = readFileSync\(wasmPath\);/,
];

let normalizedSource = wasmJsSource;

if (importPattern.test(normalizedSource)) {
  normalizedSource = normalizedSource.replace(importPattern, appAwareLoaderImports);
}

for (const pattern of loaderBodyPatterns) {
  if (pattern.test(normalizedSource)) {
    normalizedSource = normalizedSource.replace(pattern, appAwareLoaderBody);
    break;
  }
}

if (normalizedSource === wasmJsSource) {
  throw new Error(
    "Failed to normalize generated wasm.js output because the expected wasm-bindgen snippet was not found.",
  );
}

writeFileSync(wasmJsPath, normalizedSource);
