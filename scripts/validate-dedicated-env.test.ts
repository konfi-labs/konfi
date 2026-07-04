import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const runValidator = (envFile: string, extraArgs: string[] = []) =>
  spawnSync(
    process.execPath,
    [
      "scripts/validate-dedicated-env.mjs",
      "--env-file",
      envFile,
      "--allow-placeholders",
      ...extraArgs,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

describe("validate dedicated env", () => {
  test("rejects the shared Konfi Cloud Firebase target", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "konfi-dedicated-env-"));
    const envFile = join(tempDir, ".env.production");

    try {
      const content = readFileSync(".env.example", "utf8")
        .replace(
          /^NEXT_PUBLIC_FIREBASE_PROJECT_ID=.*$/m,
          "NEXT_PUBLIC_FIREBASE_PROJECT_ID=konfi-cloud",
        )
        .replace(
          /^NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=.*$/m,
          "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=konfi-cloud.firebasestorage.app",
        );

      writeFileSync(envFile, content);

      const result = runValidator(envFile);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID must not be konfi-cloud",
      );
      expect(result.stdout).toContain(
        "Dedicated deployments must not target konfi-cloud.firebasestorage.app",
      );
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  test("rejects missing admin Fakturownia scheduled report env", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "konfi-dedicated-env-"));
    const envFile = join(tempDir, ".env.admin.production");

    try {
      const content = readFileSync(".env.example", "utf8")
        .replace(/^REPORT_EMAIL=.*\r?\n/m, "")
        .replace(/^FAKTUROWNIA_API_KEY=.*\r?\n/m, "")
        .replace(/^FAKTUROWNIA_SUBDOMAIN=.*\r?\n/m, "");

      writeFileSync(envFile, content);

      const result = runValidator(envFile, ["--scope", "admin"]);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "admin Fakturownia scheduled reports: missing REPORT_EMAIL",
      );
      expect(result.stdout).toContain(
        "admin Fakturownia scheduled reports: missing FAKTUROWNIA_API_KEY",
      );
      expect(result.stdout).toContain(
        "admin Fakturownia scheduled reports: missing FAKTUROWNIA_SUBDOMAIN",
      );
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
