import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

const auditModuleUrl = pathToFileURL(
  join(process.cwd(), "scripts", "audit-dedicated-release-gates.mjs"),
).href;

function withEnvFiles(
  callback: (files: {
    adminEnvFile: string;
    cooperationEnvFile: string;
    functionsEnvFile: string;
    storeEnvFile: string;
  }) => void,
) {
  const tempDir = mkdtempSync(join(tmpdir(), "konfi-dedicated-audit-"));
  const files = {
    adminEnvFile: join(tempDir, ".env.admin.production"),
    cooperationEnvFile: join(tempDir, ".env.admin.production"),
    functionsEnvFile: join(tempDir, ".env.functions.production"),
    storeEnvFile: join(tempDir, ".env.store.production"),
  };

  try {
    for (const file of new Set(Object.values(files))) {
      writeFileSync(file, "KONFI_DEPLOYMENT_MODE=dedicated\n");
    }

    return callback(files);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function runAuditModule<T>(body: string): T {
  const script = `
    import {
      auditDedicatedReleaseGates,
      parseArgs,
    } from ${JSON.stringify(auditModuleUrl)};

    const result = await (async () => {
      ${body}
    })();

    console.log(JSON.stringify(result));
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as T;
}

describe("audit dedicated release gates", () => {
  test("parses release gate arguments", () => {
    expect(
      runAuditModule(`
        return parseArgs([
          "--local-only",
          "--admin-env-file",
          ".env.admin.production",
          "--store-env-file=.env.store.production",
          "--functions-env-file",
          ".env.functions.production",
          "--cooperation-env-file=.env.admin.production",
          "--cloud-bridge-url",
          "https://cloud.example.test/smoke",
        ]);
      `),
    ).toMatchObject({
      adminEnvFile: ".env.admin.production",
      cloudBridgeUrl: "https://cloud.example.test/smoke",
      cooperationEnvFile: ".env.admin.production",
      functionsEnvFile: ".env.functions.production",
      localOnly: true,
      storeEnvFile: ".env.store.production",
    });
  });

  test("reports missing exported env files", () => {
    const issues = runAuditModule(`
      return auditDedicatedReleaseGates({
        options: parseArgs(["--local-only"]),
        processEnv: {},
        runner: () => ({ status: 0 }),
      });
    `);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("--admin-env-file"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("--store-env-file"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("--functions-env-file"),
        }),
      ]),
    );
  });

  test("passes local-only audit when env validators pass", () =>
    withEnvFiles((files) => {
      const result = runAuditModule<{
        callCount: number;
        issues: unknown[];
      }>(`
        const calls = [];
        const runner = (command, args) => {
          calls.push([command, args]);
          return { status: 0 };
        };

        return {
          issues: auditDedicatedReleaseGates({
            options: parseArgs([
              "--local-only",
              "--admin-env-file",
              ${JSON.stringify(files.adminEnvFile)},
              "--store-env-file",
              ${JSON.stringify(files.storeEnvFile)},
              "--functions-env-file",
              ${JSON.stringify(files.functionsEnvFile)},
            ]),
            processEnv: {},
            runner,
          }),
          callCount: calls.length,
        };
      `);

      expect(result.issues).toEqual([]);
      expect(result.callCount).toBe(3);
    }));

  test("requires live credentials and cooperation env outside local-only mode", () =>
    withEnvFiles((files) => {
      const result = runAuditModule<{
        callCount: number;
        issues: unknown[];
      }>(`
        const calls = [];
        const runner = (command, args) => {
          calls.push([command, args]);
          return { status: 0 };
        };

        return {
          issues: auditDedicatedReleaseGates({
            options: parseArgs([
              "--admin-env-file",
              ${JSON.stringify(files.adminEnvFile)},
              "--store-env-file",
              ${JSON.stringify(files.storeEnvFile)},
              "--functions-env-file",
              ${JSON.stringify(files.functionsEnvFile)},
              "--cooperation-env-file",
              ${JSON.stringify(files.cooperationEnvFile)},
            ]),
            processEnv: {},
            runner,
          }),
          callCount: calls.length,
        };
      `);

      expect(result.callCount).toBe(4);
      const { issues } = result;
      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            gate: "Admin and store Vercel smoke",
            severity: "error",
          }),
          expect.objectContaining({
            gate: "Firebase functions/rules/index smoke",
            severity: "error",
          }),
          expect.objectContaining({
            gate: "Konfi Cloud bridge smoke",
            severity: "error",
          }),
        ]),
      );
    }));
});
