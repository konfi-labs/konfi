import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadDesktopRuntimeConfig,
  resolveDesktopConfig,
  type DesktopRuntimeConfig,
} from "./constants";

const tempDirs: string[] = [];

const writeRuntimeConfig = (config: unknown): string => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "konfi-config-test-"));
  tempDirs.push(tempDir);

  const configPath = path.join(tempDir, "desktop-config.json");
  fs.writeFileSync(configPath, JSON.stringify(config), "utf8");
  return configPath;
};

describe("desktop constants", () => {
  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("uses packaged runtime config before process env for installed app URLs", () => {
    const runtimeConfig: DesktopRuntimeConfig = {
      adminUrl: "https://admin.example.test/",
      companyUrl: "https://help.example.test/",
      allowedOrigins: ["https://trusted.example.test"],
    };

    expect(
      resolveDesktopConfig(runtimeConfig, {
        KONFI_DESKTOP_ADMIN_URL: "http://localhost:3001",
        KONFI_DESKTOP_COMPANY_URL: "https://env-help.example.test",
        KONFI_DESKTOP_ALLOWED_ORIGINS: "https://env-origin.example.test",
      }),
    ).toEqual({
      adminUrl: "https://admin.example.test",
      devAdminUrl: "http://localhost:3001",
      companyUrl: "https://help.example.test",
      allowedOrigins: [
        "https://trusted.example.test",
        "https://env-origin.example.test",
      ],
    });
  });

  it("falls back to env and development localhost when no packaged config exists", () => {
    expect(
      resolveDesktopConfig(
        { allowedOrigins: [] },
        {
          KONFI_DESKTOP_ADMIN_URL: "https://admin.example.test/",
          KONFI_DESKTOP_COMPANY_URL: "https://help.example.test/",
        },
      ),
    ).toEqual({
      adminUrl: "https://admin.example.test",
      devAdminUrl: "http://localhost:3001",
      companyUrl: "https://help.example.test",
      allowedOrigins: [],
    });
  });

  it("loads generated packaged runtime config from disk", () => {
    const configPath = writeRuntimeConfig({
      adminUrl: "https://admin.example.test",
      companyUrl: "https://help.example.test",
      allowedOrigins: [
        "https://trusted.example.test",
        "",
        42,
        "https://other.example.test",
      ],
    });

    expect(loadDesktopRuntimeConfig(configPath)).toEqual({
      adminUrl: "https://admin.example.test",
      companyUrl: "https://help.example.test",
      allowedOrigins: [
        "https://trusted.example.test",
        "https://other.example.test",
      ],
    });
  });
});
