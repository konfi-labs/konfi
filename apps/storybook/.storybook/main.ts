import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineMain } from "@storybook/nextjs-vite/node";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const storybookRoot = path.resolve(configDirectory, "..");
const repoRoot = path.resolve(storybookRoot, "..", "..");
const adminRoot = path.join(repoRoot, "apps", "admin");
const storeRoot = path.join(repoRoot, "apps", "store");
const componentsRoot = path.join(repoRoot, "packages", "components", "src");
const storybookSourceRoot = path.join(storybookRoot, "src");
const disabledSandpackReactModuleId = "\0konfi-disabled-sandpack-react";
const disabledSandpackReactSource = `
function createDisabledSandpackExport(exportName) {
  return function DisabledSandpackExport() {
    throw new Error(
      "@codesandbox/sandpack-react is not installed in Konfi Storybook; " +
        exportName +
        " is unavailable because MDXEditor Sandpack plugins are disabled.",
    );
  };
}

export const SandpackProvider =
  createDisabledSandpackExport("SandpackProvider");
export const SandpackLayout = createDisabledSandpackExport("SandpackLayout");
export const SandpackCodeEditor =
  createDisabledSandpackExport("SandpackCodeEditor");
export const SandpackPreview = createDisabledSandpackExport("SandpackPreview");

export function useSandpack() {
  throw new Error(
    "@codesandbox/sandpack-react is not installed in Konfi Storybook; useSandpack is unavailable because MDXEditor Sandpack plugins are disabled.",
  );
}
`;

const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"];
const storyFilePattern = /\.stories\.(js|jsx|mjs|ts|tsx)$/;
const mdxFilePattern = /\.mdx$/;
const ignoredStoryScanDirectories = new Set([
  ".next",
  ".turbo",
  "build",
  "dist",
  "node_modules",
  "storybook-static",
]);

function normalizePath(value: string) {
  return value.replace(/\\/g, "/");
}

function hasMatchingFile(directory: string, pattern: RegExp): boolean {
  if (!existsSync(directory)) {
    return false;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoredStoryScanDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory() && hasMatchingFile(entryPath, pattern)) {
      return true;
    }

    if (entry.isFile() && pattern.test(entry.name)) {
      return true;
    }
  }

  return false;
}

function resolveExistingFile(candidate: string) {
  for (const extension of extensions) {
    const filePath = `${candidate}${extension}`;

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return filePath;
    }
  }

  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    for (const extension of extensions.slice(1)) {
      const indexPath = path.join(candidate, `index${extension}`);

      if (existsSync(indexPath) && statSync(indexPath).isFile()) {
        return indexPath;
      }
    }
  }

  return undefined;
}

function getImporterAppRoot(importer: string | undefined) {
  const normalizedImporter = normalizePath(importer ?? "");

  if (normalizedImporter.includes("/apps/admin/")) {
    return adminRoot;
  }

  if (normalizedImporter.includes("/apps/store/")) {
    return storeRoot;
  }

  return undefined;
}

function resolveAppAlias(source: string, appRoot: string) {
  const aliases = [
    ["@/components/", "app/[lng]/components/"],
    ["@/i18n/", "app/i18n/"],
    ["@/lib/", "lib/"],
    ["@/theme/", "theme/"],
    ["@/hooks/", "hooks/"],
    ["@/context/", "context/"],
    ["@/actions/", "app/actions/"],
    ["components/", "app/[lng]/components/"],
    ["i18n/", "app/i18n/"],
    ["lib/", "lib/"],
    ["theme/", "theme/"],
    ["hooks/", "hooks/"],
    ["context/", "context/"],
    ["actions/", "app/actions/"],
    ["app/", "app/"],
  ] as const;

  if (source === "@/actions" || source === "actions") {
    return path.join(appRoot, "app", "actions", "index");
  }

  for (const [prefix, replacement] of aliases) {
    if (source.startsWith(prefix)) {
      return path.join(appRoot, replacement, source.slice(prefix.length));
    }
  }

  return undefined;
}

function konfiAppAliasPlugin() {
  return {
    name: "konfi-app-aliases",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      const appRoot = getImporterAppRoot(importer);

      if (!appRoot) {
        return undefined;
      }

      const aliasedPath = resolveAppAlias(source, appRoot);

      if (!aliasedPath) {
        return undefined;
      }

      return resolveExistingFile(aliasedPath);
    },
  };
}

function disabledSandpackReactPlugin() {
  return {
    name: "konfi-disabled-sandpack-react",
    enforce: "pre" as const,
    resolveId(source: string) {
      if (source === "@codesandbox/sandpack-react") {
        return disabledSandpackReactModuleId;
      }

      return undefined;
    },
    load(id: string) {
      if (id === disabledSandpackReactModuleId) {
        return disabledSandpackReactSource;
      }

      return undefined;
    },
  };
}

export default defineMain({
  framework: "@storybook/nextjs-vite",
  stories: [
    ...(hasMatchingFile(storybookSourceRoot, mdxFilePattern)
      ? ["../src/**/*.mdx"]
      : []),
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    ...(hasMatchingFile(adminRoot, storyFilePattern)
      ? ["../../admin/**/*.stories.@(js|jsx|mjs|ts|tsx)"]
      : []),
    ...(hasMatchingFile(storeRoot, storyFilePattern)
      ? ["../../store/**/*.stories.@(js|jsx|mjs|ts|tsx)"]
      : []),
    ...(hasMatchingFile(componentsRoot, storyFilePattern)
      ? ["../../../packages/components/src/**/*.stories.@(js|jsx|mjs|ts|tsx)"]
      : []),
  ],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-themes",
    "@storybook/addon-mcp",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
  typescript: {
    check: false,
  },
  async viteFinal(viteConfig) {
    viteConfig.optimizeDeps = {
      ...viteConfig.optimizeDeps,
      exclude: Array.from(
        new Set([
          ...(viteConfig.optimizeDeps?.exclude ?? []),
          "@codesandbox/sandpack-react",
          "@mdxeditor/editor",
        ]),
      ),
    };
    viteConfig.plugins = [
      disabledSandpackReactPlugin(),
      konfiAppAliasPlugin(),
      ...(viteConfig.plugins ?? []),
    ];
    viteConfig.server = {
      ...viteConfig.server,
      fs: {
        ...viteConfig.server?.fs,
        allow: Array.from(
          new Set([...(viteConfig.server?.fs?.allow ?? []), repoRoot]),
        ),
      },
    };

    return viteConfig;
  },
});
