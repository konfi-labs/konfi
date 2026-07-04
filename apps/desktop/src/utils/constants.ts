import * as fs from "node:fs";
import * as path from "node:path";

const PACKAGED_CONFIG_FILE_NAME = "desktop-config.json";
const DEFAULT_DEV_ADMIN_URL = "http://localhost:3001";
const DEFAULT_ADMIN_URL = DEFAULT_DEV_ADMIN_URL;
const DEFAULT_COMPANY_URL = "https://example.com";

export interface DesktopRuntimeConfig {
  readonly adminUrl?: string;
  readonly companyUrl?: string;
  readonly allowedOrigins: readonly string[];
}

export interface ResolvedDesktopConfig {
  readonly adminUrl: string;
  readonly devAdminUrl: string;
  readonly companyUrl: string;
  readonly allowedOrigins: readonly string[];
}

const normalizeHttpUrl = (value: string, fallback: string): string => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return fallback;
  }

  try {
    const url = new URL(trimmedValue);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Unsupported protocol: ${url.protocol}`);
    }
    return url.toString().replace(/\/$/u, "");
  } catch (error) {
    console.warn(
      `[Desktop Config] Ignoring invalid URL "${value}", using "${fallback}".`,
      error,
    );
    return fallback;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const normalizeStringList = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeOptionalString(item))
    .filter((item): item is string => Boolean(item));
};

const parseDesktopRuntimeConfig = (value: unknown): DesktopRuntimeConfig => {
  if (!isRecord(value)) {
    return { allowedOrigins: [] };
  }

  return {
    adminUrl: normalizeOptionalString(value.adminUrl),
    companyUrl: normalizeOptionalString(value.companyUrl),
    allowedOrigins: normalizeStringList(value.allowedOrigins),
  };
};

const getPackagedConfigPath = (): string | null => {
  const resourcesPath = process.resourcesPath;
  if (!resourcesPath) {
    return null;
  }

  return path.join(resourcesPath, PACKAGED_CONFIG_FILE_NAME);
};

export const loadDesktopRuntimeConfig = (
  configPath = getPackagedConfigPath(),
): DesktopRuntimeConfig => {
  if (!configPath || !fs.existsSync(configPath)) {
    return { allowedOrigins: [] };
  }

  try {
    return parseDesktopRuntimeConfig(
      JSON.parse(fs.readFileSync(configPath, "utf8")),
    );
  } catch (error) {
    console.warn(
      `[Desktop Config] Ignoring invalid packaged config at "${configPath}".`,
      error,
    );
    return { allowedOrigins: [] };
  }
};

const parseCsv = (value: string | undefined): readonly string[] =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

export const resolveDesktopConfig = (
  runtimeConfig: DesktopRuntimeConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedDesktopConfig => ({
  adminUrl: normalizeHttpUrl(
    runtimeConfig.adminUrl ?? env.KONFI_DESKTOP_ADMIN_URL ?? DEFAULT_ADMIN_URL,
    DEFAULT_ADMIN_URL,
  ),
  devAdminUrl: normalizeHttpUrl(
    env.KONFI_DESKTOP_DEV_ADMIN_URL ?? DEFAULT_DEV_ADMIN_URL,
    DEFAULT_DEV_ADMIN_URL,
  ),
  companyUrl: normalizeHttpUrl(
    runtimeConfig.companyUrl ??
      env.KONFI_DESKTOP_COMPANY_URL ??
      DEFAULT_COMPANY_URL,
    DEFAULT_COMPANY_URL,
  ),
  allowedOrigins: [
    ...runtimeConfig.allowedOrigins,
    ...parseCsv(env.KONFI_DESKTOP_ALLOWED_ORIGINS),
  ],
});

const desktopConfig = resolveDesktopConfig(loadDesktopRuntimeConfig());

export const ADMIN_URL = desktopConfig.adminUrl;

export const DEV_ADMIN_URL = desktopConfig.devAdminUrl;

export const COMPANY_URL = desktopConfig.companyUrl;

export const ALLOWED_ORIGINS = desktopConfig.allowedOrigins;
